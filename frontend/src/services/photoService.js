import api from './api';

/**
 * Get the proper URL for a photo file
 * @param {string} filename - The filename or full object with uploadedData
 * @returns {string} - The URL to access the photo
 */
export const getPhotoUrl = (fileOrFilename) => {
  const baseApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
  const apiBase = baseApiUrl.endsWith('/') ? baseApiUrl.slice(0, -1) : baseApiUrl;
  
  // If given a string filename, use it directly
  if (typeof fileOrFilename === 'string') {
    return `${apiBase}/api/photos/${fileOrFilename}`;
  }
  
  // If file has no data, return placeholder
  if (!fileOrFilename) {
    return '/placeholder-image.png';
  }
  
  // For local files that aren't uploaded yet, use the preview URL
  if (fileOrFilename.status === 'pending' && fileOrFilename.preview) {
    return fileOrFilename.preview;
  }
  
  // For uploaded files, use server URLs
  if (fileOrFilename.uploadedData) {
    // First prioritize direct URLs if they exist
    if (fileOrFilename.uploadedData.thumbnailUrl) {
      return fileOrFilename.uploadedData.thumbnailUrl;
    }
    
    if (fileOrFilename.uploadedData.optimizedUrl) {
      return fileOrFilename.uploadedData.optimizedUrl;
    }
    
    // Fallback to filename-based URLs
    if (fileOrFilename.uploadedData.thumbnailFilename) {
      return `${apiBase}/api/photos/${fileOrFilename.uploadedData.thumbnailFilename}`;
    }
    
    if (fileOrFilename.uploadedData.optimizedFilename) {
      return `${apiBase}/api/photos/${fileOrFilename.uploadedData.optimizedFilename}`;
    }
    
    if (fileOrFilename.uploadedData.filename) {
      return `${apiBase}/api/photos/${fileOrFilename.uploadedData.filename}`;
    }
  }
  
  // Direct URLs on the file object (some APIs might structure data this way)
  if (fileOrFilename.thumbnailUrl) {
    return fileOrFilename.thumbnailUrl;
  }
  
  if (fileOrFilename.optimizedUrl) {
    return fileOrFilename.optimizedUrl;
  }
  
  if (fileOrFilename.url) {
    return fileOrFilename.url;
  }
  
  // Check if we have an ID that might be used directly in the URL
  if (fileOrFilename._id) {
    return `${apiBase}/api/files/${fileOrFilename._id}`;
  }
  
  // Fallback to placeholder
  console.warn('Unable to determine photo URL from object:', fileOrFilename);
  return '/placeholder-image.png';
};

/**
 * Upload multiple photos to the server
 * @param {File[]} files - Array of file objects to upload
 * @param {string|null} reportId - Optional report ID to associate photos with
 * @param {Function} progressCallback - Optional callback for upload progress
 * @returns {Promise} - Promise resolving to the server response
 */
export const uploadBatchPhotos = async (files, reportId = null, progressCallback = null) => {
  try {
    if (!files || files.length === 0) {
      throw new Error('No files provided for upload');
    }

    const formData = new FormData();
    
    // Add each file to the form data
    files.forEach(file => {
      formData.append('photos', file);
    });
    
    // Add reportId if provided
    if (reportId) {
      formData.append('reportId', reportId);
    }
    
    // Create config with progress tracking if callback provided
    const config = {};
    if (progressCallback) {
      config.onUploadProgress = progressEvent => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        progressCallback(percentCompleted);
      };
    }
    
    // Send the upload request
    const response = await api.post('/api/photos/upload', formData, config);
    
    return {
      success: true,
      files: response.data.files || []
    };
  } catch (error) {
    console.error('Photo batch upload failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to upload photos'
    };
  }
};

/**
 * Upload a single photo to the server
 * @param {File} file - The file to upload
 * @param {string|null} reportId - Optional report ID to associate the photo with
 * @param {Function} progressCallback - Optional callback for upload progress
 * @returns {Promise} - Promise resolving to the server response
 */
export const uploadSinglePhoto = async (file, reportId = null, progressCallback = null) => {
  try {
    if (!file) {
      throw new Error('No file provided for upload');
    }
    
    const formData = new FormData();
    formData.append('photos', file); // Use 'photos' to match consolidated endpoint
    
    // Add reportId if provided
    if (reportId) {
      formData.append('reportId', reportId);
    }
    
    // Create config with progress tracking if callback provided
    const config = {};
    if (progressCallback) {
      config.onUploadProgress = progressEvent => {
        const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        progressCallback(percentCompleted);
      };
    }
    
    // Send the upload request using the consolidated endpoint
    const response = await api.post('/api/photos/upload', formData, config);
    
    // Return the first file from the response since we only uploaded one
    return {
      success: true,
      file: response.data.files && response.data.files.length > 0 
        ? response.data.files[0] 
        : null
    };
  } catch (error) {
    console.error('Photo upload failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to upload photo'
    };
  }
};

/**
 * Analyze a photo using AI
 * @param {Object} photo - Photo object with ID or filename
 * @returns {Promise} - Promise resolving to the analysis results
 */
export const analyzePhoto = async (photo) => {
  try {
    if (!photo) {
      throw new Error('No photo provided for analysis');
    }
    
    // Get the photo ID - try several possible properties
    const photoId = photo._id || photo.id || photo.gridfsId || 
                   (photo.uploadedData ? photo.uploadedData.gridfsId : null);
                   
    if (!photoId) {
      throw new Error('Photo ID not found. Make sure the photo has been uploaded first.');
    }
    
    // Send the analysis request
    const response = await api.post(`/api/photos/analyze/${photoId}`);
    
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    console.error('Photo analysis failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to analyze photo'
    };
  }
};

/**
 * Analyze multiple photos using AI
 * @param {Array} photos - Array of photo objects with IDs
 * @returns {Promise} - Promise resolving to the analysis results
 */
export const analyzeBatchPhotos = async (photos) => {
  try {
    if (!photos || photos.length === 0) {
      throw new Error('No photos provided for analysis');
    }
    
    // Extract photo IDs using a simplified, consistent approach
    const fileIds = photos.map(photo => {
      // Use a consistent priority order for ID extraction
      let id = null;
      
      // Priority 1: GridFS original ID (most reliable)
      if (photo.uploadedData?.gridfs?.original) {
        id = photo.uploadedData.gridfs.original;
      } 
      // Priority 2: GridFS optimized ID
      else if (photo.uploadedData?.gridfs?.optimized) {
        id = photo.uploadedData.gridfs.optimized;
      }
      // Priority 3: GridFS ID from uploadedData
      else if (photo.uploadedData?.gridfsId) {
        id = photo.uploadedData.gridfsId;
      }
      // Priority 4: Direct _id field
      else if (photo._id) {
        id = photo._id;
      }
      // Priority 5: id field (if it looks like a MongoDB ObjectId)
      else if (photo.id && typeof photo.id === 'string' && /^[0-9a-fA-F]{24}$/.test(photo.id)) {
        id = photo.id;
      }
      
      return id;
    }).filter(Boolean); // Remove any null/undefined IDs
    
    if (fileIds.length === 0) {
      throw new Error('No valid photo IDs found for analysis');
    }
    
    // Send the batch analysis request
    const response = await api.post('/api/photos/analyze-batch', { fileIds });
    
    return {
      success: true,
      data: response.data.data
    };
  } catch (error) {
    console.error('Batch photo analysis failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to analyze photos'
    };
  }
};

/**
 * Delete a photo from the server
 * @param {string} photoId - ID of the photo to delete
 * @returns {Promise} - Promise resolving to the server response
 */
export const deletePhoto = async (photoId) => {
  try {
    if (!photoId) {
      throw new Error('No photo ID provided for deletion');
    }
    
    // Send the delete request
    const response = await api.delete(`/api/photos/${photoId}`);
    
    return {
      success: true,
      message: response.data.message || 'Photo deleted successfully'
    };
  } catch (error) {
    console.error('Photo deletion failed:', error);
    return {
      success: false,
      error: error.message || 'Failed to delete photo'
    };
  }
};

export default {
  uploadBatchPhotos,
  uploadSinglePhoto,
  analyzePhoto,
  analyzeBatchPhotos,
  deletePhoto,
  getPhotoUrl
}; 