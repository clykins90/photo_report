/**
 * Photo utilities for standardizing and transforming photo objects
 * This centralizes all photo object operations to ensure consistent structure
 * Also includes file handling functions for photo-related operations
 */

import PhotoSchema from 'shared/schemas/photoSchema';
import { createAndTrackBlobUrl } from './blobUrlManager';

/**
 * Standard photo object structure
 * @typedef {Object} PhotoObject
 * @property {string} id - Client-side ID (temporary)
 * @property {string} _id - Server-side MongoDB ID
 * @property {string} name - Display name of the photo
 * @property {File} [file] - Original file object (client-side only)
 * @property {string} [preview] - Blob URL or data URL for preview
 * @property {string} [url] - Server URL for the photo
 * @property {string} status - Current status: 'pending', 'uploading', 'uploaded', 'analyzing', 'analyzed', 'error'
 * @property {number} [uploadProgress] - Upload progress from 0-100
 * @property {Object} [analysis] - Analysis data from AI
 */

// ====================================================
// PHOTO OBJECT CREATION AND TRANSFORMATION
// ====================================================

/**
 * Create a standardized photo object from a file
 * @param {File} file - File object to create photo from
 * @param {Object} [options] - Additional options
 * @returns {PhotoObject} Standardized photo object
 */
export const createPhotoFromFile = (file, options = {}) => {
  if (!file) return null;
  
  // Use the shared schema to ensure consistency
  const schemaPhoto = PhotoSchema.createFromFile(file);
  
  // Create and track blob URL if needed and not provided
  const preview = options.preview || (file ? createAndTrackBlobUrl(file) : null);
  
  // Create the base photo object
  const photoObject = {
    // Use client ID from schema for consistency
    id: schemaPhoto.clientId || `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    name: file.name || 'Unnamed photo',
    file,
    preview,
    uploadProgress: options.uploadProgress || 0,
    // Preserve originalName and other properties from schema
    originalName: file.name,
    contentType: file.type,
  };
  
  // Merge in schema properties
  Object.assign(photoObject, schemaPhoto);
  
  // Merge in options, but ensure status is properly set
  Object.assign(photoObject, options);
  
  // Explicitly set status last to ensure it's not overridden
  photoObject.status = options.status || 'pending';
  
  return photoObject;
};

/**
 * Update a photo with server data after upload
 * @param {PhotoObject} photo - Original photo object
 * @param {Object} serverData - Data returned from server
 * @returns {PhotoObject} Updated photo object
 */
export const updatePhotoWithServerData = (photo, serverData) => {
  if (!photo || !serverData) return photo;
  
  console.log("updatePhotoWithServerData called with:", {
    photoId: photo._id || photo.id,
    photoStatus: photo.status,
    serverPhotoId: serverData._id
  });
  
  // Create a new object with server data but explicitly set status to uploaded
  return {
    ...photo,
    _id: serverData._id || serverData.id,
    url: serverData.url || serverData.path,
    uploadProgress: 100,
    // Preserve local data that server doesn't have
    file: photo.file,
    preview: photo.preview,
    // ALWAYS set status to 'uploaded' - this is critical for UI state
    status: 'uploaded'
  };
};

/**
 * Update a photo with analysis data
 * @param {PhotoObject} photo - Original photo object
 * @param {Object} analysisData - Analysis data from server
 * @returns {PhotoObject} Updated photo object
 */
export const updatePhotoWithAnalysis = (photo, analysisData) => {
  if (!photo || !analysisData) return photo;
  
  return {
    ...photo,
    analysis: analysisData,
    status: 'analyzed'
  };
};

/**
 * Get the best available data source for a photo
 * @param {Object} photo - The photo object
 * @returns {Object} - Source info { type: 'file|dataUrl|serverUrl', data: Object }
 */
export const getBestDataSource = (photo) => {
  if (!photo) return { type: 'none', data: null };
  
  // Prioritize local file for best performance and quality
  if (photo.file) {
    return { type: 'file', data: photo.file };
  }
  
  // Next best is a data URL or blob URL stored locally
  if (photo.localDataUrl) {
    return { type: 'dataUrl', data: photo.localDataUrl };
  }
  
  if (photo.preview && photo.preview.startsWith('data:')) {
    return { type: 'dataUrl', data: photo.preview };
  }
  
  // Fall back to server URL if we have an ID
  if (photo._id || photo.id) {
    return { 
      type: 'serverUrl', 
      data: photo.path || `/api/photos/${photo._id || photo.id}`,
      id: photo._id || photo.id
    };
  }
  
  // No good data source
  return { type: 'none', data: null };
};

/**
 * Group photos by whether they have local data available for analysis
 * @param {Array} photos - Array of photo objects
 * @returns {Object} - Groups of photos { withLocalData: [], needsServerAnalysis: [] }
 */
export const groupPhotosByDataAvailability = (photos) => {
  if (!photos || !Array.isArray(photos)) {
    return { withLocalData: [], needsServerAnalysis: [] };
  }
  
  const withLocalData = [];
  const needsServerAnalysis = [];
  
  photos.forEach(photo => {
    const dataSource = getBestDataSource(photo);
    
    if (dataSource.type === 'file' || dataSource.type === 'dataUrl') {
      withLocalData.push(photo);
    } else if (dataSource.type === 'serverUrl') {
      needsServerAnalysis.push(photo);
    }
  });
  
  return { withLocalData, needsServerAnalysis };
};

/**
 * Ensure a photo has all necessary data and properties preserved
 * @param {Object} photo - The photo object to process
 * @returns {Object} - Enhanced photo object with preserved data
 */
export const preservePhotoData = (photo) => {
  if (!photo) return null;
  
  // Remove excessive logging that might contribute to infinite loops
  // console.log("photoUtils.preservePhotoData called with photo:", {
  //   id: photo._id || photo.id,
  //   status: photo.status,
  //   hasFile: !!photo.file
  // });
  
  // Create a new object to avoid modifying the original
  const processedPhoto = { ...photo };
  
  // MOST IMPORTANT: Always preserve existing status
  // This is critical to prevent overwriting 'uploaded' status
  if (photo.status) {
    processedPhoto.status = photo.status;
    // console.log(`Preserving existing status: ${photo.status} for photo ${photo._id || photo.id}`);
  } else {
    // Only use default if missing
    processedPhoto.status = 'pending';
  }
  
  // Ensure file object is preserved
  if (photo.file) {
    processedPhoto.file = photo.file;
    
    // Create preview URL if missing but we have a file
    if (!processedPhoto.preview && photo.file instanceof File) {
      processedPhoto.preview = createAndTrackBlobUrl(photo.file);
    }
  }
  
  // Ensure preview URLs are preserved
  if (photo.preview) {
    processedPhoto.preview = photo.preview;
  }
  
  // Preserve existing localDataUrl
  if (photo.localDataUrl) {
    processedPhoto.localDataUrl = photo.localDataUrl;
  }
  
  // console.log("photoUtils.preservePhotoData returning photo with status:", processedPhoto.status);
  
  return processedPhoto;
};

/**
 * Process a batch of photos to ensure all have preserved data
 * @param {Array} photos - Array of photo objects
 * @returns {Array} - Array of enhanced photo objects
 */
export const preserveBatchPhotoData = (photos) => {
  if (!photos || !Array.isArray(photos)) return [];
  return photos.map(photo => preservePhotoData(photo));
};

// ====================================================
// PHOTO FILTERING AND GROUPING
// ====================================================

/**
 * Filter photos by status
 * @param {Array<PhotoObject>} photos - Array of photo objects
 * @param {string|Array<string>} status - Status or array of statuses to filter by
 * @returns {Array<PhotoObject>} Filtered photos
 */
export const filterPhotosByStatus = (photos, status) => {
  if (!photos || !Array.isArray(photos)) return [];
  if (!status) return photos;
  
  const statusArray = Array.isArray(status) ? status : [status];
  
  // Remove excessive debugging logs that cause rendering loops
  // console.log(`DEBUG filterPhotosByStatus: Looking for "${status}" in ${photos.length} photos`);
  // console.log("Raw photo status values:", photos.map(p => ({ 
  //   id: p._id || p.id, 
  //   status: p.status,
  //   hasOwnStatus: p.hasOwnProperty('status'),
  //   statusType: typeof p.status
  // })));
  
  const filteredPhotos = photos.filter(photo => statusArray.includes(photo.status));
  
  // console.log(`DEBUG filterPhotosByStatus: Found ${filteredPhotos.length} photos with status '${status}'`);
  
  return filteredPhotos;
};

/**
 * Extract IDs from photos
 * @param {Array<PhotoObject>} photos - Array of photo objects
 * @param {Object} [options] - Options for ID extraction
 * @param {boolean} [options.serverOnly=false] - Only include server IDs (_id)
 * @param {boolean} [options.includeClientIds=false] - Include client IDs (id)
 * @returns {Array<string>} Array of photo IDs
 */
export const extractPhotoIds = (photos, options = {}) => {
  if (!photos || !Array.isArray(photos)) return [];
  
  const { serverOnly = false, includeClientIds = false } = options;
  
  return photos
    .map(photo => {
      if (serverOnly) {
        return photo._id;
      } else if (includeClientIds) {
        return photo._id || photo.id;
      } else {
        return photo._id;
      }
    })
    .filter(Boolean); // Remove null/undefined values
};

/**
 * Group photos by status
 * @param {Array<PhotoObject>} photos - Array of photo objects
 * @returns {Object} Object with photos grouped by status
 */
export const groupPhotosByStatus = (photos) => {
  if (!photos || !Array.isArray(photos)) {
    return {
      pending: [],
      uploading: [],
      uploaded: [],
      analyzing: [],
      analyzed: [],
      error: []
    };
  }
  
  return photos.reduce((acc, photo) => {
    const status = photo.status || 'pending';
    if (!acc[status]) {
      acc[status] = [];
    }
    acc[status].push(photo);
    return acc;
  }, {
    pending: [],
    uploading: [],
    uploaded: [],
    analyzing: [],
    analyzed: [],
    error: []
  });
};

// ====================================================
// URL GENERATION AND HANDLING
// ====================================================

/**
 * Get the URL for displaying a photo
 * @param {PhotoObject|String} photoOrId - Photo object or ID string
 * @param {Object} [options] - Options for URL generation
 * @param {String} [options.size] - Size variant ('original', 'thumbnail', 'medium')
 * @returns {string} Best URL for the photo
 */
export const getPhotoUrl = (photoOrId, options = {}) => {
  // Handle string IDs (server-side only)
  if (typeof photoOrId === 'string') {
    const baseUrl = `/api/photos/${photoOrId}`;
    const size = options.size || 'original';
    
    switch(size) {
      case 'thumbnail':
        return `${baseUrl}?size=thumbnail`;
      case 'medium':
        return `${baseUrl}?size=medium`;
      default:
        return baseUrl;
    }
  }

  // Handle photo objects
  if (!photoOrId) return '';
  const photo = photoOrId;
  
  // Prioritize in this order:
  // 1. preview (client-side blob URL or data URL)
  // 2. url (server URL)
  // 3. path (API path)
  // 4. Construct from ID
  // 5. Empty string if nothing available
  
  if (photo.preview) {
    return photo.preview;
  }
  
  if (photo.url) {
    return photo.url;
  }
  
  if (photo.path) {
    return photo.path;
  }
  
  // Generate a URL from ID
  const photoId = photo._id || photo.id;
  if (photoId) {
    const size = options.size || 'original';
    const baseUrl = `/api/photos/${photoId}`;
    
    switch(size) {
      case 'thumbnail':
        return `${baseUrl}?size=thumbnail`;
      case 'medium':
        return `${baseUrl}?size=medium`;
      default:
        return baseUrl;
    }
  }
  
  return '';
};

// ====================================================
// FILE AND DATA URL UTILITIES
// ====================================================

/**
 * Convert a data URL to a Blob object
 * @param {String} dataUrl - The data URL to convert
 * @returns {Blob} - The resulting Blob
 */
export const dataURLtoBlob = (dataUrl) => {
  if (!dataUrl || !dataUrl.startsWith('data:')) {
    return null;
  }

  const arr = dataUrl.split(',');
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  
  return new Blob([u8arr], { type: mime });
};

/**
 * Convert a Blob to a data URL
 * @param {Blob} blob - The Blob to convert
 * @returns {Promise<String>} - Promise resolving to the data URL
 */
export const blobToDataURL = (blob) => {
  return new Promise((resolve, reject) => {
    if (!blob) {
      resolve(null);
      return;
    }
    
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
    reader.readAsDataURL(blob);
  });
};

/**
 * Creates a File object from a Blob with a filename
 * @param {Blob} blob - The source Blob
 * @param {String} filename - The filename to use
 * @param {String} [type] - MIME type (defaults to blob's type)
 * @returns {File} - A File object
 */
export const blobToFile = (blob, filename, type) => {
  if (!blob) return null;
  
  const fileType = type || blob.type;
  return new File([blob], filename, { type: fileType });
};

/**
 * Create a data URL from a file object
 * @param {File} file - The file to convert
 * @returns {Promise<string>} - Promise resolving to a data URL
 */
export const createDataUrlFromFile = (file) => {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }
    
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

// Default export that combines function and object access
const photoUtils = {
  // Photo object management
  createPhotoFromFile,
  updatePhotoWithServerData,
  updatePhotoWithAnalysis,
  preservePhotoData,
  preserveBatchPhotoData,
  getBestDataSource,
  groupPhotosByDataAvailability,
  
  // Filtering and grouping
  filterPhotosByStatus,
  extractPhotoIds,
  groupPhotosByStatus,
  
  // URL handling
  getPhotoUrl,
  
  // File utilities
  dataURLtoBlob,
  blobToDataURL,
  blobToFile,
  createDataUrlFromFile
};

// Export the utilities as a plain object
export default photoUtils; 