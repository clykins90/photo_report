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
// PHOTO OBJECT TRANSFORMATION
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
    id: schemaPhoto.clientId,
    name: file.name || 'Unnamed photo',
    file,
    preview,
    uploadProgress: options.uploadProgress || 0,
    originalName: file.name,
    contentType: file.type,
  };
  
  // Merge in schema properties and options
  Object.assign(photoObject, schemaPhoto, options);
  
  // Ensure status is properly set
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
  
  return {
    ...photo,
    _id: serverData._id || serverData.id,
    url: serverData.url || serverData.path,
    uploadProgress: photo.uploadProgress,
    file: photo.file,
    preview: photo.preview,
    status: photo.status
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
 * Group photos by whether they have local data available for analysis
 * @param {Array} photos - Array of photo objects
 * @returns {Object} - Groups of photos { withLocalData: [], needsServerAnalysis: [] }
 */
export const groupPhotosByDataAvailability = (photos) => {
  if (!Array.isArray(photos)) return { uploaded: [], local: [] };
  
  return photos.reduce((acc, photo) => {
    if (photo._id) {
      acc.uploaded.push(photo);
    } else if (photo.file) {
      acc.local.push(photo);
    }
    return acc;
  }, { uploaded: [], local: [] });
};

/**
 * Ensure a photo has all necessary data and properties preserved
 * @param {Object} photo - The photo object to process
 * @returns {Object} - Enhanced photo object with preserved data
 */
export const preservePhotoData = (photo) => {
  if (!photo) return null;
  
  // Create a new object to avoid modifying the original
  const processedPhoto = { ...photo };
  
  // Preserve existing data without setting defaults
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
  if (!Array.isArray(photos)) return [];
  return photos.filter(photo => photo.status === status);
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
  if (!Array.isArray(photos)) return [];
  
  return photos.map(photo => {
    if (typeof photo === 'string') return photo;
    
    // For uploaded photos, use _id
    if (photo._id) return photo._id;
    
    // For photos being uploaded, use clientId
    if (options.includeClientIds && photo.clientId) {
      return photo.clientId;
    }
    
    return null;
  }).filter(Boolean);
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
    if (!acc[status]) acc[status] = [];
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
// URL AND DATA HANDLING
// ====================================================

/**
 * Get the URL for displaying a photo
 * @param {PhotoObject|String} photoOrId - Photo object or ID string
 * @returns {string} Best URL for the photo
 */
export const getPhotoUrl = (photoOrId) => {
  if (!photoOrId) return null;
  
  if (typeof photoOrId === 'string') {
    return `/api/photos/${photoOrId}`;
  }
  
  if (photoOrId._id) {
    return `/api/photos/${photoOrId._id}`;
  }
  
  if (photoOrId.preview) {
    return photoOrId.preview;
  }
  
  return null;
};

/**
 * Convert a data URL to a Blob object
 * @param {String} dataUrl - The data URL to convert
 * @returns {Blob} - The resulting Blob
 */
export const dataURLtoBlob = (dataUrl) => {
  if (!dataUrl || !dataUrl.startsWith('data:')) return null;

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
  if (photo._id) {
    return { 
      type: 'serverUrl', 
      data: photo.path || `/api/photos/${photo._id}`,
      id: photo._id
    };
  }
  
  // No good data source
  return { type: 'none', data: null };
};

// Default export
const photoUtils = {
  createPhotoFromFile,
  updatePhotoWithServerData,
  updatePhotoWithAnalysis,
  preservePhotoData,
  preserveBatchPhotoData,
  getBestDataSource,
  groupPhotosByDataAvailability,
  filterPhotosByStatus,
  extractPhotoIds,
  groupPhotosByStatus,
  getPhotoUrl,
  dataURLtoBlob,
  blobToDataURL,
  blobToFile,
  createDataUrlFromFile
};

export default photoUtils; 