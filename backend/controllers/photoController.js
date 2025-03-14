const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
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
    
    // Process each file
    const uploadedPhotos = [];
    
    for (const file of req.files) {
      try {
        // Upload file to GridFS
        const fileInfo = await gridfs.uploadBuffer(file.buffer, {
          filename: `${reportId}_${Date.now()}_${file.originalname}`,
          contentType: file.mimetype,
          metadata: {
            reportId,
            originalName: file.originalname,
            uploadDate: new Date()
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
          uploadDate: new Date()
        };
        
        // Add photo to uploadedPhotos array
        uploadedPhotos.push(photo);
        
        // If file was saved to temp directory, clean it up
        if (file.path) {
          try {
            await fs.unlink(file.path);
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
      photos: uploadedPhotos
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
  try {
    let photos = [];
    let reportId = req.params.reportId;
    let report = null;
    
    if (!reportId) {
      return res.status(400).json({ error: 'Report ID is required' });
    }
    
    report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }
    
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
    } 
    // If no specific photos requested, analyze all unanalyzed photos
    else {
      photos = report.photos.filter(p => !p.aiAnalysis || !p.aiAnalysis.description);
    }
    
    if (photos.length === 0) {
      return res.status(404).json({ error: 'No photos found to analyze' });
    }
    
    logger.info(`Analyzing ${photos.length} photos for report ${reportId}`);
    
    const results = [];
    
    for (const photo of photos) {
      try {
        // Create a temporary file in /tmp directory
        const tempFilePath = `/tmp/${photo._id}.jpg`;
        
        // Get the file from GridFS and save to temp file
        const bucket = await gridfs.initGridFS();
        const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(photo._id));
        const writeStream = fs.createWriteStream(tempFilePath);
        
        await new Promise((resolve, reject) => {
          downloadStream.pipe(writeStream)
            .on('error', reject)
            .on('finish', resolve);
        });
        
        // Analyze the photo
        const analysisResult = await photoAnalysisService.analyzePhoto(tempFilePath);
        
        // Find the photo in the report and update it
        const photoIndex = report.photos.findIndex(p => p._id.toString() === photo._id.toString());
        if (photoIndex !== -1) {
          report.photos[photoIndex].aiAnalysis = analysisResult;
          report.photos[photoIndex].status = 'analyzed';
          report.photos[photoIndex].analysisDate = new Date();
        }
        
        // Save the updated report
        await report.save();
        
        results.push({
          photoId: photo._id,
          status: 'success',
          analysis: analysisResult
        });
        
        // Clean up temp file
        try {
          await fs.unlink(tempFilePath);
          logger.debug(`Deleted temporary file: ${tempFilePath}`);
        } catch (unlinkError) {
          logger.warn(`Failed to delete temporary file ${tempFilePath}: ${unlinkError.message}`);
        }
      } catch (error) {
        logger.error(`Error analyzing photo ${photo._id}: ${error.message}`);
        results.push({
          photoId: photo._id,
          status: 'error',
          error: error.message
        });
      }
    }
    
    return res.status(200).json({
      message: `Analyzed ${results.length} photos`,
      results
    });
  } catch (error) {
    logger.error(`Error in analyzePhotos: ${error.message}`);
    return res.status(500).json({ error: error.message });
  }
};

module.exports = {
  uploadPhotos,
  getPhoto,
  deletePhoto,
  analyzePhotos
}; 