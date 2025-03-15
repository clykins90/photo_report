/**
 * Utility for managing blob URLs safely to prevent memory leaks
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

export default {
  isBlobUrlValid,
  createAndTrackBlobUrl,
  safelyRevokeBlobUrl,
  cleanupAllBlobUrls
}; 