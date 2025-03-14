import api from './api';

/**
 * Utility function to control logging verbosity
 * @param {string} message - Message to log
 * @param {any} data - Optional data to log
 * @param {boolean} isError - Whether this is an error log
 */
const photoLogger = (message, data = null, isError = false) => {
  // Get environment variable or localStorage setting for verbose logging
  const verboseLogging = import.meta.env.VITE_VERBOSE_PHOTO_LOGGING === 'true' || 
                         localStorage.getItem('verbosePhotoLogging') === 'true';
  
  // Always log errors, or if verbose logging is enabled
  if (isError || verboseLogging) {
    if (isError) {
      if (data) {
        console.error(message, data);
      } else {
        console.error(message);
      }
    } else {
      if (data) {
        console.log(message, data);
      } else {
        console.log(message);
      }
    }
  }
};

/**
 * Get the proper URL for a photo file
 * @param {Object|string} fileOrId - The photo object or ID
 * @param {string} size - Size of the photo (original or thumbnail)
 * @returns {string} - The URL to access the photo
 */
export const getPhotoUrl = (fileOrId, size = 'thumbnail') => {
  // If given a string ID, use it directly
  if (typeof fileOrId === 'string') {
    return `/api/photos/${fileOrId}?size=${size}`;
  }
  
  // If file has no data, return placeholder
  if (!fileOrId) {
    return '/placeholder-image.png';
  }
  
  // If we have a MongoDB ObjectId, use that
  if (fileOrId._id) {
    return `/api/photos/${fileOrId._id}?size=${size}`;
  }
  
  // If we have a filename, use that
  if (fileOrId.filename) {
    return `/api/photos/${fileOrId.filename}?size=${size}`;
  }
  
  // For local files that aren't uploaded yet, use the preview URL
  if (fileOrId.status === 'pending' && fileOrId.preview) {
    return fileOrId.preview;
  }
  
  // Fallback to placeholder
  photoLogger('Unable to determine photo URL from object:', fileOrId, true);
  return '/placeholder-image.png';
};

/**
 * Upload multiple photos to the server
 * @param {File[]} files - Array of file objects to upload
 * @param {string|null} reportId - Report ID to associate photos with
 * @param {Function} progressCallback - Optional callback for upload progress
 * @returns {Promise} - Promise resolving to the server response
 */
export const uploadBatchPhotos = async (files, reportId, progressCallback = null) => {
  try {
    if (!files || files.length === 0) {
      throw new Error('No files provided for upload');
    }

    if (!reportId) {
      throw new Error('Report ID is required for photo upload');
    }

    photoLogger(`Uploading ${files.length} photos for report: ${reportId}`);

    const formData = new FormData();
    
    // Add each file to the form data
    files.forEach(file => {
      formData.append('photos', file);
    });
    
    // Add reportId
    formData.append('reportId', reportId);
    
    // Create config with progress tracking if callback provided
    const config = {};
    if (progressCallback) {
      config.onUploadProgress = (progressEvent) => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        progressCallback(percentCompleted);
      };
    }
    
    // Send the request
    const response = await api.post('/photos/upload', formData, config);
    
    photoLogger(`Upload complete: ${response.data.count} photos uploaded`);
    
    return {
      success: true,
      photos: response.data.photos
    };
  } catch (error) {
    photoLogger('Error uploading photos:', error, true);
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to upload photos'
    };
  }
};

/**
 * Analyze photos for a report using AI
 * @param {string} reportId - ID of the report containing photos to analyze
 * @returns {Promise} - Promise resolving to the server response
 */
export const analyzePhotos = async (reportId) => {
  try {
    if (!reportId) {
      throw new Error('Report ID is required for photo analysis');
    }

    photoLogger(`Analyzing photos for report: ${reportId}`);

    const response = await api.post('/photos/analyze', { reportId });
    
    photoLogger(`Analysis complete: ${response.data.count} photos analyzed`);
    
    return {
      success: true,
      results: response.data.results
    };
  } catch (error) {
    photoLogger('Error analyzing photos:', error, true);
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to analyze photos'
    };
  }
};

/**
 * Delete a photo
 * @param {string} photoId - ID of the photo to delete
 * @returns {Promise} - Promise resolving to the server response
 */
export const deletePhoto = async (photoId) => {
  try {
    if (!photoId) {
      throw new Error('Photo ID is required for deletion');
    }

    photoLogger(`Deleting photo: ${photoId}`);

    const response = await api.delete(`/photos/${photoId}`);
    
    photoLogger('Photo deleted successfully');
    
    return {
      success: true,
      message: response.data.message
    };
  } catch (error) {
    photoLogger('Error deleting photo:', error, true);
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to delete photo'
    };
  }
};

/**
 * Analyze a single photo using AI
 * @param {Object} photo - Photo object to analyze
 * @returns {Promise} - Promise resolving to the server response
 */
export const analyzePhoto = async (photo) => {
  try {
    if (!photo || (!photo._id && !photo.id)) {
      throw new Error('Valid photo object is required for analysis');
    }

    const photoId = photo._id || photo.id;
    photoLogger(`Analyzing single photo: ${photoId}`);

    // This function now delegates to the analyzePhotos endpoint
    // which expects a reportId, but we can also pass a specific photoId
    const response = await api.post('/photos/analyze', { 
      photoId: photoId 
    });
    
    photoLogger(`Analysis complete for photo: ${photoId}`);
    
    // Extract the result for this specific photo
    const result = response.data.results?.find(r => r.photoId === photoId);
    
    if (!result) {
      throw new Error('No analysis result returned for this photo');
    }
    
    return {
      success: true,
      data: result.analysis
    };
  } catch (error) {
    photoLogger('Error analyzing photo:', error, true);
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to analyze photo'
    };
  }
};

/**
 * Analyze a batch of photos using AI
 * @param {Object[]} photos - Array of photo objects to analyze
 * @returns {Promise} - Promise resolving to the server response
 */
export const analyzeBatchPhotos = async (photos) => {
  try {
    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      throw new Error('Valid array of photos is required for batch analysis');
    }

    photoLogger(`Analyzing batch of ${photos.length} photos`);

    // Extract photo IDs
    const photoIds = photos.map(photo => photo._id || photo.id).filter(Boolean);
    
    if (photoIds.length === 0) {
      throw new Error('No valid photo IDs found in the batch');
    }
    
    // Call the analyze endpoint with the photo IDs
    const response = await api.post('/photos/analyze', { 
      photoIds: photoIds 
    });
    
    photoLogger(`Batch analysis complete for ${response.data.results?.length || 0} photos`);
    
    // Map the results to the expected format
    const results = response.data.results?.map(result => ({
      success: true,
      fileId: result.photoId,
      data: result.analysis
    })) || [];
    
    return {
      success: true,
      data: results
    };
  } catch (error) {
    photoLogger('Error analyzing batch of photos:', error, true);
    return {
      success: false,
      error: error.response?.data?.error || error.message || 'Failed to analyze photos'
    };
  }
};

export default {
  uploadBatchPhotos,
  analyzePhotos,
  analyzePhoto,
  analyzeBatchPhotos,
  deletePhoto,
  getPhotoUrl
}; 