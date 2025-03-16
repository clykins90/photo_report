import api from './api';
import PhotoSchema from 'shared/schemas/photoSchema';
import { photoLogger } from '../utils/logger';

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
  // Extract the ID from the photo object or use the ID directly
  const photoId = typeof photoOrId === 'object' ? 
    (photoOrId._id || photoOrId.fileId || photoOrId.id) : 
    photoOrId;
  
  // Return preview URL if available (for client-side preview)
  if (typeof photoOrId === 'object' && photoOrId.preview) {
    return photoOrId.preview;
  }
  
  if (!photoId) {
    return '';
  }
  
  // Generate appropriate URL based on size
  const baseUrl = `/api/photos/${photoId}`;
  
  switch(size) {
    case 'thumbnail':
      return `${baseUrl}?size=thumbnail`;
    case 'medium':
      return `${baseUrl}?size=medium`;
    default:
      return baseUrl;
  }
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
          // Deserialize the server response
          return PhotoSchema.deserializeFromApi({
            ...serverPhoto,
            // Keep client-side preview URL
            preview: clientPhoto.preview
          });
        }
        
        return clientPhoto;
      });
      
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
    
    // If we have photo objects, check for local data (file or data URL)
    if (hasPhotoObjects) {
      const photos = photosOrIds;
      
      // Create results array
      const results = [];
      
      // Process each photo
      for (const photo of photos) {
        try {
          // Basic metadata analysis
          const localAnalysis = {
            timestamp: new Date().toISOString(),
            dimensions: { width: 0, height: 0 },
            size: photo.size || 0,
            type: photo.type || 'unknown',
            hasLocalData: !!photo.file || !!photo.localDataUrl
          };
          
          // If we have a file or data URL, get dimensions
          if (photo.file || photo.localDataUrl) {
            // Create an image element to get dimensions
            const img = new Image();
            const imageLoadPromise = new Promise((resolve, reject) => {
              img.onload = () => {
                localAnalysis.dimensions = {
                  width: img.naturalWidth,
                  height: img.naturalHeight
                };
                resolve();
              };
              img.onerror = () => {
                reject(new Error('Failed to load image for analysis'));
              };
            });
            
            // Set source to either file or data URL
            if (photo.localDataUrl) {
              img.src = photo.localDataUrl;
            } else if (photo.file) {
              img.src = URL.createObjectURL(photo.file);
            }
            
            // Wait for image to load
            await imageLoadPromise;
            
            // Clean up object URL if created
            if (photo.file && img.src.startsWith('blob:')) {
              URL.revokeObjectURL(img.src);
            }
          }
          
          // Prepare image data for upload (either from file or data URL)
          let imageData;
          if (photo.file) {
            imageData = photo.file;
          } else if (photo.localDataUrl) {
            // Convert data URL to blob
            const response = await fetch(photo.localDataUrl);
            imageData = await response.blob();
          } else {
            // If no local data, try to fetch from URL if there's a preview
            try {
              const photoUrl = getPhotoUrl(photo);
              if (photoUrl && !photoUrl.startsWith('/api/')) {
                const response = await fetch(photoUrl);
                if (response.ok) {
                  imageData = await response.blob();
                }
              }
            } catch (error) {
              photoLogger.error('Failed to fetch photo from URL:', error);
            }
          }
          
          if (imageData) {
            // We have the image data, send it directly to the server
            // Create a FormData object to send the image
            const formData = new FormData();
            formData.append('reportId', reportId);
            formData.append('photo', imageData, photo.name || 'photo.jpg');
            
            // Add photo ID if available for server-side tracking
            if (photo._id) {
              formData.append('photoId', photo._id);
            } else if (photo.id) {
              formData.append('photoId', photo.id);
            }
            
            // Send to server for AI analysis
            const response = await api.post('/photos/analyze-single', formData, {
              headers: {
                'Content-Type': 'multipart/form-data'
              }
            });
            
            if (response.data.success) {
              results.push({
                success: true,
                photoId: photo._id || photo.id || photo.clientId,
                data: response.data.data || response.data
              });
            } else {
              results.push({
                success: false,
                photoId: photo._id || photo.id || photo.clientId,
                error: response.data.error || 'Analysis failed'
              });
            }
          } else if (photo._id || photo.id) {
            // No local data but we have an ID, add it to the ID-based analysis queue
            photoLogger.info(`No local data for photo ${photo._id || photo.id}, will use server-side analysis`);
            results.push({
              success: false,
              photoId: photo._id || photo.id,
              error: 'No local data available, falling back to server-side analysis'
            });
          } else {
            // No ID and no data, can't analyze
            results.push({
              success: false,
              photoId: photo.clientId || 'unknown',
              error: 'No image data or ID available for analysis'
            });
          }
        } catch (error) {
          photoLogger.error('Error analyzing photo:', error);
          results.push({
            success: false,
            photoId: photo._id || photo.id || photo.clientId || 'unknown',
            error: error.message || 'Analysis failed'
          });
        }
      }
      
      // Determine overall success
      const overallSuccess = results.some(result => result.success);
      
      return {
        success: overallSuccess,
        results: results
      };
    } else {
      // We're dealing with just IDs, use the original server-side analysis
      const photoIds = photosOrIds;
      
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
        // Transform photos to client format if needed
        const analyzedPhotos = (responseData.photos || []).map(photo => 
          PhotoSchema.deserializeFromApi(photo)
        );
        
        return {
          success: true,
          data: {
            photos: analyzedPhotos
          }
        };
      } else {
        return {
          success: false,
          error: response.data.error || 'Analysis failed'
        };
      }
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