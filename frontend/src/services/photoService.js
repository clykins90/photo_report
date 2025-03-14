import api from './api';

/**
 * Utility function to control logging verbosity
 * @param {string} message - Message to log
 * @param {any} data - Optional data to log
 * @param {boolean} isError - Whether this is an error log
 * @param {boolean} forceLog - Whether to force logging regardless of batch size
 */
const photoLogger = (message, data = null, isError = false, forceLog = false) => {
  // Get environment variable or localStorage setting for verbose logging
  const verboseLogging = import.meta.env.VITE_VERBOSE_PHOTO_LOGGING === 'true' || 
                         localStorage.getItem('verbosePhotoLogging') === 'true';
  
  // Always log errors, or if verbose logging is enabled, or if forced
  if (isError || verboseLogging || forceLog) {
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
 * @param {string} filename - The filename or full object with uploadedData
 * @returns {string} - The URL to access the photo
 */
export const getPhotoUrl = (fileOrFilename) => {
  const baseApiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001';
  const apiBase = baseApiUrl.endsWith('/') ? baseApiUrl.slice(0, -1) : baseApiUrl;
  
  // Enable verbose logging for debugging
  const verboseLogging = import.meta.env.VITE_VERBOSE_PHOTO_LOGGING === 'true' || 
                         localStorage.getItem('verbosePhotoLogging') === 'true' ||
                         true; // Force enable for debugging
  
  // Function to create a proper API URL that avoids duplicate /api prefixes
  const createApiUrl = (path) => {
    // Check if baseApiUrl already ends with /api
    const isApiBase = apiBase === '/api';
    
    // Check if base path contains "/api" at the end
    const baseEndsWithApi = apiBase.endsWith('/api');
    
    // Create proper URL structure based on environment
    let url;
    if (isApiBase) {
      // When base is exactly '/api', just append path segments
      url = `/api/photos/${path}`;
    } else if (baseEndsWithApi) {
      // When base ends with /api but isn't exactly '/api'
      url = `${apiBase}/photos/${path}`;
    } else {
      // Default case: full path with /api
      url = `${apiBase}/api/photos/${path}`;
    }
    
    if (verboseLogging) {
      photoLogger(`Created API URL: ${url} from path: ${path}`, null, false, true);
    }
    
    return url;
  };
  
  // If given a string filename, use it directly
  if (typeof fileOrFilename === 'string') {
    if (verboseLogging) {
      photoLogger(`Creating URL from string filename: ${fileOrFilename}`, null, false, true);
    }
    return createApiUrl(fileOrFilename);
  }
  
  // If file has no data, return placeholder
  if (!fileOrFilename) {
    if (verboseLogging) {
      photoLogger('No file or filename provided, returning placeholder', null, false, true);
    }
    return '/placeholder-image.png';
  }
  
  // Try to get a URL using various properties, with detailed logging
  
  // First, prioritize direct URLs from the server (these are absolute URLs)
  if (fileOrFilename.thumbnailUrl) {
    if (verboseLogging) photoLogger(`Using thumbnailUrl: ${fileOrFilename.thumbnailUrl}`, null, false, true);
    return fileOrFilename.thumbnailUrl;
  }
  
  if (fileOrFilename.optimizedUrl) {
    if (verboseLogging) photoLogger(`Using optimizedUrl: ${fileOrFilename.optimizedUrl}`, null, false, true);
    return fileOrFilename.optimizedUrl;
  }
  
  if (fileOrFilename.originalUrl) {
    if (verboseLogging) photoLogger(`Using originalUrl: ${fileOrFilename.originalUrl}`, null, false, true);
    return fileOrFilename.originalUrl;
  }
  
  // For uploaded files, use server URLs from uploadedData
  if (fileOrFilename.uploadedData) {
    if (fileOrFilename.uploadedData.thumbnailUrl) {
      if (verboseLogging) photoLogger(`Using uploadedData.thumbnailUrl`, null, false, true);
      return fileOrFilename.uploadedData.thumbnailUrl;
    }
    
    if (fileOrFilename.uploadedData.optimizedUrl) {
      if (verboseLogging) photoLogger(`Using uploadedData.optimizedUrl`, null, false, true);
      return fileOrFilename.uploadedData.optimizedUrl;
    }
    
    if (fileOrFilename.uploadedData.originalUrl) {
      if (verboseLogging) photoLogger(`Using uploadedData.originalUrl`, null, false, true);
      return fileOrFilename.uploadedData.originalUrl;
    }
    
    // Fallback to filename-based URLs
    if (fileOrFilename.uploadedData.thumbnailFilename) {
      if (verboseLogging) photoLogger(`Using uploadedData.thumbnailFilename`, null, false, true);
      return createApiUrl(fileOrFilename.uploadedData.thumbnailFilename);
    }
    
    if (fileOrFilename.uploadedData.optimizedFilename) {
      if (verboseLogging) photoLogger(`Using uploadedData.optimizedFilename`, null, false, true);
      return createApiUrl(fileOrFilename.uploadedData.optimizedFilename);
    }
    
    if (fileOrFilename.uploadedData.filename) {
      if (verboseLogging) photoLogger(`Using uploadedData.filename`, null, false, true);
      return createApiUrl(fileOrFilename.uploadedData.filename);
    }
    
    // Try using the GridFS ID if available
    if (fileOrFilename.uploadedData.gridfsId) {
      if (verboseLogging) photoLogger(`Using uploadedData.gridfsId`, null, false, true);
      return createApiUrl(fileOrFilename.uploadedData.gridfsId);
    }
  }
  
  // Check for MongoDB ObjectId
  if (fileOrFilename._id) {
    if (verboseLogging) photoLogger(`Using _id: ${fileOrFilename._id}`, null, false, true);
    return createApiUrl(fileOrFilename._id);
  }
  
  // Check for displayName property (our custom property)
  if (fileOrFilename.displayName) {
    if (verboseLogging) photoLogger(`Using displayName: ${fileOrFilename.displayName}`, null, false, true);
    return createApiUrl(fileOrFilename.displayName);
  }
  
  // If we have a name property, use that
  if (fileOrFilename.name) {
    if (verboseLogging) photoLogger(`Using name: ${fileOrFilename.name}`, null, false, true);
    return createApiUrl(fileOrFilename.name);
  }
  
  // If we have a filename property, use that
  if (fileOrFilename.filename) {
    if (verboseLogging) photoLogger(`Using filename: ${fileOrFilename.filename}`, null, false, true);
    return createApiUrl(fileOrFilename.filename);
  }
  
  // Handle path or relativePath directly
  if (fileOrFilename.path) {
    // Remove any leading ./ from the path
    const cleanPath = fileOrFilename.path.replace(/^\.\//, '');
    if (verboseLogging) photoLogger(`Using path: ${cleanPath}`, null, false, true);
    return createApiUrl(cleanPath);
  }
  
  if (fileOrFilename.relativePath) {
    // Remove any leading ./ from the path
    const cleanPath = fileOrFilename.relativePath.replace(/^\.\//, '');
    if (verboseLogging) photoLogger(`Using relativePath: ${cleanPath}`, null, false, true);
    return createApiUrl(cleanPath);
  }
  
  // Handle FileSystemFileHandle objects
  if (fileOrFilename.handle && fileOrFilename.handle.kind === 'file') {
    if (fileOrFilename.handle.name) {
      if (verboseLogging) photoLogger(`Using handle.name: ${fileOrFilename.handle.name}`, null, false, true);
      return createApiUrl(fileOrFilename.handle.name);
    }
  }
  
  // For local files that aren't uploaded yet, use the preview URL
  if (fileOrFilename.status === 'pending' && fileOrFilename.preview) {
    if (verboseLogging) photoLogger(`Using preview URL for pending file`, null, false, true);
    return fileOrFilename.preview;
  }
  
  // If we have an originalFile property with a name, use that
  if (fileOrFilename.originalFile && fileOrFilename.originalFile.name) {
    if (verboseLogging) photoLogger(`Using originalFile.name: ${fileOrFilename.originalFile.name}`, null, false, true);
    return createApiUrl(fileOrFilename.originalFile.name);
  }
  
  // If we have an id property that looks like a MongoDB ObjectId, use that
  if (fileOrFilename.id && typeof fileOrFilename.id === 'string' && /^[0-9a-fA-F]{24}$/.test(fileOrFilename.id)) {
    if (verboseLogging) photoLogger(`Using id as ObjectId: ${fileOrFilename.id}`, null, false, true);
    return createApiUrl(fileOrFilename.id);
  }
  
  // Fallback to placeholder
  photoLogger('Unable to determine photo URL from object:', fileOrFilename, true, true);
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

    // Log only basic info for batch uploads
    photoLogger(`Starting batch upload of ${files.length} photos${reportId ? ' for report: ' + reportId : ''}`, null, false, true);

    const formData = new FormData();
    
    // Add each file to the form data
    // Don't modify the file objects, just append them as-is
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
      // Initialize progress to 0
      progressCallback(0);
      
      config.onUploadProgress = progressEvent => {
        // Only update if we have total information
        if (progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          // Limit progress to 99% until server processing completes
          const cappedProgress = Math.min(percentCompleted, 99);
          progressCallback(cappedProgress);
        }
      };
    }
    
    // Send the upload request
    const response = await api.post('/api/photos/upload', formData, config);
    
    // Set progress to 100% when complete
    if (progressCallback) {
      progressCallback(100);
    }
    
    photoLogger(`Batch upload complete: ${response.data.files?.length || 0} files processed`, null, false, true);
    
    return {
      success: true,
      files: response.data.files || []
    };
  } catch (error) {
    photoLogger('Photo batch upload failed:', error, true, true);
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
    
    photoLogger(`Uploading single photo${reportId ? ' for report: ' + reportId : ''}`, file.name);
    
    const formData = new FormData();
    // Don't modify the file object, just append it as-is
    formData.append('photos', file); // Use 'photos' to match consolidated endpoint
    
    // Add reportId if provided
    if (reportId) {
      formData.append('reportId', reportId);
    }
    
    // Create config with progress tracking if callback provided
    const config = {};
    if (progressCallback) {
      // Initialize progress to 0
      progressCallback(0);
      
      config.onUploadProgress = progressEvent => {
        // Only update if we have total information
        if (progressEvent.total) {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          // Limit progress to 99% until server processing completes
          const cappedProgress = Math.min(percentCompleted, 99);
          progressCallback(cappedProgress);
        }
      };
    }
    
    // Send the upload request using the consolidated endpoint
    const response = await api.post('/api/photos/upload', formData, config);
    
    // Set progress to 100% when complete
    if (progressCallback) {
      progressCallback(100);
    }
    
    // Return the first file from the response since we only uploaded one
    return {
      success: true,
      file: response.data.files && response.data.files.length > 0 
        ? response.data.files[0] 
        : null
    };
  } catch (error) {
    photoLogger('Photo upload failed:', error, true);
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
    photoLogger('Photo analysis failed:', error, true);
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
    photoLogger('Batch photo analysis failed:', error, true, true);
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
    photoLogger('Photo deletion failed:', error, true);
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