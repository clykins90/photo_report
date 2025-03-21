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
    // Handle both FormData and JSON requests
    const reportId = req.body.reportId;
    
    if (!reportId) {
      return apiResponse.send(res, apiResponse.error('Report ID is required', null, 400));
    }
    
    // Find the report
    const report = await Report.findById(reportId);
    
    if (!report) {
      return apiResponse.send(res, apiResponse.error('Report not found', null, 404));
    }
    
    // Check if we have uploaded files
    const hasUploadedFiles = req.files && req.files.length > 0;
    logger.info(`Analyzing photos: hasUploadedFiles=${hasUploadedFiles}, files=${req.files?.length || 0}`);
    
    // Parse photoIds if they came as a string (from FormData)
    let photoIds = req.body.photoIds;
    if (typeof photoIds === 'string') {
      try {
        photoIds = JSON.parse(photoIds);
        logger.info(`Parsed photoIds from string: ${photoIds.length} IDs`);
      } catch (e) {
        logger.error(`Error parsing photoIds: ${e.message}`);
        photoIds = [];
      }
    }
    
    // Determine which photos to analyze from the database
    const photosToAnalyzeFromDb = photoIds && photoIds.length > 0
      ? report.photos.filter(photo => photoIds.includes(photo._id.toString()))
      : hasUploadedFiles ? [] : report.photos;
    
    logger.info(`Photos to analyze from DB: ${photosToAnalyzeFromDb.length}`);
    
    // Process uploaded files if any
    let uploadedFileResults = [];
    
    if (hasUploadedFiles) {
      logger.info(`Processing ${req.files.length} uploaded files for analysis`);
      
      // Create temp directory if it doesn't exist
      const tempDir = process.env.TEMP_DIR || '/tmp';
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      // Parse photo metadata if available
      let photoMetadata = [];
      if (req.body.photoMetadata) {
        try {
          if (Array.isArray(req.body.photoMetadata)) {
            // Handle array of metadata
            photoMetadata = req.body.photoMetadata.map(item => 
              typeof item === 'string' ? JSON.parse(item) : item
            );
          } else if (typeof req.body.photoMetadata === 'string') {
            // Handle single metadata string
            photoMetadata = [JSON.parse(req.body.photoMetadata)];
          } else {
            // Handle single metadata object
            photoMetadata = [req.body.photoMetadata];
          }
          logger.info(`Parsed metadata for ${photoMetadata.length} photos`);
        } catch (e) {
          logger.error(`Error parsing photo metadata: ${e.message}`);
          photoMetadata = [];
        }
      }
      
      // Process each uploaded file
      const filePromises = req.files.map(async (file, index) => {
        try {
          // Get metadata for this file if available
          const metadata = photoMetadata[index] || {};
          
          // Determine photo ID - use metadata ID if available, otherwise generate one
          const photoId = metadata.id || mongoose.Types.ObjectId().toString();
          
          // Save file to temp location
          const tempPath = path.join(tempDir, `uploaded_${photoId}.jpg`);
          await fs.promises.writeFile(tempPath, file.buffer);
          
          logger.info(`Saved uploaded file to ${tempPath} for analysis`);
          
          // Analyze the photo
          const analysis = await photoAnalysisService.analyzePhoto(tempPath);
          
          // Extract the analysis data from the result
          const analysisData = analysis.data || analysis;
          
          // Find if this photo already exists in the report
          const existingPhotoIndex = report.photos.findIndex(p => 
            p._id.toString() === photoId
          );
          
          if (existingPhotoIndex >= 0) {
            // Update existing photo with analysis data
            report.photos[existingPhotoIndex].analysis = analysisData;
            
            // Consider ANY photo with a description field that's not empty as analyzed
            const hasRealContent = analysisData && 
              ((analysisData.description && analysisData.description.trim() !== '') || 
               (Array.isArray(analysisData.tags) && analysisData.tags.length > 0));
            
            // Default to 'analyzed' if we have any content, even minimal
            report.photos[existingPhotoIndex].status = hasRealContent ? 'analyzed' : 'uploaded';
            logger.info(`Updated existing photo ${photoId} with analysis ${hasRealContent ? '(real content)' : '(empty content)'}`);
          } else {
            logger.info(`Photo ${photoId} not found in report, will be added to results`);
          }
          
          return {
            photoId,
            success: true,
            data: analysisData  // Use consistent field name
          };
        } catch (error) {
          logger.error(`Error processing uploaded file: ${error.message}`);
          return {
            photoId: metadata?.id || 'unknown',
            success: false,
            error: error.message
          };
        }
      });
      
      uploadedFileResults = await Promise.all(filePromises);
      logger.info(`Completed analysis of ${uploadedFileResults.length} uploaded files`);
    }
    
    // Process database photos
    let dbPhotoResults = [];
    if (photosToAnalyzeFromDb.length > 0) {
      logger.info(`Analyzing ${photosToAnalyzeFromDb.length} photos from database for report ${reportId}`);
      dbPhotoResults = await photoAnalysisService.analyzePhotos(photosToAnalyzeFromDb, reportId);
      logger.info(`Completed analysis of ${dbPhotoResults.length} database photos`);
    }
    
    // Combine results
    const allResults = [...uploadedFileResults, ...dbPhotoResults];
    logger.info(`Total analysis results: ${allResults.length} (${uploadedFileResults.length} uploaded + ${dbPhotoResults.length} from DB)`);
    
    if (allResults.length === 0) {
      return apiResponse.send(res, apiResponse.error('No photos were successfully analyzed', null, 400));
    }
    
    // Update photos in the report with analysis results
    const bulkOps = allResults
      .filter(result => result.success && result.photoId)
      .map(result => {
        // Check if result has analysis or data field
        const analysisData = result.data || result.analysis || null;
        
        if (!analysisData) {
          logger.warn(`No analysis data found for photo ${result.photoId}`);
          return null;
        }
        
        // Log the analysis data for debugging
        logger.info(`Analysis data for photo ${result.photoId}:`, {
          hasDescription: !!analysisData.description,
          descriptionLength: analysisData.description ? analysisData.description.length : 0,
          tags: analysisData.tags || [],
          damageDetected: !!analysisData.damageDetected,
          severity: analysisData.severity
        });
        
        // Consider ANY photo with a description field that's not empty as analyzed
        const hasRealContent = analysisData && 
          ((analysisData.description && analysisData.description.trim() !== '') || 
           (Array.isArray(analysisData.tags) && analysisData.tags.length > 0));
        
        // Default to 'analyzed' if we have any content, even minimal
        const newStatus = hasRealContent ? 'analyzed' : 'uploaded';
        logger.info(`Setting photo ${result.photoId} status to ${newStatus} based on content check`);
        
        return {
          updateOne: {
            filter: { _id: reportId, 'photos._id': result.photoId },
            update: { 
              $set: { 
                'photos.$.analysis': analysisData,
                'photos.$.status': newStatus,
                lastUpdated: new Date()
              }
            }
          }
        };
      })
      .filter(op => op !== null); // Filter out null operations
    
    // Execute bulk operation if there are results
    if (bulkOps.length > 0) {
      await Report.bulkWrite(bulkOps);
      logger.info(`Updated ${bulkOps.length} photos with analysis results`);
    }
    
    // Get updated photos
    const updatedReport = await Report.findById(reportId);
    
    // Get all analyzed photos
    const analyzedPhotoIds = allResults
      .filter(result => result.success)
      .map(result => result.photoId);
    
    const analyzedPhotos = updatedReport.photos.filter(photo => 
      analyzedPhotoIds.includes(photo._id.toString())
    );
    
    logger.info(`Found ${analyzedPhotos.length} analyzed photos in updated report`);
    
    // Return serialized photos
    const serializedPhotos = analyzedPhotos.map(photo => PhotoSchema.serializeForApi(photo));
    
    logger.info(`Returning ${serializedPhotos.length} serialized photos to client`);
    
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