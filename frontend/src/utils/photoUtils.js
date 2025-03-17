/**
 * Photo utilities for standardizing and transforming photo objects
 * This centralizes all photo object operations to ensure consistent structure
 */

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

/**
 * Create a standardized photo object from a file
 * @param {File} file - File object to create photo from
 * @param {Object} [options] - Additional options
 * @returns {PhotoObject} Standardized photo object
 */
export const createPhotoFromFile = (file, options = {}) => {
  if (!file) return null;
  
  return {
    id: `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
    name: file.name || 'Unnamed photo',
    file,
    preview: options.preview || null,
    status: options.status || 'pending',
    uploadProgress: options.uploadProgress || 0,
    ...options
  };
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
    status: 'uploaded',
    uploadProgress: 100,
    // Preserve local data that server doesn't have
    file: photo.file,
    preview: photo.preview
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
 * Get the best URL for displaying a photo
 * @param {PhotoObject} photo - Photo object
 * @returns {string} Best URL for display
 */
export const getBestPhotoUrl = (photo) => {
  if (!photo) return '';
  
  // Prioritize in this order:
  // 1. preview (client-side blob URL or data URL)
  // 2. url (server URL)
  // 3. Empty string if nothing available
  
  return photo.preview || photo.url || '';
};

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
  
  return photos.filter(photo => statusArray.includes(photo.status));
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

export default {
  createPhotoFromFile,
  updatePhotoWithServerData,
  updatePhotoWithAnalysis,
  getBestPhotoUrl,
  filterPhotosByStatus,
  extractPhotoIds,
  groupPhotosByStatus
}; 