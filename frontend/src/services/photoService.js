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
    
    // Filter out already analyzed photos
    const photosToAnalyze = photosOrIds.filter(photo => 
      !photo.analysis && // Skip if already analyzed
      PhotoSchema.helpers.canAnalyze(photo) // Skip if not in a state that can be analyzed
    );
    
    if (photosToAnalyze.length === 0) {
      photoLogger.info('No photos need analysis');
      return { success: true, data: { photos: [] } };
    }
    
    // Create FormData for the request
    const payload = new FormData();
    payload.append('reportId', reportId);
    
    // Process photos in batches of 20 to respect multer's limit
    const BATCH_SIZE = 20;
    const results = [];
    
    for (let i = 0; i < photosToAnalyze.length; i += BATCH_SIZE) {
      const batch = photosToAnalyze.slice(i, i + BATCH_SIZE);
      const batchPayload = new FormData();
      batchPayload.append('reportId', reportId);
      
      // Process each photo in the batch
      batch.forEach((photo, index) => {
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
          // Use the correct field name format for multer
          batchPayload.append('photos', file);
          batchPayload.append(`photoMetadata[${index}]`, JSON.stringify({
            index: i + index, // Use global index
            id: photo._id || photo.id,
            clientId: photo.clientId || photo.id
          }));
        } else if (photo._id) {
          // If we don't have a local file but have a server ID, add it to photoIds
          const photoIds = JSON.parse(batchPayload.get('photoIds') || '[]');
          photoIds.push(photo._id);
          batchPayload.set('photoIds', JSON.stringify(photoIds));
        }
      });
      
      // Log what we're sending for this batch
      photoLogger.info(`Sending analysis request batch ${Math.floor(i/BATCH_SIZE) + 1} with:`, {
        reportId,
        photoCount: batch.length,
        hasFiles: batchPayload.has('photos'),
        hasPhotoIds: batchPayload.has('photoIds')
      });
      
      // Send analysis request for this batch
      const response = await api.post('/photos/analyze', batchPayload);
      
      if (response.data.success) {
        const responseData = response.data.data || response.data;
        const serverAnalyzedPhotos = responseData.photos || [];
        results.push(...serverAnalyzedPhotos);
      } else {
        photoLogger.error(`Photo analysis failed for batch ${Math.floor(i/BATCH_SIZE) + 1}:`, response.data.error);
        throw new Error(response.data.error || 'Analysis failed');
      }
      
      // Add a small delay between batches to avoid overwhelming the server
      if (i + BATCH_SIZE < photosToAnalyze.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // Transform all results to client format using schema
    const clientAnalyzedPhotos = results.map(photo => 
      // No client photos to merge with here, just use server data
      PhotoSchema.deserializeFromApi(photo)
    );
    
    return {
      success: true,
      data: {
        photos: clientAnalyzedPhotos
      }
    };
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