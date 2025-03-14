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
    // Check if files exist
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ error: 'Please upload at least one photo' });
    }

    const reportId = req.body.reportId;
    if (!reportId) {
      return res.status(400).json({ error: 'Report ID is required' });
    }

    logger.info(`Uploading ${req.files.length} photos for report ${reportId}`);

    // Find the report
    const report = await Report.findById(reportId);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    // Process each file
    const uploadedPhotos = [];
    for (const file of req.files) {
      try {
        // Upload file to GridFS
        const fileData = await gridfs.uploadFile(file.path, {
          filename: file.originalname,
          contentType: file.mimetype,
          metadata: {
            reportId,
            userId: req.user.id,
            uploadDate: new Date()
          }
        });

        // Create photo object
        const photo = {
          _id: fileData.id,
          filename: file.originalname,
          path: file.path,
          section: req.body.section || 'Uncategorized'
        };

        uploadedPhotos.push(photo);

        // Clean up temp file
        await fs.unlink(file.path);
      } catch (error) {
        logger.error(`Error processing file ${file.originalname}: ${error.message}`);
      }
    }

    // Add photos to report
    report.photos.push(...uploadedPhotos);
    await report.save();

    res.status(200).json({
      success: true,
      count: uploadedPhotos.length,
      photos: uploadedPhotos
    });
  } catch (error) {
    logger.error(`Error uploading photos: ${error.message}`);
    res.status(500).json({ error: 'Server error uploading photos' });
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

    // If thumbnail is requested, check if it exists in GridFS with a modified filename
    if (size === 'thumbnail') {
      try {
        const thumbnailId = `thumb_${photoId}`;
        await gridfs.streamToResponse(thumbnailId, res);
      } catch (error) {
        // If thumbnail doesn't exist, fall back to original
        logger.info(`Thumbnail not found for ${photoId}, serving original`);
        await gridfs.streamToResponse(photoId, res);
      }
    } else {
      // Stream the original photo
      await gridfs.streamToResponse(photoId, res);
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

    // Find reports containing this photo
    const report = await Report.findOne({ 'photos._id': photoId });
    if (!report) {
      return res.status(404).json({ error: 'Photo not found in any report' });
    }

    // Check if user owns the report
    if (report.user.toString() !== req.user.id) {
      return res.status(401).json({ error: 'Not authorized to delete this photo' });
    }

    // Remove photo from report
    report.photos = report.photos.filter(photo => photo._id.toString() !== photoId);
    await report.save();

    // Delete from GridFS
    await gridfs.deleteFile(photoId);

    // Also try to delete thumbnail if it exists
    try {
      const thumbnailId = `thumb_${photoId}`;
      await gridfs.deleteFile(thumbnailId);
    } catch (error) {
      // Ignore errors if thumbnail doesn't exist
      logger.info(`No thumbnail found for ${photoId} or error deleting it`);
    }

    res.status(200).json({ success: true, message: 'Photo deleted' });
  } catch (error) {
    logger.error(`Error deleting photo: ${error.message}`);
    res.status(500).json({ error: 'Server error deleting photo' });
  }
};

/**
 * Analyze photos with AI
 * @route POST /api/photos/analyze
 * @access Private
 */
const analyzePhotos = async (req, res) => {
  try {
    const { reportId, photoId, photoIds } = req.body;
    
    // Check if we have at least one valid parameter
    if (!reportId && !photoId && (!photoIds || !photoIds.length)) {
      return res.status(400).json({ error: 'Either reportId, photoId, or photoIds is required' });
    }

    let report;
    let photosToAnalyze = [];
    
    // Case 1: Analyze a specific photo by ID
    if (photoId) {
      // Find the report containing this photo
      report = await Report.findOne({ 'photos._id': photoId });
      if (!report) {
        return res.status(404).json({ error: 'Photo not found in any report' });
      }
      
      // Check if user owns the report
      if (report.user.toString() !== req.user.id) {
        return res.status(401).json({ error: 'Not authorized to analyze this photo' });
      }
      
      // Get the specific photo
      const photo = report.photos.find(p => p._id.toString() === photoId);
      if (!photo) {
        return res.status(404).json({ error: 'Photo not found in report' });
      }
      
      photosToAnalyze = [photo];
      logger.info(`Analyzing single photo ${photoId}`);
    }
    // Case 2: Analyze multiple photos by IDs
    else if (photoIds && photoIds.length) {
      // Find all reports containing these photos
      // This is less efficient but ensures we check authorization for all photos
      const reports = await Report.find({ 'photos._id': { $in: photoIds } });
      
      // Check if user owns all reports
      for (const rep of reports) {
        if (rep.user.toString() !== req.user.id) {
          return res.status(401).json({ error: 'Not authorized to analyze one or more photos' });
        }
      }
      
      // Collect all photos to analyze
      for (const rep of reports) {
        const photos = rep.photos.filter(p => photoIds.includes(p._id.toString()));
        photosToAnalyze.push(...photos);
      }
      
      // Use the first report for saving results
      report = reports[0];
      
      logger.info(`Analyzing ${photosToAnalyze.length} photos by IDs`);
    }
    // Case 3: Analyze all unanalyzed photos in a report
    else {
      // Find the report
      report = await Report.findById(reportId);
      if (!report) {
        return res.status(404).json({ error: 'Report not found' });
      }

      // Check if user owns the report
      if (report.user.toString() !== req.user.id) {
        return res.status(401).json({ error: 'Not authorized to analyze photos for this report' });
      }

      // Get photos that haven't been analyzed yet
      photosToAnalyze = report.photos.filter(photo => !photo.aiAnalysis);
      
      logger.info(`Analyzing ${photosToAnalyze.length} unanalyzed photos for report ${reportId}`);
    }
    
    // If no photos to analyze, return early
    if (photosToAnalyze.length === 0) {
      return res.status(200).json({ 
        success: true,
        message: 'No photos to analyze',
        count: 0,
        results: []
      });
    }

    // Process each photo
    const results = [];
    for (const photo of photosToAnalyze) {
      try {
        // Create a temporary file to store the photo
        const tempFilePath = path.join(__dirname, '../temp', `${photo._id}.jpg`);
        
        // Create a write stream for the temporary file
        const writeStream = fs.createWriteStream(tempFilePath);
        
        // Get the photo from GridFS and pipe it to the temporary file
        const downloadStream = gridfs.downloadFile(photo._id);
        downloadStream.pipe(writeStream);
        
        // Wait for the download to complete
        await new Promise((resolve, reject) => {
          writeStream.on('finish', resolve);
          writeStream.on('error', reject);
          downloadStream.on('error', reject);
        });
        
        // Analyze the photo
        const analysis = await photoAnalysisService.analyzePhoto(tempFilePath);
        
        // Update the photo in the report
        const photoIndex = report.photos.findIndex(p => p._id.toString() === photo._id.toString());
        if (photoIndex !== -1) {
          report.photos[photoIndex].aiAnalysis = analysis;
        }
        
        results.push({
          photoId: photo._id,
          analysis
        });
        
        // Clean up the temporary file
        await fs.unlink(tempFilePath);
      } catch (error) {
        logger.error(`Error analyzing photo ${photo._id}: ${error.message}`);
        results.push({
          photoId: photo._id,
          error: error.message
        });
      }
    }

    // Save the report with the updated photo analyses
    await report.save();

    res.status(200).json({
      success: true,
      count: results.length,
      results
    });
  } catch (error) {
    logger.error(`Error analyzing photos: ${error.message}`);
    res.status(500).json({ error: 'Server error analyzing photos' });
  }
};

module.exports = {
  uploadPhotos,
  getPhoto,
  deletePhoto,
  analyzePhotos
}; 