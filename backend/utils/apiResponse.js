/**
 * Utility for creating standardized API responses
 */

/**
 * Creates a success response object
 * @param {Object} data - The response data
 * @param {string} message - Optional success message
 * @param {Object} meta - Optional metadata
 * @returns {Object} Standardized success response
 */
const success = (data = {}, message = null, meta = {}) => {
  // Create basic response
  const response = {
    success: true,
    data
  };
  
  // Add message if provided
  if (message) {
    response.message = message;
  }
  
  // Add metadata if provided
  if (Object.keys(meta).length > 0) {
    response.meta = meta;
  }
  
  return response;
};

/**
 * Creates an error response object
 * @param {string} message - Error message
 * @param {Object} details - Optional error details
 * @param {number} statusCode - HTTP status code (for internal use)
 * @returns {Object} Standardized error response
 */
const error = (message = 'An error occurred', details = null, statusCode = 500) => {
  // Create basic error response
  const response = {
    success: false,
    error: message
  };
  
  // Add error details if provided
  if (details) {
    response.details = details;
  }
  
  // Add statusCode for internal use (not sent to client)
  response._statusCode = statusCode;
  
  return response;
};

/**
 * Send a standardized API response
 * @param {Object} res - Express response object
 * @param {Object} responseObj - Response object from success() or error()
 */
const send = (res, responseObj) => {
  // Determine status code - use _statusCode from error response or default to 200
  const statusCode = responseObj._statusCode || 200;
  
  // Remove internal status code property if present
  if (responseObj._statusCode) {
    delete responseObj._statusCode;
  }
  
  // Send response
  res.status(statusCode).json(responseObj);
};

module.exports = {
  success,
  error,
  send
}; 