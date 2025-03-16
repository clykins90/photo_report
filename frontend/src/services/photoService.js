import api from './api';
import PhotoSchema from 'shared/schemas/photoSchema';
import { photoLogger } from '../utils/logger';
import photoStorageManager from './photoStorageManager';

/**
 * Simplified photo service for handling photo operations
 * Uses the shared PhotoSchema for consistent object handling
 * and PhotoStorageManager for data source management
 */

/**
 * Get the URL for a photo - delegates to photoStorageManager
 * @param {String|Object} photoOrId - Photo object or ID
 * @param {String} size - Size variant ('original', 'thumbnail', 'medium')
 * @returns {String} Photo URL
 */
export const getPhotoUrl = (photoOrId, size = 'original') => {
  // Handle string IDs
  if (typeof photoOrId === 'string') {
    const baseUrl = `/api/photos/${photoOrId}`;
    
    switch(size) {
      case 'thumbnail':
        return `${baseUrl}?size=thumbnail`;
      case 'medium':
        return `${baseUrl}?size=medium`;
      default:
        return baseUrl;
    }
  }
  
  // Otherwise delegate to storage manager
  return photoStorageManager.getPhotoUrl(photoOrId, size);
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
    
    // Create client photo objects for tracking
    const clientPhotos = Array.from(files).map(file => {
      // Ensure we're creating proper photo objects with file references
      const photoObj = PhotoSchema.createFromFile(file);
      // Explicitly store the file object
      photoObj.file = file;
      
      // Ensure preview URL exists
      if (!photoObj.preview && file) {
        photoObj.preview = URL.createObjectURL(file);
      }
      
      return photoObj;
    });
    
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
    
    // Track overall progress
    let overallProgress = 0;
    
    // Upload files
    const response = await api.post('/photos/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (progressCallback) {
          // Calculate progress percentage
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          overallProgress = progress;
          
          // Update progress for each photo
          const updatedPhotos = clientPhotos.map(photo => ({
            ...photo,
            uploadProgress: progress
          }));
          
          progressCallback(updatedPhotos, progress);
        }
      }
    });
    
    // Process response
    if (response.data.success) {
      // Get the ID mapping from clientId to server ID and photos - access from nested data if present
      const responseData = response.data.data || response.data;
      const { idMapping, photos: serverPhotos } = responseData;
      
      // Create properly formed photo objects
      const uploadedPhotos = clientPhotos.map(clientPhoto => {
        const serverId = idMapping && idMapping[clientPhoto.clientId];
        const serverPhoto = serverPhotos && serverPhotos.find(p => p._id === serverId);
        
        if (serverPhoto) {
          // Create a merged photo object with both server data and client data
          const mergedPhoto = {
            ...serverPhoto,
            // Explicitly preserve the file object and preview URL
            file: clientPhoto.file,
            preview: clientPhoto.preview,
            // Preserve any local data URL
            localDataUrl: clientPhoto.localDataUrl || (clientPhoto.preview && clientPhoto.preview.startsWith('data:') ? clientPhoto.preview : null)
          };
          
          // If we still don't have a preview URL but have a file, create one
          if (!mergedPhoto.preview && mergedPhoto.file) {
            mergedPhoto.preview = URL.createObjectURL(mergedPhoto.file);
          }
          
          // Deserialize using the schema
          const photoObj = PhotoSchema.deserializeFromApi(mergedPhoto);
          
          // Double-check file is preserved
          if (!photoObj.file && clientPhoto.file) {
            photoObj.file = clientPhoto.file;
          }
          
          // Double-check preview is preserved
          if (!photoObj.preview && clientPhoto.preview) {
            photoObj.preview = clientPhoto.preview;
          }
          
          // Ensure local data is preserved
          return photoStorageManager.preservePhotoData(photoObj);
        }
        
        return photoStorageManager.preservePhotoData(clientPhoto);
      });
      
      // Log the photo data availability to verify files are preserved
      photoStorageManager.logPhotoDataAvailability(uploadedPhotos);
      
      return {
        success: true,
        data: {
          photos: uploadedPhotos,
          idMapping
        }
      };
    } else {
      return {
        success: false,
        error: response.data.error || 'Upload failed',
        photos: clientPhotos.map(photo => ({
          ...photo,
          status: 'error'
        }))
      };
    }
  } catch (error) {
    photoLogger.error('Photo upload error:', error);
    return {
      success: false,
      error: error.message || 'Upload failed',
      photos: files ? Array.from(files).map(file => ({
        ...PhotoSchema.createFromFile(file),
        status: 'error'
      })) : []
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
    
    // Check if we're dealing with photo objects or just IDs
    const hasPhotoObjects = photosOrIds.some(item => typeof item === 'object');
    
    // Extract IDs from photo objects or use the IDs directly
    const photoIds = hasPhotoObjects 
      ? photosOrIds.map(photo => photo._id || photo.id).filter(id => id)
      : photosOrIds;
    
    // Log what we're analyzing
    photoLogger.info(`Analyzing ${photoIds.length} photos for report ${reportId}`);
    
    // Build request payload
    const payload = {
      reportId,
      photoIds: photoIds.length > 0 ? photoIds : undefined
    };
    
    // Send analysis request
    const response = await api.post('/photos/analyze', payload);
    
    if (response.data.success) {
      // Handle nested data structure if present
      const responseData = response.data.data || response.data;
      // Get the analyzed photos from the response
      const serverAnalyzedPhotos = responseData.photos || [];
      
      if (hasPhotoObjects) {
        // For photo objects, we need to return results in a format that matches
        // what the client expects from the previous implementation
        const results = serverAnalyzedPhotos.map(serverPhoto => ({
          success: true,
          photoId: serverPhoto._id,
          data: serverPhoto.analysis
        }));
        
        return {
          success: true,
          results: results
        };
      } else {
        // For photo IDs, return the photos directly
        // Transform photos to client format if needed
        const clientAnalyzedPhotos = serverAnalyzedPhotos.map(photo => 
          PhotoSchema.deserializeFromApi(photo)
        );
        
        return {
          success: true,
          data: {
            photos: clientAnalyzedPhotos
          }
        };
      }
    } else {
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