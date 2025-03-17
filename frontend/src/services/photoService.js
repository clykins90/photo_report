import api from './api';
import PhotoSchema from 'shared/schemas/photoSchema';
import { photoLogger } from '../utils/logger';
import { 
  createPhotoFromFile, 
  getPhotoUrl as getPhotoUrlUtil,
  preservePhotoData,
  dataURLtoBlob,
  getBestDataSource,
  groupPhotosByDataAvailability
} from '../utils/photoUtils';

/**
 * Simplified photo service for handling photo operations
 * Uses the shared PhotoSchema for consistent object handling
 */

/**
 * Get the URL for a photo - delegates to photoUtils
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
    
    // Create client photo objects for tracking
    const clientPhotos = Array.from(files).map(file => {
      // Create photo objects using our consolidated utility
      return createPhotoFromFile(file);
    });
    
    // Create form data for upload
    const formData = new FormData();
    formData.append('reportId', reportId);
    
    // Add client IDs for tracking
    const clientIds = clientPhotos.map(photo => photo.clientId || photo.id);
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
          
          // Call the progress callback with both the updated photos and the progress percentage
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
        const serverId = idMapping && idMapping[clientPhoto.clientId || clientPhoto.id];
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
          
          // Use our preservePhotoData function to ensure consistency
          return preservePhotoData(mergedPhoto);
        }
        
        return preservePhotoData(clientPhoto);
      });
      
      // Log the photo data availability
      photoLogger.info('Upload complete with photos:', 
        uploadedPhotos.map(p => ({
          id: p._id || p.id,
          hasFile: !!p.file,
          hasPreview: !!p.preview
        }))
      );
      
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
        ...createPhotoFromFile(file),
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
    
    // Group photos by data availability
    let photoIds = [];
    let photosWithLocalData = [];
    
    if (hasPhotoObjects) {
      // Process photo objects to determine which ones have local data
      const photoObjects = photosOrIds.filter(item => typeof item === 'object');
      
      // Use the groupPhotosByDataAvailability utility to separate photos with local data
      const { withLocalData, needsServerAnalysis } = groupPhotosByDataAvailability(photoObjects);
      photosWithLocalData = withLocalData;
      photoIds = needsServerAnalysis.map(photo => photo._id || photo.id).filter(id => id);
      
      photoLogger.info(`Analyzing ${photosWithLocalData.length} photos with local data and ${photoIds.length} photos from server for report ${reportId}`);
    } else {
      // If we only have IDs, we need to get them from the server
      photoIds = photosOrIds.filter(id => id);
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