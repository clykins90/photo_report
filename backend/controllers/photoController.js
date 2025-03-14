const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const gridfs = require('../utils/gridfs');
const Report = require('../models/Report');
const photoAnalysisService = require('../services/photoAnalysisService');
const Photo = require('../models/Photo');

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
        
        // Create photo object
        const photo = new Photo({
          fileId: fileInfo.id,
          filename: fileInfo.filename,
          originalName: file.originalname,
          contentType: file.mimetype,
          report: reportId,
          status: 'pending',
          uploadDate: new Date()
        });
        
        // Save photo
        await photo.save();
        uploadedPhotos.push(photo);
        
        // If file was saved to temp directory, clean it up
        if (file.path) {
          try {
            fs.unlinkSync(file.path);
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
    report.photos = [...report.photos, ...uploadedPhotos.map(p => p._id)];
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

    // First try to find the photo in our database
    let photo;
    let fileId;
    
    try {
      // Check if the ID is a valid ObjectId
      if (mongoose.Types.ObjectId.isValid(photoId)) {
        photo = await Photo.findById(photoId);
        if (photo) {
          fileId = photo.fileId;
        }
      }
    } catch (findError) {
      logger.debug(`Photo not found in database with ID ${photoId}: ${findError.message}`);
    }
    
    // If we couldn't find the photo in our database, use the ID directly as the fileId
    if (!fileId) {
      fileId = photoId;
    }

    // If thumbnail is requested, check if it exists in GridFS with a modified filename
    if (size === 'thumbnail') {
      try {
        const thumbnailId = `thumb_${fileId}`;
        await gridfs.streamToResponse(thumbnailId, res);
      } catch (error) {
        // If thumbnail doesn't exist, fall back to original
        logger.info(`Thumbnail not found for ${fileId}, serving original`);
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

    // Find the photo in our database
    const photo = await Photo.findById(photoId);
    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Find the report associated with this photo
    const report = await Report.findById(photo.report);
    if (!report) {
      return res.status(404).json({ error: 'Associated report not found' });
    }

    // Check if user owns the report (if authentication is implemented)
    if (req.user && report.user && report.user.toString() !== req.user.id) {
      return res.status(401).json({ error: 'Not authorized to delete this photo' });
    }

    // Remove photo reference from report
    report.photos = report.photos.filter(id => id.toString() !== photoId);
    await report.save();

    // Delete the photo from GridFS
    await gridfs.deleteFile(photo.fileId);

    // Also try to delete thumbnail if it exists
    try {
      const thumbnailId = `thumb_${photo.fileId}`;
      await gridfs.deleteFile(thumbnailId);
    } catch (error) {
      // Ignore errors if thumbnail doesn't exist
      logger.info(`No thumbnail found for ${photo.fileId} or error deleting it: ${error.message}`);
    }

    // Delete the photo document
    await Photo.findByIdAndDelete(photoId);

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
    let reportId = null;
    
    // Check if specific photo ID is provided
    if (req.params.photoId) {
      const photo = await Photo.findById(req.params.photoId);
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found' });
      }
      photos = [photo];
      reportId = photo.report;
    } 
    // Check if array of photo IDs is provided
    else if (req.body.photoIds && Array.isArray(req.body.photoIds)) {
      photos = await Photo.find({ _id: { $in: req.body.photoIds } });
      if (photos.length > 0) {
        reportId = photos[0].report;
      }
    } 
    // Check if report ID is provided to analyze all unanalyzed photos
    else if (req.params.reportId) {
      reportId = req.params.reportId;
      photos = await Photo.find({ 
        report: reportId, 
        status: { $in: ['pending', 'failed'] } 
      });
    } else {
      return res.status(400).json({ error: 'Photo ID, photo IDs array, or report ID is required' });
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
        const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(photo.fileId));
        const writeStream = fs.createWriteStream(tempFilePath);
        
        await new Promise((resolve, reject) => {
          downloadStream.pipe(writeStream)
            .on('error', reject)
            .on('finish', resolve);
        });
        
        // Analyze the photo
        const analysisResult = await photoAnalysisService.analyzePhoto(tempFilePath);
        
        // Update photo with analysis results
        photo.analysis = analysisResult;
        photo.status = 'analyzed';
        photo.analysisDate = new Date();
        await photo.save();
        
        results.push({
          photoId: photo._id,
          status: 'success',
          analysis: analysisResult
        });
        
        // Clean up temp file
        try {
          fs.unlinkSync(tempFilePath);
          logger.debug(`Deleted temporary file: ${tempFilePath}`);
        } catch (unlinkError) {
          logger.warn(`Failed to delete temporary file ${tempFilePath}: ${unlinkError.message}`);
        }
      } catch (error) {
        logger.error(`Error analyzing photo ${photo._id}: ${error.message}`);
        
        // Update photo status to failed
        photo.status = 'failed';
        photo.analysisError = error.message;
        await photo.save();
        
        results.push({
          photoId: photo._id,
          status: 'failed',
          error: error.message
        });
      }
    }
    
    return res.status(200).json({
      message: `Analysis completed for ${results.filter(r => r.status === 'success').length} of ${photos.length} photos`,
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