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
 * Analyze photos in a report (expects JSON body with IDs)
 * @route POST /api/photos/analyze
 * @access Private
 * @body { reportId: string, photoIds: string[] }
 */
const analyzePhotos = async (req, res) => {
  try {
    // 1. Get reportId and photoIds from JSON body
    const { reportId, photoIds } = req.body;

    // Basic validation
    if (!reportId) {
      logger.warn('Analysis request missing reportId');
      return apiResponse.send(res, apiResponse.error('Report ID is required', null, 400));
    }
    if (!photoIds || !Array.isArray(photoIds) || photoIds.length === 0) {
      logger.warn(`Analysis request for report ${reportId} missing photoIds`);
      return apiResponse.send(res, apiResponse.error('Photo IDs array is required', null, 400));
    }
    // Validate IDs format (optional but good practice)
    const invalidIds = photoIds.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
        logger.warn(`Analysis request for report ${reportId} contained invalid photo IDs: ${invalidIds.join(', ')}`);
        return apiResponse.send(res, apiResponse.error(`Invalid photo ID format for IDs: ${invalidIds.join(', ')}`, null, 400));
    }

    logger.info(`Received analysis request for ${photoIds.length} photos in report ${reportId}.`);

    // 2. Find the report
    const report = await Report.findById(reportId).select('photos'); // Select only photos for efficiency
    if (!report) {
      logger.warn(`Analysis request failed: Report ${reportId} not found.`);
      return apiResponse.send(res, apiResponse.error('Report not found', null, 404));
    }

    // 3. Validate requested photo IDs against the report's actual photos
    const reportPhotoIds = new Set(report.photos.map(p => p._id.toString()));
    const idsToAnalyze = photoIds.filter(id => reportPhotoIds.has(id));
    const missingIds = photoIds.filter(id => !reportPhotoIds.has(id));

    // Check if any valid photos were requested for analysis
    if (idsToAnalyze.length === 0) {
        logger.warn(`No valid photos found for analysis in report ${reportId}. Requested IDs: ${photoIds.join(', ')}. Report contains IDs: ${Array.from(reportPhotoIds).join(', ')}`);
        return apiResponse.send(res, apiResponse.error('None of the requested photo IDs were found or valid for this report', null, 404));
    }
    
    // Log if some requested IDs were not found (but proceed with valid ones)
    if (missingIds.length > 0) {
        logger.warn(`Could not find ${missingIds.length} photos requested for analysis in report ${reportId}. Missing/Invalid IDs: ${missingIds.join(', ')}. Proceeding with ${idsToAnalyze.length} valid photos found in report.`);
    }

    logger.info(`Starting analysis for ${idsToAnalyze.length} photos from report ${reportId}.`);

    // 4. Call the analysis service with the validated IDs
    const analysisResults = await photoAnalysisService.analyzePhotos(idsToAnalyze, reportId);

    // --- BEGIN ADDED LOGGING ---
    logger.debug(`Analysis service returned ${analysisResults ? analysisResults.length : 'null'} results: ${JSON.stringify(analysisResults, null, 2)}`);
    // --- END ADDED LOGGING ---

    // Check if the service returned any results (it might return an empty array on failure)
    if (!analysisResults || analysisResults.length === 0) {
        logger.error(`Photo analysis service returned no results for report ${reportId}.`);
        // Consider returning the photos that were *supposed* to be analyzed but failed?
        // For now, return a generic error.
        return apiResponse.send(res, apiResponse.error('Photo analysis service failed or returned no results', null, 500));
    }

    logger.info(`Analysis service completed for report ${reportId}, received ${analysisResults.length} results.`);

    // 5. Prepare bulk update operation for the database
    const bulkOps = analysisResults
      .filter(result => result.success && result.photoId) // Process only successful results with an ID
      .map(result => {
          const analysisData = result.data || result.analysis || {}; // Default to empty object if no data
          
          // Determine status based on whether analysis produced content
          const hasRealContent = analysisData.description?.trim() || (analysisData.tags?.length > 0);
          const newStatus = hasRealContent ? 'analyzed' : 'uploaded'; // Stay 'uploaded' if analysis is empty
          
          logger.debug(`Updating photo ${result.photoId} in report ${reportId}. Status: ${newStatus}. Analysis data keys: ${Object.keys(analysisData).join(', ')}`);
          
          // Ensure the analysis data structure is complete
          const sanitizedAnalysis = {
            tags: Array.isArray(analysisData.tags) ? analysisData.tags : [],
            severity: analysisData.severity || 'unknown',
            description: analysisData.description || '',
            confidence: typeof analysisData.confidence === 'number' ? analysisData.confidence : 0,
            damageDetected: !!analysisData.damageDetected
          };
          
          // Log if analysis data appears valid but isn't being reflected
          if (hasRealContent) {
            logger.debug(`Analysis for photo ${result.photoId} has content: ${sanitizedAnalysis.description.substring(0, 50)}... and ${sanitizedAnalysis.tags.length} tags`);
          }
          
          return {
              updateOne: {
                  filter: { _id: reportId, 'photos._id': result.photoId },
                  update: {
                      $set: {
                          'photos.$.analysis': sanitizedAnalysis,
                          'photos.$.status': newStatus,
                          'photos.$.lastUpdated': new Date() // Update photo lastUpdated
                      }
                  }
              }
          };
      })
      .filter(op => op != null); // Ensure no null ops
      
    // 6. Execute bulk update if needed
    if (bulkOps.length > 0) {
      try {
        logger.info(`Executing bulk update for ${bulkOps.length} photos in report ${reportId}.`);
        const bulkResult = await Report.bulkWrite(bulkOps);
        logger.info(`Bulk update completed for report ${reportId}. Matched: ${bulkResult.matchedCount}, Modified: ${bulkResult.modifiedCount}`);
        // Update the report's main lastUpdated field as well
        await Report.findByIdAndUpdate(reportId, { $set: { lastUpdated: new Date() } });
      } catch (bulkError) {
        logger.error(`Error during bulk update for report ${reportId}: ${bulkError.message}`, { stack: bulkError.stack });
        // Don't block response, but log the error. The data might be partially updated.
      }
    } else {
      logger.warn(`No valid analysis results to update in the database for report ${reportId}.`);
    }

    // 7. Fetch the updated report data to return the analyzed photos
    // Fetch only the specific photos that were analyzed to be precise
    const finalReport = await Report.findById(reportId).select('photos');
    if (!finalReport) {
        logger.error(`Failed to re-fetch report ${reportId} after update.`);
        return apiResponse.send(res, apiResponse.error('Failed to retrieve updated report data', null, 500));
    }
    
    const analyzedPhotoIds = analysisResults
        .filter(r => r.success && r.photoId)
        .map(r => r.photoId.toString()); // Ensure string comparison
        
    const updatedAnalyzedPhotos = finalReport.photos.filter(p => 
        analyzedPhotoIds.includes(p._id.toString())
    );

    // 8. Serialize and return the results
    const serializedPhotos = updatedAnalyzedPhotos.map(photo => PhotoSchema.serializeForApi(photo));
    logger.info(`Returning ${serializedPhotos.length} updated/analyzed photos for report ${reportId}.`);

    // --- BEGIN ADDED LOGGING ---
    serializedPhotos.forEach(p => logger.debug(`Serialized photo for response: ID=${p._id}, Status=${p.status}, HasAnalysis=${!!p.aiAnalysis?.description}`));
    // --- END ADDED LOGGING ---

    // --- BEGIN ADDED LOGGING ---
    logger.debug(`Final serialized photos count: ${serializedPhotos.length}`);
    logger.debug(`Final serialized photos for response: ${JSON.stringify(serializedPhotos, null, 2)}`);
    // --- END ADDED LOGGING ---

    return apiResponse.send(res, apiResponse.success({
      photos: serializedPhotos,
      count: serializedPhotos.length
    }));

  } catch (error) {
    // Catch any unexpected errors
    logger.error(`Unexpected error in analyzePhotos for report ${req.body?.reportId}: ${error.message}`, { stack: error.stack });
    return apiResponse.send(res, apiResponse.error('An unexpected error occurred during photo analysis', error.message, 500));
  }
};

module.exports = {
  uploadPhotos,
  getPhoto,
  deletePhoto,
  analyzePhotos
}; 