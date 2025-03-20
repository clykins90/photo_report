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
    
    // Create photo objects using PhotoSchema
    const clientPhotos = Array.from(files).map(file => PhotoSchema.createFromFile(file));
    
    // Create form data for upload
    const formData = new FormData();
    formData.append('reportId', reportId);
    
    // Add client IDs for tracking
    const clientIds = clientPhotos.map(photo => photo.clientId);
    formData.append('clientIds', JSON.stringify(clientIds));
    
    // Add files to form data
    Array.from(files).forEach((file, index) => {
      formData.append('photos', file);
    });
    
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
 * Analyze photos in a report
 * @param {String} reportId - ID of the report containing photos
 * @param {Array<String|Object>} photosOrIds - Array of photo objects or IDs to analyze
 * @returns {Promise<Object>} Analysis result
 */
export const analyzePhotos = async (reportId, photosOrIds = []) => {
  try {
    if (!reportId) {
      return { success: false, error: 'Report ID is required' };
    }
    
    if (!photosOrIds || photosOrIds.length === 0) {
      return { success: false, error: 'No photos to analyze' };
    }
    
    // Debug info
    photoLogger.info('analyzePhotos called with reportId:', reportId);
    photoLogger.info('analyzePhotos photosOrIds type:', Array.isArray(photosOrIds) 
      ? 'array' 
      : typeof photosOrIds);
    photoLogger.info('analyzePhotos first item type:', photosOrIds.length > 0 
      ? (typeof photosOrIds[0] === 'object' ? 'object' : typeof photosOrIds[0]) 
      : 'none');
    
    // Function to validate MongoDB ObjectId (24 character hex string)
    const isValidObjectId = (id) => id && typeof id === 'string' && /^[0-9a-f]{24}$/i.test(id);
    
    // Simplify the process - if all items are strings and valid ObjectIds, just use them directly
    if (photosOrIds.every(item => typeof item === 'string' && isValidObjectId(item))) {
      photoLogger.info('Using direct ID array for analysis');
      // Simple case - all items are valid MongoDB ObjectId strings
      const response = await api.post('/photos/analyze', {
        reportId,
        photoIds: photosOrIds
      });
      
      if (response.data.success) {
        const responseData = response.data.data || response.data;
        const serverAnalyzedPhotos = responseData.photos || [];
        
        return {
          success: true,
          data: {
            photos: serverAnalyzedPhotos
          }
        };
      } else {
        return {
          success: false,
          error: response.data.error || 'Analysis failed'
        };
      }
    }
    
    // Check if we're dealing with photo objects or just IDs
    const hasPhotoObjects = photosOrIds.some(item => typeof item === 'object');
    
    // Group photos by data availability
    let photoIds = [];
    let photosWithLocalData = [];
    
    if (hasPhotoObjects) {
      // Process photo objects to determine which ones have local data
      const photoObjects = photosOrIds.filter(item => typeof item === 'object');
      
      // Filter out photo objects that don't have a valid server ID
      const validPhotoObjects = photoObjects.filter(photo => {
        const photoId = photo._id || photo.id;
        return isValidObjectId(photoId);
      });
      
      if (validPhotoObjects.length === 0) {
        photoLogger.error('No valid photo objects to analyze');
        return { success: false, error: 'No valid photo IDs found for analysis' };
      }
      
      // Use the groupPhotosByDataAvailability utility to separate photos with local data
      const { withLocalData, needsServerAnalysis } = groupPhotosByDataAvailability(validPhotoObjects);
      photosWithLocalData = withLocalData;
      photoIds = needsServerAnalysis
        .map(photo => photo._id || photo.id)
        .filter(id => isValidObjectId(id));
      
      photoLogger.info(`Analyzing ${photosWithLocalData.length} photos with local data and ${photoIds.length} photos from server for report ${reportId}`);
    } else {
      // If we only have IDs, filter for valid MongoDB ObjectIds
      photoIds = photosOrIds.filter(id => isValidObjectId(id));
      
      if (photoIds.length === 0) {
        photoLogger.error('No valid photo IDs to analyze');
        return { success: false, error: 'No valid photo IDs found for analysis' };
      }
      
      photoLogger.info(`Analyzing ${photoIds.length} photos from server for report ${reportId}`);
    }
    
    // Create FormData if we have local files to send
    let payload;
    let config = {};
    
    if (photosWithLocalData.length > 0) {
      // We have local files to send
      payload = new FormData();
      payload.append('reportId', reportId);
      
      // Add photo IDs that need server analysis
      if (photoIds.length > 0) {
        payload.append('photoIds', JSON.stringify(photoIds));
      }
      
      // Add local files to the FormData
      photosWithLocalData.forEach((photo, index) => {
        // Get the best source for uploading
        const source = getBestDataSource(photo);
        let file = null;
        
        if (source.type === 'file' && photo.file) {
          // We have a file object
          file = photo.file;
        } else if (source.type === 'dataUrl' && source.data) {
          // Convert data URL to file
          const dataUrl = source.data;
          const blob = dataURLtoBlob(dataUrl);
          file = new File([blob], `photo_${photo._id || photo.id || index}.jpg`, { type: 'image/jpeg' });
        }
        
        if (file) {
          payload.append('photos', file);
          payload.append('photoMetadata', JSON.stringify({
            index,
            id: photo._id || photo.id,
            clientId: photo.clientId || photo.id
          }));
        }
      });
    } else {
      // No local files, just send IDs
      payload = {
        reportId,
        photoIds: photoIds.length > 0 ? photoIds : undefined
      };
    }
    
    // Send analysis request
    const response = await api.post('/photos/analyze', payload, config);
    
    // Log the raw response for debugging
    photoLogger.debug('Raw API response from analyzePhotos:', {
      success: response.data.success,
      hasData: !!response.data.data,
      dataKeys: response.data.data ? Object.keys(response.data.data) : 'none',
      hasPhotos: !!(response.data.photos || (response.data.data && response.data.data.photos)),
      photosCount: (response.data.photos || (response.data.data && response.data.data.photos) || []).length
    });
    
    if (response.data.success) {
      // Handle nested data structure if present
      const responseData = response.data.data || response.data;
      // Get the analyzed photos from the response
      const serverAnalyzedPhotos = responseData.photos || [];
      
      photoLogger.info(`Received analysis results for ${serverAnalyzedPhotos.length} photos`);
      
      if (hasPhotoObjects) {
        // For photo objects, we need to return results in a format that matches
        // what the client expects from the previous implementation
        const results = serverAnalyzedPhotos.map((serverPhoto) => {
          // Ensure we have a valid photoId
          const photoId = serverPhoto._id || serverPhoto.id || '';
          
          return {
            success: true,
            photoId: photoId,
            analysis: serverPhoto.analysis
          };
        });
        
        return {
          success: true,
          results: results
        };
      } else {
        // For photo IDs, return the photos directly
        // Transform photos to client format if needed
        const clientAnalyzedPhotos = serverAnalyzedPhotos.map(photo => 
          preservePhotoData(PhotoSchema.deserializeFromApi(photo))
        );
        
        return {
          success: true,
          data: {
            photos: clientAnalyzedPhotos
          }
        };
      }
    } else {
      photoLogger.error('Photo analysis failed:', response.data.error);
      return {
        success: false,
        error: response.data.error || 'Analysis failed'
      };
    }
  } catch (error) {
    photoLogger.error('Photo analysis error:', error);
    return {
      success: false,
      error: error.message || 'Analysis failed'
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