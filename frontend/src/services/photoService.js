import api from './api';
import PhotoSchema from 'shared/schemas/photoSchema';
import { photoLogger } from '../utils/logger';
import { 
  getPhotoUrl as getPhotoUrlUtil,
  dataURLtoBlob,
  getBestDataSource,
  groupPhotosByDataAvailability
} from '../utils/photoUtils';

/**
 * Simplified photo service for handling photo operations
 * Uses the shared PhotoSchema for consistent object handling
 */

/**
 * Get the URL for a photo
 * @param {String|Object} photoOrId - Photo object or ID
 * @param {String} size - Size variant ('original', 'thumbnail', 'medium')
 * @returns {String} Photo URL
 */
export const getPhotoUrl = (photoOrId, size = 'original') => {
  return getPhotoUrlUtil(photoOrId, { size });
};

/**
 * Upload a batch of photos
 * @param {Array<File>} files - Array of File objects to upload
 * @param {String} reportId - Report ID to associate photos with
 * @param {Function} progressCallback - Callback for upload progress
 * @returns {Promise<Object>} Upload result with photos and id mapping
 */
export const uploadPhotos = async (files, reportId, progressCallback = null) => {
  try {
    if (!files || files.length === 0) {
      return { success: false, error: 'No files to upload' };
    }
    
    if (!reportId) {
      return { success: false, error: 'Report ID is required' };
    }
    
    // Create form data for upload
    const formData = new FormData();
    formData.append('reportId', reportId);
    
    // Add files to form data and track their client IDs
    const clientIds = [];
    Array.from(files).forEach((file, index) => {
      // Get the original temp ID from all possible sources
      const originalTempId = file._tempId || file.clientId || file.originalClientId;
      if (!originalTempId) {
        console.warn(`No client ID found for file ${file.name} at index ${index}`);
      }
      clientIds.push(originalTempId); // Don't create a new one, let the schema handle it if needed
      formData.append('photos', file);
    });
    
    // Add client IDs for tracking
    formData.append('clientIds', JSON.stringify(clientIds));
    
    // Upload files
    const response = await api.post('/photos/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (progressCallback) {
          // Only report raw progress, let context handle status
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          progressCallback(progress);
        }
      }
    });
    
    // Process response
    if (response.data.success) {
      const responseData = response.data.data || response.data;
      const { idMapping, photos: serverPhotos } = responseData;
      
      // Return raw server data, let context handle state
      return {
        success: true,
        data: {
          photos: serverPhotos,
          idMapping
        }
      };
    } else {
      return {
        success: false,
        error: response.data.error || 'Upload failed'
      };
    }
  } catch (error) {
    photoLogger.error('Photo upload error:', error);
    return {
      success: false,
      error: error.message || 'Upload failed'
    };
  }
};

/**
 * Analyze photos already uploaded to the server.
 * @param {String} reportId - ID of the report containing photos
 * @param {Array<String>} photoIds - Array of photo IDs (server _id) to analyze.
 * @returns {Promise<Object>} Analysis result { success: boolean, data?: { photos: Array<Object> }, error?: string }
 */
export const analyzePhotos = async (reportId, photoIds = []) => {
  try {
    if (!reportId) {
      photoLogger.warn('analyzePhotos called without reportId');
      return { success: false, error: 'Report ID is required' };
    }
    
    if (!photoIds || photoIds.length === 0) {
      photoLogger.warn(`analyzePhotos called for report ${reportId} with no photo IDs.`);
      // Return success, as there's nothing to do
      return { success: true, data: { photos: [] } }; 
    }
    
    photoLogger.info(`analyzePhotos called for report ${reportId} with ${photoIds.length} photo IDs.`);

    // Use the provided photoIds directly
    photoLogger.info(`Sending ${photoIds.length} photo IDs for analysis. IDs:`, photoIds);

    // 3. Prepare JSON payload
    const payload = {
      reportId,
      photoIds
    };

    // 4. Send *single* analysis request with JSON payload
    photoLogger.info(`Sending analysis request for report ${reportId} with ${photoIds.length} photo IDs.`);
    
    // Assuming `api` is an axios instance configured for JSON
    const response = await api.post('/photos/analyze', payload);
    
    // 5. Handle response
    if (response.data.success) {
      const responseData = response.data.data || response.data;
      const serverAnalyzedPhotos = responseData.photos || [];
      photoLogger.info(`Analysis request successful for report ${reportId}. Received ${serverAnalyzedPhotos.length} results.`);
      
      // 6. Transform results to client format using schema
      const clientAnalyzedPhotos = serverAnalyzedPhotos.map(photo => 
        PhotoSchema.deserializeFromApi(photo)
      );
      
      return {
        success: true,
        data: {
          photos: clientAnalyzedPhotos
        }
      };
    } else {
      photoLogger.error(`Photo analysis request failed for report ${reportId}:`, response.data.error);
      // Return a structured error object
      return {
          success: false,
          error: response.data.error || 'Analysis request failed on the server'
      };
    }

  } catch (error) {
    // Handle network errors or errors thrown from the try block
    photoLogger.error(`Photo analysis service error for report ${reportId}:`, error);
    // Check if it's an axios error with a response
    const errorMessage = error.response?.data?.error || error.message || 'Analysis failed due to an unexpected error';
    return {
      success: false,
      error: errorMessage
    };
  }
};

/**
 * Delete a photo
 * @param {String} photoId - ID of the photo to delete
 * @returns {Promise<Object>} Delete result
 */
export const deletePhoto = async (photoId) => {
  try {
    if (!photoId) {
      return { success: false, error: 'Photo ID is required' };
    }
    
    const response = await api.delete(`/photos/${photoId}`);
    
    // Access data from nested structure if present
    const responseData = response.data.data || response.data;
    
    return {
      success: response.data.success,
      error: response.data.error,
      data: responseData
    };
  } catch (error) {
    photoLogger.error('Photo deletion error:', error);
    return {
      success: false,
      error: error.message || 'Delete failed'
    };
  }
};

export default {
  getPhotoUrl,
  uploadPhotos,
  analyzePhotos,
  deletePhoto
}; 