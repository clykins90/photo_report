/**
 * Utility functions for MongoDB operations
 */

/**
 * Check if a string is a valid MongoDB ObjectID
 * @param {string|any} id - The ID to validate
 * @returns {boolean} - Whether the ID is valid
 */
export const isValidObjectId = (id) => {
  // Must be a string and match the format of 24 hex characters
  return id && typeof id === 'string' && /^[0-9a-fA-F]{24}$/.test(id);
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