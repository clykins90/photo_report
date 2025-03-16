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
  
  // Try fileId next (common in GridFS)
  if (photo.fileId && isValidObjectId(photo.fileId)) {
    return photo.fileId;
  }
  
  // Try id next
  if (photo.id && isValidObjectId(photo.id)) {
    return photo.id;
  }
  
  // Try serverId next
  if (photo.serverId && isValidObjectId(photo.serverId)) {
    return photo.serverId;
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
    
    // Try to extract ID from path with query parameters
    const basePath = potentialId.split('?')[0];
    if (isValidObjectId(basePath)) {
      return basePath;
    }
  }
  
  // Try to find any property that looks like a MongoDB ID
  for (const key in photo) {
    if (typeof photo[key] === 'string' && isValidObjectId(photo[key])) {
      return photo[key];
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
  
  console.log(`Filtering ${photos.length} photos for valid MongoDB IDs`);
  
  // Add detailed debugging for the first photo
  if (photos.length > 0) {
    const firstPhoto = photos[0];
    console.log('First photo in filterPhotosWithValidIds:', {
      _id: firstPhoto._id,
      fileId: firstPhoto.fileId,
      id: firstPhoto.id,
      serverId: firstPhoto.serverId,
      clientId: firstPhoto.clientId,
      hasValidId: extractPhotoObjectId(firstPhoto) !== null
    });
    
    // Check if the first photo has a valid ID
    const validId = extractPhotoObjectId(firstPhoto);
    if (validId) {
      console.log(`Found valid MongoDB ID: ${validId}`);
    } else {
      console.log('No valid MongoDB ID found. Photo object keys:', Object.keys(firstPhoto));
    }
  }
  
  // Filter photos with valid IDs and log each one for debugging
  const validPhotos = photos.filter(photo => {
    const validId = extractPhotoObjectId(photo);
    const isValid = validId !== null;
    
    // Log each photo's validation result
    if (!isValid && photos.length < 50) {  // Only log details if we have a reasonable number of photos
      console.log(`Photo validation failed:`, {
        _id: photo._id,
        fileId: photo.fileId,
        id: photo.id,
        clientId: photo.clientId
      });
    }
    
    return isValid;
  });
  
  console.log(`Found ${validPhotos.length} photos with valid MongoDB IDs`);
  
  return validPhotos;
};

export default {
  isValidObjectId,
  generateObjectId,
  extractPhotoObjectId,
  filterPhotosWithValidIds
}; 