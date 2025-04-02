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

export default {
  isValidObjectId,
  generateObjectId
}; 