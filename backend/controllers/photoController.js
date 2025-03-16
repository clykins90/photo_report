const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const gridfs = require('../utils/gridfs');
const Report = require('../models/Report');
const photoAnalysisService = require('../services/photoAnalysisService');
const apiResponse = require('../utils/apiResponse');
const PhotoSchema = require('../../shared/schemas/photoSchema.cjs');

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
    
    // Handle client IDs 
    const clientIds = req.body.clientIds ? 
      (Array.isArray(req.body.clientIds) ? req.body.clientIds : JSON.parse(req.body.clientIds)) : 
      [];
    
    logger.debug(`Received ${clientIds.length} client IDs for ${req.files.length} files`);
    
    // Process each file in parallel
    const processFile = async (file, index) => {
      try {
        // Determine the client ID for this file
        const clientId = index < clientIds.length ? clientIds[index] : null;
        
        // Create metadata for the file using PhotoSchema
        const metadata = PhotoSchema.createMetadata(reportId, file.originalname, clientId);
        
        // Upload file to GridFS
        const fileInfo = await gridfs.uploadBuffer(file.buffer, {
          filename: `${reportId}_${Date.now()}_${file.originalname}`,
          contentType: file.mimetype,
          metadata
        });
        
        // Use PhotoSchema to create a consistent photo object 
        return {
          _id: fileInfo.id,
          originalName: file.originalname,
          contentType: file.mimetype,
          status: 'uploaded',
          path: `/api/photos/${fileInfo.id}`,
          uploadDate: new Date(),
          clientId,
          size: file.size
        };
      } catch (error) {
        logger.error(`Error processing file ${file.originalname}: ${error.message}`);
        return null;
      }
    };
    
    // Process files in parallel
    const uploadResults = await Promise.all(
      req.files.map((file, index) => processFile(file, index))
    );
    
    // Filter out failed uploads
    const successfulPhotos = uploadResults.filter(result => result !== null);
    
    // Create mapping from client ID to server ID
    const idMapping = {};
    successfulPhotos.forEach(photo => {
      if (photo.clientId) {
        idMapping[photo.clientId] = photo._id;
      }
    });
    
    // Add photos to the report
    try {
      await Report.findByIdAndUpdate(
        reportId,
        { 
          $push: { photos: { $each: successfulPhotos } },
          $set: { lastUpdated: new Date() }
        }
      );
      
      logger.info(`Added ${successfulPhotos.length} photos to report ${reportId}`);
    } catch (error) {
      logger.error(`Error updating report with photos: ${error.message}`);
      // Continue anyway to return the uploaded photos
    }
    
    // Return serialized photos for the API
    const serializedPhotos = successfulPhotos.map(photo => PhotoSchema.serializeForApi(photo));
    
    return apiResponse.send(res, apiResponse.success({
      photos: serializedPhotos,
      idMapping,
      count: successfulPhotos.length
    }));
  } catch (error) {
    logger.error(`Error in photo upload: ${error.message}`);
    return apiResponse.send(res, apiResponse.error('Failed to upload photos', error.message, 500));
  }
};

/**
 * Get a photo by ID 
 * @route GET /api/photos/:id
 * @access Public
 */
const getPhoto = async (req, res) => {
  try {
    const fileId = req.params.id;
    
    if (!fileId || !mongoose.Types.ObjectId.isValid(fileId)) {
      return apiResponse.send(res, apiResponse.error('Invalid photo ID', null, 400));
    }
    
    // Get size from query parameters
    const size = req.query.size || 'original';
    
    // Stream the file directly from GridFS to the response
    await gridfs.streamToResponse(fileId, res, size);
    
    // Note: The response is handled within the gridfs.streamToResponse function
  } catch (error) {
    logger.error(`Error getting photo: ${error.message}`);
    return apiResponse.send(res, apiResponse.error('Failed to get photo', error.message, 500));
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
    
    if (!photoId || !mongoose.Types.ObjectId.isValid(photoId)) {
      return apiResponse.send(res, apiResponse.error('Invalid photo ID', null, 400));
    }
    
    // First find which report contains this photo
    const report = await Report.findOne({ 'photos._id': photoId });
    
    if (!report) {
      return apiResponse.send(res, apiResponse.error('Photo not found in any report', null, 404));
    }
    
    // Remove the photo from the report
    await Report.findByIdAndUpdate(
      report._id,
      { 
        $pull: { photos: { _id: photoId } },
        $set: { lastUpdated: new Date() }
      }
    );
    
    // Delete the file from GridFS
    await gridfs.deleteFile(photoId);
    
    logger.info(`Deleted photo ${photoId} from report ${report._id}`);
    
    return apiResponse.send(res, apiResponse.success({
      message: 'Photo deleted successfully'
    }));
  } catch (error) {
    logger.error(`Error deleting photo: ${error.message}`);
    return apiResponse.send(res, apiResponse.error('Failed to delete photo', error.message, 500));
  }
};

/**
 * Analyze photos in a report
 * @route POST /api/photos/analyze
 * @access Private
 */
const analyzePhotos = async (req, res) => {
  try {
    const { reportId, photoIds } = req.body;
    
    if (!reportId) {
      return apiResponse.send(res, apiResponse.error('Report ID is required', null, 400));
    }
    
    // Find the report
    const report = await Report.findById(reportId);
    
    if (!report) {
      return apiResponse.send(res, apiResponse.error('Report not found', null, 404));
    }
    
    // Determine which photos to analyze
    const photosToAnalyze = photoIds && photoIds.length > 0
      ? report.photos.filter(photo => photoIds.includes(photo._id.toString()))
      : report.photos;
    
    if (photosToAnalyze.length === 0) {
      return apiResponse.send(res, apiResponse.error('No photos found to analyze', null, 404));
    }
    
    logger.info(`Analyzing ${photosToAnalyze.length} photos for report ${reportId}`);
    
    // Process each photo
    const analysisResults = await photoAnalysisService.analyzePhotos(photosToAnalyze, reportId);
    
    // Update photos in the report with analysis results
    const bulkOps = analysisResults.map(result => {
      return {
        updateOne: {
          filter: { _id: reportId, 'photos._id': result.photoId },
          update: { 
            $set: { 
              'photos.$.analysis': result.analysis,
              'photos.$.status': 'analyzed',
              lastUpdated: new Date()
            }
          }
        }
      };
    });
    
    // Execute bulk operation if there are results
    if (bulkOps.length > 0) {
      await Report.bulkWrite(bulkOps);
      logger.info(`Updated ${bulkOps.length} photos with analysis results`);
    }
    
    // Get updated photos
    const updatedReport = await Report.findById(reportId);
    const analyzedPhotos = photoIds && photoIds.length > 0
      ? updatedReport.photos.filter(photo => photoIds.includes(photo._id.toString()))
      : updatedReport.photos;
    
    // Return serialized photos
    const serializedPhotos = analyzedPhotos.map(photo => PhotoSchema.serializeForApi(photo));
    
    return apiResponse.send(res, apiResponse.success({
      photos: serializedPhotos,
      count: serializedPhotos.length
    }));
  } catch (error) {
    logger.error(`Error analyzing photos: ${error.message}`);
    return apiResponse.send(res, apiResponse.error('Failed to analyze photos', error.message, 500));
  }
};

module.exports = {
  uploadPhotos,
  getPhoto,
  deletePhoto,
  analyzePhotos
}; 