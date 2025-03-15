const mongoose = require('mongoose');
const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const gridfs = require('../utils/gridfs');
const Report = require('../models/Report');
const photoAnalysisService = require('../services/photoAnalysisService');
const photoFileManager = require('../utils/photoFileManager');
const apiResponse = require('../utils/apiResponse');

/**
 * Upload photos for a report
 * @route POST /api/photos/upload
 * @access Private
 */
const uploadPhotos = async (req, res) => {
  try {
    // Validate request
    if (!req.files || req.files.length === 0) {
      return apiResponse.send(res, apiResponse.error('No photos uploaded', null, 400));
    }
    
    if (!req.body.reportId) {
      return apiResponse.send(res, apiResponse.error('Report ID is required', null, 400));
    }
    
    const reportId = req.body.reportId;
    logger.info(`Uploading ${req.files.length} photos for report ${reportId}`);
    
    // Find report
    const report = await Report.findById(reportId);
    if (!report) {
      return apiResponse.send(res, apiResponse.error('Report not found', null, 404));
    }
    
    // Get client ID - support both array and single value
    let clientId = req.body.clientId || null;
    
    // If clientIds was provided as an array, use that instead
    const clientIds = req.body.clientIds ? 
      (Array.isArray(req.body.clientIds) ? req.body.clientIds : [req.body.clientIds]) : 
      [];
    
    logger.debug(`Received client ID: ${clientId}, and ${clientIds.length} client IDs for ${req.files.length} files`);
    
    // Process each file in parallel
    const processFile = async (file, index) => {
      try {
        // Determine the client ID for this file
        const fileClientId = (req.files.length === 1 && clientId) ? 
                          clientId : 
                          (index < clientIds.length ? clientIds[index] : null);
        
        // Upload file to GridFS
        const fileInfo = await gridfs.uploadBuffer(file.buffer, {
          filename: `${reportId}_${Date.now()}_${file.originalname}`,
          contentType: file.mimetype,
          metadata: {
            reportId,
            originalName: file.originalname,
            uploadDate: new Date(),
            clientId: fileClientId
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
          clientId: fileClientId
        };
        
        // Clean up temp file if it exists
        if (file.path) {
          await photoFileManager.cleanupTempFile(file.path);
        }
        
        return {
          photo,
          clientId: fileClientId,
          id: fileInfo.id
        };
      } catch (error) {
        logger.error(`Error processing file ${file.originalname}: ${error.message}`);
        return null;
      }
    };
    
    // Process files in parallel with a reasonable batch size
    const uploadResults = await Promise.all(
      req.files.map((file, index) => processFile(file, index))
    );
    
    // Filter out failed uploads and extract photos
    const successfulUploads = uploadResults.filter(result => result !== null);
    const uploadedPhotos = successfulUploads.map(result => result.photo);
    
    // Create mapping from client ID to server ID
    const idMapping = {};
    successfulUploads.forEach(result => {
      if (result.clientId) {
        idMapping[result.clientId] = result.id;
      }
    });
    
    // Add photos to report - use findOneAndUpdate to avoid version conflicts
    try {
      // Use findOneAndUpdate instead of save to avoid version conflicts
      const updatedReport = await Report.findOneAndUpdate(
        { _id: reportId },
        { $push: { photos: { $each: uploadedPhotos } } },
        { new: true }
      );
      
      if (!updatedReport) {
        logger.error(`Report not found during update: ${reportId}`);
        return apiResponse.send(res, apiResponse.error('Report not found during update', null, 404));
      }
      
      logger.info(`Successfully uploaded ${uploadedPhotos.length} photos to report ${reportId}`);
      
      // Return success response
      return apiResponse.send(res, apiResponse.success(
        {
          photos: uploadedPhotos,
          idMapping
        },
        `Successfully uploaded ${uploadedPhotos.length} photos`,
        {
          total: req.files.length,
          successful: uploadedPhotos.length,
          failed: req.files.length - uploadedPhotos.length
        }
      ));
    } catch (error) {
      logger.error(`Error updating report with photos: ${error.message}`);
      return apiResponse.send(res, apiResponse.error(
        'Failed to update report with photos',
        { message: error.message },
        500
      ));
    }
  } catch (error) {
    logger.error(`Error uploading photos: ${error.message}`);
    return apiResponse.send(res, apiResponse.error(
      'Failed to upload photos',
      { message: error.message },
      500
    ));
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
    
    logger.debug(`Getting photo ${photoId} with size ${size}`);
    
    // Validate that the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(photoId)) {
      logger.error(`Invalid ObjectId format: ${photoId}`);
      return apiResponse.send(res, apiResponse.error('Invalid photo ID format', null, 400));
    }

    // First try to find the photo in a report
    let fileId = photoId;
    
    // If thumbnail is requested, try to serve a thumbnail
    try {
      if (size === 'thumbnail') {
        const thumbnailId = `thumb_${fileId}`;
        // Only proceed if thumbnailId is a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(thumbnailId)) {
          try {
            await gridfs.streamToResponse(thumbnailId, res);
            return; // Successfully streamed thumbnail
          } catch (thumbError) {
            logger.debug(`Thumbnail not found for ${fileId}, serving original`);
            // Fall back to original if error occurs
          }
        }
      }
      
      // Stream the original photo
      await gridfs.streamToResponse(fileId, res);
    } catch (error) {
      logger.error(`Error streaming photo ${photoId}: ${error.message}`);
      if (!res.headersSent) {
        apiResponse.send(res, apiResponse.error('Photo not found', null, 404));
      }
    }
  } catch (error) {
    logger.error(`Error in getPhoto: ${error.message}`);
    if (!res.headersSent) {
      apiResponse.send(res, apiResponse.error('Error retrieving photo', { message: error.message }, 500));
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

    // Validate photo ID
    if (!mongoose.Types.ObjectId.isValid(photoId)) {
      return apiResponse.send(res, apiResponse.error('Invalid photo ID format', null, 400));
    }

    // Find the report containing this photo
    const report = await Report.findOne({ "photos._id": new mongoose.Types.ObjectId(photoId) });
    if (!report) {
      return apiResponse.send(res, apiResponse.error('Photo not found in any report', null, 404));
    }

    // Check if user owns the report (if authentication is implemented)
    if (req.user && report.user && report.user.toString() !== req.user.id) {
      return apiResponse.send(res, apiResponse.error('Not authorized to delete this photo', null, 401));
    }

    // Remove photo reference from report
    report.photos = report.photos.filter(photo => photo._id.toString() !== photoId);
    await report.save();

    // Delete the photo from GridFS
    await gridfs.deleteFile(photoId);

    // Also try to delete thumbnail if it exists
    try {
      const thumbnailId = `thumb_${photoId}`;
      if (mongoose.Types.ObjectId.isValid(thumbnailId)) {
        await gridfs.deleteFile(thumbnailId);
      }
    } catch (error) {
      // Ignore errors if thumbnail doesn't exist
      logger.debug(`No thumbnail found for ${photoId} or error deleting it: ${error.message}`);
    }

    return apiResponse.send(res, apiResponse.success(
      { photoId },
      'Photo deleted successfully'
    ));
  } catch (error) {
    logger.error(`Error deleting photo: ${error.message}`);
    return apiResponse.send(res, apiResponse.error(
      'Failed to delete photo',
      { message: error.message },
      500
    ));
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
  logger.info(`Starting photo analysis at: ${new Date().toISOString()}`);
  
  try {
    const reportId = req.params.reportId;
    
    // Validate report ID
    if (!reportId) {
      return apiResponse.send(res, apiResponse.error('Report ID is required', null, 400));
    }
    
    // Find report
    const report = await Report.findById(reportId);
    if (!report) {
      return apiResponse.send(res, apiResponse.error('Report not found', null, 404));
    }
    
    logger.info(`Found report with ${report.photos?.length || 0} photos`);
    
    // Determine which photos to analyze
    let photosToAnalyze = [];
    
    // Check if specific photo ID is provided
    if (req.body.photoId) {
      const photo = report.photos.find(p => p._id.toString() === req.body.photoId);
      if (!photo) {
        return apiResponse.send(res, apiResponse.error('Photo not found in report', null, 404));
      }
      photosToAnalyze = [photo];
    } 
    // Check if array of photo IDs is provided
    else if (req.body.photoIds && Array.isArray(req.body.photoIds)) {
      photosToAnalyze = report.photos.filter(p => req.body.photoIds.includes(p._id.toString()));
      
      // Limit batch size to avoid timeouts (configurable)
      const batchSize = parseInt(req.query.batchSize) || 1;
      if (photosToAnalyze.length > batchSize) {
        logger.info(`Limiting analysis to ${batchSize} photos per batch`);
        photosToAnalyze = photosToAnalyze.slice(0, batchSize);
      }
    } 
    // If no specific photos requested, analyze all unanalyzed photos
    else {
      photosToAnalyze = report.photos.filter(p => !p.aiAnalysis || !p.aiAnalysis.description);
      
      // Limit batch size to avoid timeouts (configurable)
      const batchSize = parseInt(req.query.batchSize) || 1;
      if (photosToAnalyze.length > batchSize) {
        logger.info(`Limiting analysis to ${batchSize} photos per batch`);
        photosToAnalyze = photosToAnalyze.slice(0, batchSize);
      }
    }
    
    if (photosToAnalyze.length === 0) {
      return apiResponse.send(res, apiResponse.error('No photos found to analyze', null, 404));
    }
    
    logger.info(`Starting analysis of ${photosToAnalyze.length} photos`);
    
    // Define the photo processing function
    const processPhoto = async (photo) => {
      try {
        logger.info(`Processing photo ${photo._id}`);
        
        // Download the photo to a temp file
        const tempFileInfo = await photoFileManager.downloadToTempFile(photo._id);
        
        // Analyze the photo
        logger.info(`Starting AI analysis for photo ${photo._id}`);
        const analysisStartTime = Date.now();
        const analysisResult = await photoAnalysisService.analyzePhoto(tempFileInfo.path);
        const analysisTime = (Date.now() - analysisStartTime)/1000;
        logger.info(`Completed AI analysis in ${analysisTime}s`);
        
        // Update photo in the report
        const photoIndex = report.photos.findIndex(p => p._id.toString() === photo._id.toString());
        if (photoIndex !== -1) {
          report.photos[photoIndex].aiAnalysis = analysisResult;
          report.photos[photoIndex].status = 'analyzed';
          report.photos[photoIndex].analysisDate = new Date();
        }
        
        // Clean up the temp file
        await photoFileManager.cleanupTempFile(tempFileInfo.path);
        
        return {
          photoId: photo._id,
          status: 'success',
          analysis: analysisResult
        };
      } catch (error) {
        logger.error(`Error analyzing photo ${photo._id}: ${error.message}`);
        return {
          photoId: photo._id,
          status: 'error',
          error: error.message
        };
      }
    };
    
    // Process photos with parallel processing utility
    const results = await photoFileManager.processPhotosInParallel(
      photosToAnalyze,
      processPhoto,
      {
        batchSize: 1, // Process one at a time for now due to API limits
        shouldAbortOnError: false
      }
    );
    
    // Save the updated report
    await report.save();
    
    const totalTime = (Date.now() - startTime)/1000;
    logger.info(`Total execution time: ${totalTime}s`);
    
    // Calculate remaining photos
    const remainingCount = req.body.photoIds ? 
      req.body.photoIds.length - photosToAnalyze.length : 
      report.photos.filter(p => !p.aiAnalysis || !p.aiAnalysis.description).length - photosToAnalyze.length;
    
    // Return success response
    return apiResponse.send(res, apiResponse.success(
      { results },
      `Analyzed ${results.length} photos in ${totalTime}s`,
      {
        executionTime: totalTime,
        batchComplete: true,
        totalPhotosRemaining: remainingCount
      }
    ));
  } catch (error) {
    const errorTime = (Date.now() - startTime)/1000;
    logger.error(`Error in analyzePhotos: ${error.message}`);
    
    return apiResponse.send(res, apiResponse.error(
      'Failed to analyze photos',
      { message: error.message, executionTime: errorTime },
      500
    ));
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
      return apiResponse.send(res, apiResponse.error('Report ID is required', null, 400));
    }
    
    if (!req.body.totalChunks || parseInt(req.body.totalChunks) <= 0) {
      return apiResponse.send(res, apiResponse.error('Valid total chunks count is required', null, 400));
    }
    
    if (!req.body.filename) {
      return apiResponse.send(res, apiResponse.error('Filename is required', null, 400));
    }
    
    const reportId = req.body.reportId;
    const totalChunks = parseInt(req.body.totalChunks);
    const filename = req.body.filename;
    const contentType = req.body.contentType || 'application/octet-stream';
    const clientId = req.body.clientId || null;
    
    // Find report
    const report = await Report.findById(reportId);
    if (!report) {
      return apiResponse.send(res, apiResponse.error('Report not found', null, 404));
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
    
    return apiResponse.send(res, apiResponse.success({
      fileId,
      totalChunks,
      filename,
      status: 'initialized'
    }));
  } catch (error) {
    logger.error(`Error initializing chunked upload: ${error.message}`);
    return apiResponse.send(res, apiResponse.error('Failed to initialize chunked upload', { message: error.message }, 500));
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
    
    return apiResponse.send(res, apiResponse.success(chunkStatus));
  } catch (error) {
    logger.error(`Error uploading chunk: ${error.message}`);
    return apiResponse.send(res, apiResponse.error('Failed to upload chunk', { message: error.message }, 500));
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
      return apiResponse.send(res, apiResponse.error('File ID is required', null, 400));
    }
    
    if (!req.body.reportId) {
      return apiResponse.send(res, apiResponse.error('Report ID is required', null, 400));
    }
    
    const fileId = req.body.fileId;
    const reportId = req.body.reportId;
    
    // Find report
    const report = await Report.findById(reportId);
    if (!report) {
      return apiResponse.send(res, apiResponse.error('Report not found', null, 404));
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
    
    return apiResponse.send(res, apiResponse.success({
      photo
    }, 'Chunked upload completed successfully'));
  } catch (error) {
    logger.error(`Error completing chunked upload: ${error.message}`);
    return apiResponse.send(res, apiResponse.error('Failed to complete chunked upload', { message: error.message }, 500));
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