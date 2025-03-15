const mongoose = require('mongoose');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const gridfs = require('../utils/gridfs');
const Report = require('../models/Report');
const photoAnalysisService = require('../services/photoAnalysisService');

/**
 * Upload photos for a report
 * @route POST /api/photos/upload
 * @access Private
 */
const uploadPhotos = async (req, res) => {
  try {
    // Validate request
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'No photos uploaded' });
    }
    
    if (!req.body.reportId) {
      return res.status(400).json({ error: 'Report ID is required' });
    }
    
    const reportId = req.body.reportId;
    logger.info(`Uploading ${req.files.length} photos for report ${reportId}`);
    
    // Find report
    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    // Get client IDs if provided
    const clientIds = req.body.clientIds ? 
      (Array.isArray(req.body.clientIds) ? req.body.clientIds : [req.body.clientIds]) : 
      [];
    
    logger.info(`Received ${clientIds.length} client IDs for ${req.files.length} files`);
    
    // Process each file
    const uploadedPhotos = [];
    const idMapping = {}; // Map client IDs to server IDs
    
    for (let i = 0; i < req.files.length; i++) {
      const file = req.files[i];
      // Get the client ID for this file if available
      const clientId = i < clientIds.length ? clientIds[i] : null;
      
      try {
        // Upload file to GridFS
        const fileInfo = await gridfs.uploadBuffer(file.buffer, {
          filename: `${reportId}_${Date.now()}_${file.originalname}`,
          contentType: file.mimetype,
          metadata: {
            reportId,
            originalName: file.originalname,
            uploadDate: new Date(),
            clientId // Store the client ID in metadata
          }
        });
        
        // Create photo object directly for the report
        const photo = {
          _id: fileInfo.id,
          fileId: fileInfo.id,
          filename: fileInfo.filename,
          originalName: file.originalname,
          contentType: file.mimetype,
          path: `/api/photos/${fileInfo.id}`,
          status: 'pending',
          uploadDate: new Date(),
          clientId // Include the client ID in the photo object
        };
        
        // Add photo to uploadedPhotos array
        uploadedPhotos.push(photo);
        
        // Create mapping from client ID to server ID if client ID was provided
        if (clientId) {
          idMapping[clientId] = fileInfo.id;
        }
        
        // If file was saved to temp directory, clean it up
        if (file.path) {
          try {
            await fsPromises.unlink(file.path);
            logger.debug(`Deleted temporary file: ${file.path}`);
          } catch (unlinkError) {
            logger.warn(`Failed to delete temporary file ${file.path}: ${unlinkError.message}`);
          }
        }
      } catch (fileError) {
        logger.error(`Error processing file ${file.originalname}: ${fileError.message}`);
      }
    }
    
    // Add photos to report
    report.photos = [...report.photos, ...uploadedPhotos];
    await report.save();
    
    return res.status(200).json({
      message: `Successfully uploaded ${uploadedPhotos.length} photos`,
      photos: uploadedPhotos,
      idMapping // Include the ID mapping in the response
    });
  } catch (error) {
    logger.error(`Error in uploadPhotos: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Get a photo (original or thumbnail)
 * @route GET /api/photos/:id
 * @access Public
 */
const getPhoto = async (req, res) => {
  try {
    const photoId = req.params.id;
    const size = req.query.size || 'original'; // 'original', 'thumbnail'
    
    logger.info(`API Request: GET /${photoId} ${JSON.stringify(req.query)}`);
    
    // Validate that the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(photoId)) {
      logger.error(`Invalid ObjectId format: ${photoId}`);
      return res.status(400).json({ error: 'Invalid photo ID format' });
    }

    // First try to find the photo in a report
    let fileId = photoId;
    
    // If thumbnail is requested, check if it exists in GridFS with a modified filename
    if (size === 'thumbnail') {
      try {
        const thumbnailId = `thumb_${fileId}`;
        // Only proceed if thumbnailId is a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(thumbnailId)) {
          await gridfs.streamToResponse(thumbnailId, res);
        } else {
          // Fall back to original if thumbnail ID is not valid
          await gridfs.streamToResponse(fileId, res);
        }
      } catch (error) {
        // If thumbnail doesn't exist, fall back to original
        logger.info(`Thumbnail not found for ${fileId}, serving original: ${error.message}`);
        await gridfs.streamToResponse(fileId, res);
      }
    } else {
      // Stream the original photo
      await gridfs.streamToResponse(fileId, res);
    }
  } catch (error) {
    logger.error(`Error getting photo: ${error.message}`);
    if (!res.headersSent) {
      res.status(404).json({ error: 'Photo not found' });
    }
  }
};

/**
 * Delete a photo
 * @route DELETE /api/photos/:id
 * @access Private
 */
const deletePhoto = async (req, res) => {
  try {
    const photoId = req.params.id;

    // Find the report containing this photo
    const report = await Report.findOne({ "photos._id": new mongoose.Types.ObjectId(photoId) });
    if (!report) {
      return res.status(404).json({ error: 'Photo not found in any report' });
    }

    // Check if user owns the report (if authentication is implemented)
    if (req.user && report.user && report.user.toString() !== req.user.id) {
      return res.status(401).json({ error: 'Not authorized to delete this photo' });
    }

    // Remove photo reference from report
    report.photos = report.photos.filter(photo => photo._id.toString() !== photoId);
    await report.save();

    // Delete the photo from GridFS
    await gridfs.deleteFile(photoId);

    // Also try to delete thumbnail if it exists
    try {
      const thumbnailId = `thumb_${photoId}`;
      await gridfs.deleteFile(thumbnailId);
    } catch (error) {
      // Ignore errors if thumbnail doesn't exist
      logger.info(`No thumbnail found for ${photoId} or error deleting it: ${error.message}`);
    }

    return res.status(200).json({
      message: 'Photo deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting photo: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
};

/**
 * Analyze photos with AI
 * @route POST /api/photos/analyze
 * @access Private
 */
const analyzePhotos = async (req, res) => {
  // Start timing the function execution
  const startTime = Date.now();
  logger.info(`[TIMING] Starting photo analysis at: ${new Date().toISOString()}`);
  
  try {
    let photos = [];
    let reportId = req.params.reportId;
    let report = null;
    
    // Log the request for debugging
    console.log(`Photo analysis request for report ${reportId}:`, {
      body: req.body,
      query: req.query,
      params: req.params
    });
    
    if (!reportId) {
      return res.status(400).json({ error: 'Report ID is required' });
    }
    
    logger.info(`[TIMING] Finding report - elapsed: ${(Date.now() - startTime)/1000}s`);
    report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    // Log the report photos for debugging
    console.log(`Found report with ${report.photos?.length || 0} photos`);
    logger.info(`[TIMING] Found report - elapsed: ${(Date.now() - startTime)/1000}s`);
    
    // Check if specific photo ID is provided
    if (req.body.photoId) {
      const photo = report.photos.find(p => p._id.toString() === req.body.photoId);
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found in report' });
      }
      photos = [photo];
    } 
    // Check if array of photo IDs is provided
    else if (req.body.photoIds && Array.isArray(req.body.photoIds)) {
      photos = report.photos.filter(p => req.body.photoIds.includes(p._id.toString()));
      console.log(`Found ${photos.length} photos matching the provided photoIds`);
      
      // Limit to 1 photo per batch to avoid timeouts on Vercel
      const batchSize = 1;
      if (photos.length > batchSize) {
        logger.info(`Limiting analysis to ${batchSize} photo per batch to avoid timeouts`);
        photos = photos.slice(0, batchSize);
      }
    } 
    // If no specific photos requested, analyze all unanalyzed photos
    else {
      photos = report.photos.filter(p => !p.aiAnalysis || !p.aiAnalysis.description);
      console.log(`Found ${photos.length} unanalyzed photos`);
      
      // Limit to 1 photo per batch to avoid timeouts on Vercel
      const batchSize = 1;
      if (photos.length > batchSize) {
        logger.info(`Limiting analysis to ${batchSize} photo per batch to avoid timeouts`);
        photos = photos.slice(0, batchSize);
      }
    }
    
    if (photos.length === 0) {
      return res.status(404).json({ error: 'No photos found to analyze' });
    }
    
    logger.info(`[TIMING] Starting analysis of ${photos.length} photos - elapsed: ${(Date.now() - startTime)/1000}s`);
    
    const results = [];
    
    for (const photo of photos) {
      try {
        // Add a clear separator for each photo in the logs
        console.log("\n===========================================================");
        console.log(`[PHOTO ANALYSIS] STARTING ANALYSIS FOR PHOTO: ${photo._id}`);
        console.log(`[PHOTO ANALYSIS] TIMESTAMP: ${new Date().toISOString()}`);
        console.log("===========================================================\n");
        
        logger.info(`[TIMING] Processing photo ${photo._id} - elapsed: ${(Date.now() - startTime)/1000}s`);
        
        // Create a temporary file in /tmp directory
        const tempFilePath = `/tmp/${photo._id}.jpg`;
        
        // Get the file from GridFS and save to temp file
        const bucket = await gridfs.initGridFS();
        logger.info(`[TIMING] GridFS initialized - elapsed: ${(Date.now() - startTime)/1000}s`);
        
        const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(photo._id));
        const writeStream = fs.createWriteStream(tempFilePath);
        
        logger.info(`[TIMING] Starting file download - elapsed: ${(Date.now() - startTime)/1000}s`);
        await new Promise((resolve, reject) => {
          downloadStream.pipe(writeStream)
            .on('error', reject)
            .on('finish', resolve);
        });
        logger.info(`[TIMING] File download complete - elapsed: ${(Date.now() - startTime)/1000}s`);
        
        // Get file stats to log the file size
        const fileStats = await fsPromises.stat(tempFilePath);
        console.log(`[PHOTO ANALYSIS] Downloaded file size: ${Math.round(fileStats.size/1024)} KB (${Math.round(fileStats.size/1024/1024 * 100) / 100} MB)`);
        
        // Analyze the photo
        console.log(`[PHOTO ANALYSIS] Starting OpenAI analysis at ${new Date().toISOString()}`);
        logger.info(`[TIMING] Starting AI analysis - elapsed: ${(Date.now() - startTime)/1000}s`);
        const analysisStartTime = Date.now();
        const analysisResult = await photoAnalysisService.analyzePhoto(tempFilePath);
        const analysisTime = (Date.now() - analysisStartTime)/1000;
        console.log(`[PHOTO ANALYSIS] Completed OpenAI analysis in ${analysisTime}s at ${new Date().toISOString()}`);
        logger.info(`[TIMING] AI analysis complete - elapsed: ${(Date.now() - startTime)/1000}s`);
        
        // Find the photo in the report and update it
        const photoIndex = report.photos.findIndex(p => p._id.toString() === photo._id.toString());
        if (photoIndex !== -1) {
          report.photos[photoIndex].aiAnalysis = analysisResult;
          report.photos[photoIndex].status = 'analyzed';
          report.photos[photoIndex].analysisDate = new Date();
        }
        
        // Save the updated report
        console.log(`[PHOTO ANALYSIS] Saving analysis results to database at ${new Date().toISOString()}`);
        logger.info(`[TIMING] Saving report - elapsed: ${(Date.now() - startTime)/1000}s`);
        await report.save();
        logger.info(`[TIMING] Report saved - elapsed: ${(Date.now() - startTime)/1000}s`);
        
        results.push({
          photoId: photo._id,
          status: 'success',
          analysis: analysisResult
        });
        
        // Clean up temp file
        try {
          await fsPromises.unlink(tempFilePath);
          logger.debug(`Deleted temporary file: ${tempFilePath}`);
        } catch (unlinkError) {
          logger.warn(`Failed to delete temporary file ${tempFilePath}: ${unlinkError.message}`);
        }
        
        // Add a clear end separator for this photo
        console.log("\n===========================================================");
        console.log(`[PHOTO ANALYSIS] COMPLETED ANALYSIS FOR PHOTO: ${photo._id}`);
        console.log(`[PHOTO ANALYSIS] TOTAL TIME: ${(Date.now() - analysisStartTime)/1000}s`);
        console.log(`[PHOTO ANALYSIS] TIMESTAMP: ${new Date().toISOString()}`);
        console.log("===========================================================\n");
      } catch (error) {
        logger.error(`Error analyzing photo ${photo._id}: ${error.message}`);
        logger.error(`[TIMING] Error occurred at elapsed time: ${(Date.now() - startTime)/1000}s`);
        console.log(`[PHOTO ANALYSIS] ERROR analyzing photo ${photo._id}: ${error.message}`);
        results.push({
          photoId: photo._id,
          status: 'error',
          error: error.message
        });
      }
    }
    
    const totalTime = (Date.now() - startTime)/1000;
    logger.info(`[TIMING] Total execution time: ${totalTime}s`);
    
    return res.status(200).json({
      message: `Analyzed ${results.length} photos in ${totalTime}s`,
      results,
      executionTime: totalTime,
      batchComplete: true,
      totalPhotosRemaining: req.body.photoIds ? 
        req.body.photoIds.length - photos.length : 
        report.photos.filter(p => !p.aiAnalysis || !p.aiAnalysis.description).length - photos.length
    });
  } catch (error) {
    const errorTime = (Date.now() - startTime)/1000;
    logger.error(`Error in analyzePhotos: ${error.message}`);
    logger.error(`[TIMING] Error occurred at elapsed time: ${errorTime}s`);
    return res.status(500).json({ 
      error: error.message,
      executionTime: errorTime
    });
  }
};

/**
 * Initialize a chunked upload
 * @route POST /api/photos/upload-chunk/init
 * @access Private
 */
const initChunkedUpload = async (req, res) => {
  try {
    // Validate request
    if (!req.body.reportId) {
      return res.status(400).json({ error: 'Report ID is required' });
    }
    
    if (!req.body.totalChunks || parseInt(req.body.totalChunks) <= 0) {
      return res.status(400).json({ error: 'Valid total chunks count is required' });
    }
    
    if (!req.body.filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }
    
    const reportId = req.body.reportId;
    const totalChunks = parseInt(req.body.totalChunks);
    const filename = req.body.filename;
    const contentType = req.body.contentType || 'application/octet-stream';
    const clientId = req.body.clientId || null;
    
    // Find report
    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    // Generate a unique file ID
    const fileId = uuidv4();
    
    // Initialize chunked upload session
    const session = await gridfs.createChunkedUploadSession(fileId, {
      totalChunks,
      filename: `${reportId}_${Date.now()}_${filename}`,
      contentType,
      metadata: {
        reportId,
        originalName: filename,
        uploadDate: new Date(),
        clientId
      }
    });
    
    logger.info(`Initialized chunked upload for file ${filename} with ${totalChunks} chunks`);
    
    res.status(200).json({
      fileId,
      totalChunks,
      filename,
      status: 'initialized'
    });
  } catch (error) {
    logger.error(`Error initializing chunked upload: ${error.message}`);
    res.status(500).json({ error: 'Failed to initialize chunked upload' });
  }
};

/**
 * Upload a chunk
 * @route POST /api/photos/upload-chunk
 * @access Private
 */
const uploadChunk = async (req, res) => {
  try {
    // Validation is done in middleware
    const { fileId, chunkIndex, totalChunks } = req.body;
    
    // Write chunk to session
    const chunkStatus = await gridfs.writeChunk(fileId, chunkIndex, req.file.buffer);
    
    logger.info(`Uploaded chunk ${chunkIndex + 1}/${totalChunks} for file ${fileId}`);
    
    res.status(200).json(chunkStatus);
  } catch (error) {
    logger.error(`Error uploading chunk: ${error.message}`);
    res.status(500).json({ error: 'Failed to upload chunk' });
  }
};

/**
 * Complete a chunked upload
 * @route POST /api/photos/complete-upload
 * @access Private
 */
const completeChunkedUpload = async (req, res) => {
  try {
    // Validate request
    if (!req.body.fileId) {
      return res.status(400).json({ error: 'File ID is required' });
    }
    
    if (!req.body.reportId) {
      return res.status(400).json({ error: 'Report ID is required' });
    }
    
    const fileId = req.body.fileId;
    const reportId = req.body.reportId;
    
    // Find report
    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
    // Complete the chunked upload
    const fileInfo = await gridfs.completeChunkedUpload(fileId);
    
    // Create photo object for the report
    const photo = {
      _id: fileInfo.id,
      fileId: fileInfo.id,
      filename: fileInfo.filename,
      originalName: fileInfo.metadata.originalName,
      contentType: fileInfo.contentType,
      path: `/api/photos/${fileInfo.id}`,
      status: 'pending',
      uploadDate: new Date(),
      clientId: fileInfo.metadata.clientId
    };
    
    // Add photo to report
    report.photos.push(photo);
    await report.save();
    
    logger.info(`Completed chunked upload for file ${fileId}, added to report ${reportId}`);
    
    res.status(200).json({
      success: true,
      photo
    });
  } catch (error) {
    logger.error(`Error completing chunked upload: ${error.message}`);
    res.status(500).json({ error: 'Failed to complete chunked upload' });
  }
};

module.exports = {
  uploadPhotos,
  getPhoto,
  deletePhoto,
  analyzePhotos,
  initChunkedUpload,
  uploadChunk,
  completeChunkedUpload
}; 