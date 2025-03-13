const logger = require('../utils/logger');
const config = require('../config/config');
const multer = require('multer');

/**
 * Custom error class for API errors
 */
class ApiError extends Error {
  constructor(statusCode, message, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error handler middleware
 */
const errorHandler = (err, req, res, next) => {
  // Log the error with details
  logger.error(`Error: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
    body: req.body,
    headers: {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length']
    }
  });
  
  // Default error values
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Something went wrong';
  let errorDetails = null;
  
  // Handle multer errors
  if (err instanceof multer.MulterError) {
    statusCode = 400;
    
    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        message = `File too large. Max size is ${config.maxFileSize / (1024 * 1024)}MB`;
        break;
      case 'LIMIT_UNEXPECTED_FILE':
        message = 'Unexpected field name in form data';
        errorDetails = `Expected 'photos' for multiple files or 'photo' for single file. Got: ${err.field}`;
        break;
      case 'LIMIT_FILE_COUNT':
        message = 'Too many files uploaded';
        break;
      default:
        message = `File upload error: ${err.code}`;
    }
  }
  
  // Handle mongoose validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400;
    const errors = Object.values(err.errors).map(val => val.message);
    message = `Validation failed: ${errors.join(', ')}`;
    errorDetails = err.errors;
  }
  
  // Handle mongoose cast errors (invalid IDs)
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  }
  
  // Handle duplicate key errors
  if (err.code === 11000) {
    statusCode = 400;
    const field = Object.keys(err.keyValue)[0];
    message = `Duplicate value for ${field}. Please use another value.`;
    errorDetails = err.keyValue;
  }
  
  // Send the error response
  res.status(statusCode).json({
    success: false,
    error: message,
    details: errorDetails,
    stack: config.nodeEnv === 'development' ? err.stack : undefined
  });
};

module.exports = {
  ApiError,
  errorHandler
}; 