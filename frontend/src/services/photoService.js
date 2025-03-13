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
 * Upload a single photo
 * @param {File} file - The photo file to upload
 * @param {String} reportId - Optional report ID to associate with the photo
 * @returns {Promise} - The response from the API
 */
export const uploadSinglePhoto = async (file, reportId = null) => {
  const formData = new FormData();
  formData.append('photo', file);
  
  // Add reportId if provided
  if (reportId) {
    formData.append('reportId', reportId);
    console.log('Associating photo with report:', reportId);
  }
  
  console.log('Uploading single photo with field name "photo":', file.name);

  // Let Axios handle the Content-Type automatically
  const response = await api.post('/api/photos/single', formData);

  return response.data;
};

/**
 * Upload multiple photos
 * @param {FormData|Array<File>} filesOrFormData - FormData object or array of photo files to upload
 * @returns {Promise} - The response from the API
 */
export const uploadBatchPhotos = async (files, reportId = null, onProgress = null) => {
  const formData = new FormData();
  
  // Add each file to the form data with the field name 'photos'
  files.forEach(file => {
    formData.append('photos', file);
  });
  
  // Add reportId if provided
  if (reportId) {
    formData.append('reportId', reportId);
    console.log('Associating batch photos with report:', reportId);
  }
  
  console.log(`Uploading ${files.length} photos with field name "photos"`);
  
  // Create config with upload progress tracking if callback provided
  const config = {};
  
  if (onProgress) {
    config.onUploadProgress = progressEvent => {
      const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
      onProgress(percentCompleted);
    };
  }

  // Let Axios handle the Content-Type automatically
  const response = await api.post('/api/photos/batch', formData, config);

  return response.data;
};

/**
 * Analyze a photo using AI
 * @param {object} photo - The photo object to analyze
 * @returns {Promise} - The response from the API
 */
export const analyzePhoto = async (photo) => {
  let fileId;
  
  // Extract the file ID from the photo object
  if (photo.uploadedData && photo.uploadedData.gridfs) {
    // Prefer the optimized version for analysis if available
    fileId = photo.uploadedData.gridfs.optimized || photo.uploadedData.gridfs.original;
  } 
  // Try to extract ID from URL if available
  else if (photo.uploadedData && photo.uploadedData.optimizedUrl) {
    const urlParts = photo.uploadedData.optimizedUrl.split('/');
    fileId = urlParts[urlParts.length - 1];
  }
  else if (photo.uploadedData && photo.uploadedData.thumbnailUrl) {
    const urlParts = photo.uploadedData.thumbnailUrl.split('/');
    fileId = urlParts[urlParts.length - 1];
  }
  // If photo has direct _id
  else if (photo._id) {
    fileId = photo._id;
  }
  
  if (!fileId) {
    console.error('Unable to determine file ID for analysis:', photo);
    throw new Error('Unable to determine file ID for analysis. The photo may not have been properly uploaded.');
  }
  
  console.log('Analyzing photo with ID:', fileId);
  const response = await api.post(`/api/photos/analyze-by-id/${fileId}`);
  return response.data;
};

/**
 * Analyze multiple photos in a batch (up to 20 at once)
 * @param {Array<object>} photos - Array of photo objects to analyze
 * @returns {Promise} - The response from the API with all analysis results
 */
export const analyzeBatchPhotos = async (photos) => {
  if (!photos || photos.length === 0) {
    throw new Error('No photos provided for batch analysis');
  }

  // Extract file IDs from the photos
  const fileIds = photos.map(photo => {
    let fileId;
    
    if (photo.uploadedData && photo.uploadedData.gridfs) {
      // Prefer the optimized version for analysis if available
      fileId = photo.uploadedData.gridfs.optimized || photo.uploadedData.gridfs.original;
    } 
    else if (photo.uploadedData && photo.uploadedData.optimizedUrl) {
      const urlParts = photo.uploadedData.optimizedUrl.split('/');
      fileId = urlParts[urlParts.length - 1];
    }
    else if (photo.uploadedData && photo.uploadedData.thumbnailUrl) {
      const urlParts = photo.uploadedData.thumbnailUrl.split('/');
      fileId = urlParts[urlParts.length - 1];
    }
    else if (photo._id) {
      fileId = photo._id;
    }
    
    if (!fileId) {
      console.error('Unable to determine file ID for batch analysis:', photo);
      return null;
    }
    
    return fileId;
  }).filter(id => id !== null);

  if (fileIds.length === 0) {
    throw new Error('No valid photo IDs found for batch analysis');
  }

  console.log(`Analyzing batch of ${fileIds.length} photos`);
  const response = await api.post('/api/photos/analyze-batch', { fileIds });
  return response.data;
};

/**
 * Delete a photo
 * @param {object} photo - The photo object to delete
 * @returns {Promise} - The response from the API
 */
export const deletePhoto = async (photo) => {
  let fileId;
  
  // Extract the file ID from the photo object
  if (photo.uploadedData && photo.uploadedData.gridfs) {
    // Use the original file's ID for deletion
    fileId = photo.uploadedData.gridfs.original;
  } 
  // Try to extract ID from URL if available
  else if (photo.uploadedData && photo.uploadedData.optimizedUrl) {
    const urlParts = photo.uploadedData.optimizedUrl.split('/');
    fileId = urlParts[urlParts.length - 1];
  }
  else if (photo.uploadedData && photo.uploadedData.thumbnailUrl) {
    const urlParts = photo.uploadedData.thumbnailUrl.split('/');
    fileId = urlParts[urlParts.length - 1];
  }
  // If photo has direct _id
  else if (photo._id) {
    fileId = photo._id;
  }
  
  if (!fileId) {
    console.error('Unable to determine file ID for deletion:', photo);
    throw new Error('Unable to determine file ID for deletion. The photo may not have been properly uploaded.');
  }
  
  console.log('Deleting photo with ID:', fileId);
  const response = await api.delete(`/api/photos/delete-by-id/${fileId}`);
  return response.data;
}; 