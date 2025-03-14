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
  // If given a string ID, validate it looks like a MongoDB ObjectId
  if (typeof fileOrId === 'string') {
    // Basic validation for MongoDB ObjectId format (24 hex chars)
    if (/^[0-9a-fA-F]{24}$/.test(fileOrId)) {
      return `/api/photos/${fileOrId}?size=${size}`;
    } else {
      photoLogger(`Invalid photo ID format: ${fileOrId}`, null, true);
      return '/placeholder-image.png';
    }
  }
  
  // If file has no data, return placeholder
  if (!fileOrId) {
    return '/placeholder-image.png';
  }
  
  // PRIORITY 1: Always use preview URL if available, regardless of status
  // This ensures blob URLs are used when available
  if (fileOrId.preview) {
    return fileOrId.preview;
  }
  
  // PRIORITY 2: If we have a MongoDB ObjectId, validate and use that
  if (fileOrId._id) {
    // Basic validation for MongoDB ObjectId format
    if (typeof fileOrId._id === 'string' && /^[0-9a-fA-F]{24}$/.test(fileOrId._id)) {
      return `/api/photos/${fileOrId._id}?size=${size}`;
    } else {
      photoLogger(`Invalid photo _id format: ${fileOrId._id}`, fileOrId, true);
    }
  }
  
  // PRIORITY 3: If we have a filename, use that
  if (fileOrId.filename) {
    return `/api/photos/${fileOrId.filename}?size=${size}`;
  }
  
  // For local files that aren't uploaded yet, use the preview URL
  // This now handles 'uploading' status as well
  if (fileOrId.preview && (fileOrId.status === 'pending' || fileOrId.status === 'complete' || fileOrId.status === 'error' || fileOrId.status === 'uploading')) {
    return fileOrId.preview;
  }
  
  // Fallback to placeholder - only log in development to reduce noise
  if (process.env.NODE_ENV === 'development') {
    photoLogger('Unable to determine photo URL from object:', fileOrId, true);
  }
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
    
    // Log file names for debugging
    photoLogger('Files being uploaded:', files.map(f => f.name));

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
    
    // Log the full response for debugging
    photoLogger('Full server response:', response.data);
    
    // Validate the response structure
    if (!response.data.photos || !Array.isArray(response.data.photos)) {
      photoLogger('Invalid response format - missing photos array:', response.data, true);
      throw new Error('Server returned invalid response format');
    }
    
    photoLogger(`Upload complete: ${response.data.count} photos uploaded`);
    photoLogger('Uploaded photo details:', response.data.photos);
    
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

    photoLogger(`Analyzing all photos for report: ${reportId}`);

    // Don't include any query parameters
    const response = await api.post(`/photos/analyze/${reportId}`);
    
    photoLogger(`Analysis complete: ${response.data.results?.length || 0} photos analyzed`);
    
    return {
      success: true,
      results: response.data.results?.map(result => ({
        photoId: result.photoId,
        status: result.status,
        analysis: result.analysis,
        error: result.error
      })) || []
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
 * @param {string} reportId - ID of the report containing the photo
 * @returns {Promise} - Promise resolving to the server response
 */
export const analyzePhoto = async (photo, reportId) => {
  try {
    if (!photo) {
      throw new Error('Valid photo object is required for analysis');
    }

    if (!reportId) {
      throw new Error('Report ID is required for photo analysis');
    }

    // Only use MongoDB ObjectID (24 hex chars)
    if (!photo._id || typeof photo._id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(photo._id)) {
      throw new Error('Photo must have a valid MongoDB ObjectID (_id). Make sure the photo is properly uploaded first.');
    }

    const photoId = photo._id;
    
    photoLogger(`Analyzing single photo with MongoDB ObjectID: ${photoId} for report: ${reportId}`);

    // Use URL parameter for reportId without any query parameters
    const response = await api.post(`/photos/analyze/${reportId}`, { 
      photoId: photoId
    });
    
    photoLogger(`Analysis complete for photo: ${photoId}`);
    
    // Extract the result for this specific photo
    const result = response.data.results?.find(r => r.photoId === photoId);
    
    if (!result) {
      throw new Error('No analysis result returned for this photo');
    }
    
    return {
      success: result.status === 'success',
      data: result.analysis,
      error: result.error
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
 * @param {string} reportId - ID of the report containing the photos
 * @returns {Promise} - Promise resolving to the server response
 */
export const analyzeBatchPhotos = async (photos, reportId) => {
  try {
    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      throw new Error('Valid array of photos is required for batch analysis');
    }

    if (!reportId) {
      throw new Error('Report ID is required for batch photo analysis');
    }

    photoLogger(`Analyzing batch of ${photos.length} photos for report: ${reportId}`);

    // Extract ONLY MongoDB ObjectIDs (24 hex chars)
    // This is the simplest solution - only send valid MongoDB IDs to the backend
    const photoIds = photos
      .filter(photo => photo._id && typeof photo._id === 'string' && /^[0-9a-fA-F]{24}$/.test(photo._id))
      .map(photo => photo._id);
    
    if (photoIds.length === 0) {
      throw new Error('No valid MongoDB ObjectIDs found in the photos. Make sure photos are properly uploaded first.');
    }
    
    photoLogger(`Extracted ${photoIds.length} MongoDB ObjectIDs for analysis:`, photoIds);
    
    // Use URL parameter for reportId and send photoIds in the request body
    // Don't include any query parameters
    const response = await api.post(`/photos/analyze/${reportId}`, { 
      photoIds: photoIds
    });
    
    photoLogger(`Batch analysis complete for ${response.data.results?.length || 0} photos`);
    
    // Map the results to the expected format
    const results = response.data.results?.map(result => ({
      success: result.status === 'success',
      fileId: result.photoId,
      data: result.analysis,
      error: result.error
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