/**
 * Utility for managing blob URLs and photo data safely to prevent memory leaks
 * Consolidates functionality from the previous blobUrlManager and photoStorageManager
 */

// Track active blob URLs to prevent premature revocation
const activeBlobUrls = new Set();

// Store temporary URLs to avoid creating them during render
const tempUrlCache = new Map();

/**
 * Check if a blob URL is valid
 * @param {string} url - The URL to check
 * @returns {boolean} - Whether the URL is valid
 */
export const isBlobUrlValid = (url) => {
  if (!url || !url.startsWith('blob:')) return false;
  // Check if the URL is in our active set
  return activeBlobUrls.has(url);
};

/**
 * Create and track a blob URL
 * @param {File} file - The file to create a URL for
 * @returns {string|null} - The created URL or null if creation failed
 */
export const createAndTrackBlobUrl = (file) => {
  if (!file) return null;
  
  // Check if we already have a URL for this file
  const fileId = file.name || file.path || Math.random().toString();
  
  if (tempUrlCache.has(fileId)) {
    return tempUrlCache.get(fileId);
  }
  
  try {
    const url = URL.createObjectURL(file);
    activeBlobUrls.add(url);
    tempUrlCache.set(fileId, url);
    return url;
  } catch (e) {
    console.error('Failed to create blob URL:', e);
    return null;
  }
};

/**
 * Safely revoke a blob URL
 * @param {string} url - The URL to revoke
 */
export const safelyRevokeBlobUrl = (url) => {
  if (url && url.startsWith('blob:') && activeBlobUrls.has(url)) {
    try {
      URL.revokeObjectURL(url);
      activeBlobUrls.delete(url);
      
      // Also remove from cache if it exists there
      for (const [key, value] of tempUrlCache.entries()) {
        if (value === url) {
          tempUrlCache.delete(key);
          break;
        }
      }
    } catch (e) {
      console.error('Failed to revoke blob URL:', e);
    }
  }
};

/**
 * Clean up all blob URLs
 */
export const cleanupAllBlobUrls = () => {
  activeBlobUrls.forEach(url => {
    try {
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Failed to revoke blob URL during cleanup:', e);
    }
  });
  activeBlobUrls.clear();
  tempUrlCache.clear();
};

// ADDED FUNCTIONALITY FROM PHOTO STORAGE MANAGER

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
 * Ensure a photo object has all necessary data and properties preserved
 * @param {Object} photo - The photo object to process
 * @returns {Object} - Enhanced photo object with preserved data
 */
export const preservePhotoData = (photo) => {
  if (!photo) return null;
  
  // Create a new object to avoid modifying the original
  const processedPhoto = { ...photo };
  
  // Explicitly preserve status - critical to ensure it's not lost
  processedPhoto.status = photo.status || 'pending';
  
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
    
    // Store data URLs as localDataUrl for analysis
    if (photo.preview.startsWith('data:') && !processedPhoto.localDataUrl) {
      processedPhoto.localDataUrl = photo.preview;
    }
  }
  
  // Preserve existing localDataUrl
  if (photo.localDataUrl) {
    processedPhoto.localDataUrl = photo.localDataUrl;
  }
  
  // If we have a preview but no localDataUrl, and the preview is a blob URL,
  // we'll handle this asynchronously later if needed
  
  // Ensure path/URL is set
  if (!processedPhoto.url && !processedPhoto.path) {
    const urlUpdatedPhoto = ensurePhotoUrl(processedPhoto);
    // Don't directly assign - it would overwrite the object
    // Instead, copy just the url/path properties
    if (urlUpdatedPhoto) {
      if (urlUpdatedPhoto.url) processedPhoto.url = urlUpdatedPhoto.url;
      if (urlUpdatedPhoto.path) processedPhoto.path = urlUpdatedPhoto.path;
    }
  }
  
  // Verify analysis data was preserved
  if (photo.analysis && !processedPhoto.analysis) {
    console.error(`ERROR: Analysis data was lost during preservation for photo ${photo._id || photo.id}`);
    // Explicitly preserve analysis data
    processedPhoto.analysis = photo.analysis;
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

/**
 * Ensure a photo has a URL property
 * @param {Object} photo - The photo object to process
 * @returns {Object} - The photo object with URL set
 */
export const ensurePhotoUrl = (photo) => {
  if (!photo) return null;
  
  const processedPhoto = { ...photo };
  
  if (!processedPhoto.url && !processedPhoto.path) {    
    // Try to construct a URL from available identifiers
    if (processedPhoto._id) {
      processedPhoto.path = `/api/photos/${processedPhoto._id}`;
    } else if (processedPhoto.fileId) {
      processedPhoto.path = `/api/photos/${processedPhoto.fileId}`;
    } else if (processedPhoto.id) {
      processedPhoto.path = `/api/photos/${processedPhoto.id}`;
    }
  }
  
  return processedPhoto;
};

/**
 * Get the best available data source for a photo
 * @param {Object} photo - The photo object
 * @returns {Object} - Source info { type: 'file|blob|url', data: Object }
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
 * Get the best URL for displaying a photo
 * @param {Object} photo - The photo object
 * @param {String} size - Size variant ('original', 'thumbnail', 'medium')
 * @returns {String} - Best URL for the photo
 */
export const getPhotoUrl = (photo, size = 'original') => {
  if (!photo) return '';
  
  // Use preview if available (client-side preview)
  if (photo.preview) {
    return photo.preview;
  }
  
  // Extract the ID from the photo object
  const photoId = photo._id || photo.fileId || photo.id;
  
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
 * Sort photos into groups based on available data
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
 * Log diagnostic info about photo data availability
 * @param {Array} photos - Array of photo objects 
 * @returns {Array} - Array of photo data availability info
 */
export const logPhotoDataAvailability = (photos) => {
  if (!photos || !Array.isArray(photos)) return [];
  
  const availability = photos.map(p => ({
    id: p._id || p.id,
    hasFile: !!p.file,
    hasPreview: !!p.preview,
    hasLocalDataUrl: !!p.localDataUrl,
    bestSource: getBestDataSource(p).type
  }));
  
  console.info('Photo data availability:', availability);
  
  // Count photos with file data
  const withLocalData = photos.filter(p => p.file || p.localDataUrl || 
    (p.preview && p.preview.startsWith('data:'))).length;
  
  console.info(`${withLocalData} of ${photos.length} photos have local data available`);
  
  return availability;
};

// Export both individual functions and a default export
export default {
  // Blob URL management
  isBlobUrlValid,
  createAndTrackBlobUrl,
  safelyRevokeBlobUrl,
  cleanupAllBlobUrls,
  
  // Photo data management (from PhotoStorageManager)
  createDataUrlFromFile,
  preservePhotoData,
  preserveBatchPhotoData,
  ensurePhotoUrl,
  getBestDataSource,
  getPhotoUrl,
  groupPhotosByDataAvailability,
  logPhotoDataAvailability
}; 