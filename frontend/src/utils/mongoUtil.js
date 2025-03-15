/**
 * Utility functions for MongoDB operations
 */

/**
 * Check if a string is a valid MongoDB ObjectID
 * @param {string|any} id - The ID to validate
 * @returns {boolean} - Whether the ID is valid
 */
export const isValidObjectId = (id) => {
  // If it's not a value, it's not valid
  if (!id) return false;
  
  // Convert to string if it's not already
  const idStr = typeof id !== 'string' ? String(id) : id;
  
  // Standard MongoDB ObjectId is a 24-character hex string
  if (/^[0-9a-fA-F]{24}$/.test(idStr)) {
    return true;
  }
  
  // Some systems might use UUIDs which are 36 characters with hyphens
  if (/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(idStr)) {
    return true;
  }
  
  // Some systems might use UUIDs without hyphens (32 chars)
  if (/^[0-9a-fA-F]{32}$/.test(idStr)) {
    return true;
  }
  
  return false;
};

/**
 * Generate a MongoDB-compatible ObjectId string
 * This creates a valid 24-character hexadecimal string that MongoDB will accept
 * @returns {string} - A valid MongoDB ObjectId string
 */
export const generateObjectId = () => {
  const hexChars = '0123456789abcdef';
  let objectId = '';
  
  // Generate a 24-character hex string
  for (let i = 0; i < 24; i++) {
    objectId += hexChars.charAt(Math.floor(Math.random() * hexChars.length));
  }
  
  return objectId;
};

/**
 * Extract a valid MongoDB ObjectID from a photo object
 * @param {Object} photo - The photo object to extract from
 * @returns {string|null} - The extracted ID or null if not found
 */
export const extractPhotoObjectId = (photo) => {
  if (!photo) return null;
  
  // Try _id first
  if (photo._id && isValidObjectId(photo._id)) {
    return photo._id;
  }
  
  // Try id next
  if (photo.id && isValidObjectId(photo.id)) {
    return photo.id;
  }
  
  // Try serverId next
  if (photo.serverId && isValidObjectId(photo.serverId)) {
    return photo.serverId;
  }
  
  // Try fileId next
  if (photo.fileId && isValidObjectId(photo.fileId)) {
    return photo.fileId;
  }
  
  // Try photoId next
  if (photo.photoId && isValidObjectId(photo.photoId)) {
    return photo.photoId;
  }
  
  // If we have a path that contains an ID, try to extract it
  if (photo.path && typeof photo.path === 'string') {
    const pathParts = photo.path.split('/');
    const potentialId = pathParts[pathParts.length - 1];
    if (isValidObjectId(potentialId)) {
      return potentialId;
    }
  }
  
  return null;
};

/**
 * Filter an array of photos to only those with valid MongoDB ObjectIDs
 * @param {Object[]} photos - Array of photo objects
 * @returns {Object[]} - Filtered array of photos with valid IDs
 */
export const filterPhotosWithValidIds = (photos) => {
  if (!photos || !Array.isArray(photos)) return [];
  
  return photos.filter(photo => extractPhotoObjectId(photo) !== null);
};

export default {
  isValidObjectId,
  generateObjectId,
  extractPhotoObjectId,
  filterPhotosWithValidIds
}; 