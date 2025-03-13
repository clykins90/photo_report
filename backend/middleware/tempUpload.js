const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { ApiError } = require('./errorHandler');
const config = require('../config/config');
const logger = require('../utils/logger');
const fs = require('fs');

// Check if running in Vercel environment
const isVercel = process.env.VERCEL === '1';

// Ensure temp directory exists in non-Vercel environments
if (!isVercel && !fs.existsSync(config.tempUploadDir)) {
  try {
    fs.mkdirSync(config.tempUploadDir, { recursive: true });
    logger.info(`Created temporary upload directory: ${config.tempUploadDir}`);
  } catch (error) {
    logger.warn(`Could not create temp directory: ${error.message}`);
  }
}

// Configure storage based on environment
let storage;

if (isVercel) {
  // Use memory storage in Vercel environment
  logger.info('Using memory storage for temporary uploads in Vercel environment');
  storage = multer.memoryStorage();
} else {
  // Use disk storage in development/non-Vercel environments
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      logger.info(`Setting destination for file: ${file.originalname}`);
      cb(null, config.tempUploadDir);
    },
    filename: (req, file, cb) => {
      // Generate a unique filename with original extension
      const uniqueFilename = `${uuidv4()}${path.extname(file.originalname)}`;
      logger.info(`Generated unique filename: ${uniqueFilename} for original: ${file.originalname}`);
      cb(null, uniqueFilename);
    }
  });
}

// File filter to only allow certain image types
const fileFilter = (req, file, cb) => {
  logger.info(`Checking file type: ${file.mimetype} for file: ${file.originalname}`);
  
  if (config.allowedFileTypes.includes(file.mimetype)) {
    logger.info(`File type allowed: ${file.mimetype}`);
    cb(null, true);
  } else {
    logger.warn(`File type not allowed: ${file.mimetype}. Allowed types: ${config.allowedFileTypes.join(', ')}`);
    cb(new ApiError(400, `File type not allowed. Allowed types: ${config.allowedFileTypes.join(', ')}`), false);
  }
};

// Create the multer upload instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxFileSize // 10MB
  }
});

// Middleware for handling file upload errors
const handleUploadErrors = (req, res, next) => {
  return (err) => {
    if (err instanceof multer.MulterError) {
      logger.error(`Multer error: ${err.code} - ${err.message}`);
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(400, `File too large. Max size is ${config.maxFileSize / (1024 * 1024)}MB`));
      } else if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new ApiError(400, `Unexpected field name. Expected 'photos' for multiple files or 'photo' for single file.`));
      }
      return next(new ApiError(400, err.message));
    } else if (err) {
      logger.error(`Upload error: ${err.message}`);
      return next(err);
    }
    
    logger.info(`Upload successful: ${req.file ? 'Single file' : req.files ? `${req.files.length} files` : 'No files'}`);
    next();
  };
};

// Export configured upload middleware
module.exports = {
  // Single file upload
  uploadSingle: (fieldName) => (req, res, next) => {
    logger.info(`Starting single file upload for field: ${fieldName}`);
    upload.single(fieldName)(req, res, handleUploadErrors(req, res, next));
  },
  
  // Multiple files upload
  uploadMultiple: (fieldName, maxCount = 10) => (req, res, next) => {
    logger.info(`Starting multiple file upload for field: ${fieldName}, max count: ${maxCount}`);
    logger.info(`Request content type: ${req.headers['content-type']}`);
    
    // More detailed request logging
    logger.info('All request headers:');
    for (const [key, value] of Object.entries(req.headers)) {
      logger.info(`- ${key}: ${value}`);
    }
    
    // Debug request body before processing
    if (req.headers['content-type'] && req.headers['content-type'].includes('multipart/form-data')) {
      logger.info('Multipart form data detected');
      
      // Log the boundary value
      const boundary = req.headers['content-type'].split('boundary=')[1];
      if (boundary) {
        logger.info(`Form data boundary: ${boundary}`);
      } else {
        logger.warn('No boundary found in content-type header');
      }
      
      // Log content length
      logger.info(`Content length: ${req.headers['content-length']} bytes`);
    } else {
      logger.warn(`Unexpected content type: ${req.headers['content-type']}`);
    }
    
    // Use a custom callback to log more details
    const uploadMiddleware = upload.array(fieldName, maxCount);
    logger.info(`Created multer middleware with field name: "${fieldName}"`);
    
    uploadMiddleware(req, res, (err) => {
      if (err) {
        logger.error(`Upload error: ${err.message}`, err);
        if (err instanceof multer.MulterError) {
          logger.error(`Multer error code: ${err.code}, field: ${err.field}`);
        }
        return handleUploadErrors(req, res, next)(err);
      }
      
      // Log successful upload
      if (req.files && req.files.length > 0) {
        logger.info(`Successfully uploaded ${req.files.length} files`);
        req.files.forEach((file, index) => {
          logger.info(`File ${index + 1}: ${file.originalname}, ${file.mimetype}, ${file.size} bytes`);
        });
      } else {
        logger.warn('No files were uploaded');
      }
      
      next();
    });
  }
}; 