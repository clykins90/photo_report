const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { ApiError } = require('./errorHandler');
const config = require('../config/config');
const logger = require('../utils/logger');
const fs = require('fs');

// Check if running in Vercel environment
const isVercel = process.env.VERCEL === '1';

// Get the upload directory
const uploadDir = config.tempUploadDir || './temp';

// Ensure temp directory exists in non-Vercel environments
if (!isVercel && !fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
    logger.info(`Created temporary upload directory: ${uploadDir}`);
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
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      // Generate a unique filename with original extension
      const uniqueFilename = `${uuidv4()}${path.extname(file.originalname)}`;
      logger.info(`Generated unique filename: ${uniqueFilename} for original: ${file.originalname}`);
      cb(null, uniqueFilename);
    }
  });
}

// Define allowed file types
const allowedFileTypes = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf'
];

// File filter to only allow certain image types
const fileFilter = (req, file, cb) => {
  logger.info(`Checking file type: ${file.mimetype} for file: ${file.originalname}`);
  
  if (allowedFileTypes.includes(file.mimetype)) {
    logger.info(`File type allowed: ${file.mimetype}`);
    cb(null, true);
  } else {
    logger.warn(`File type not allowed: ${file.mimetype}. Allowed types: ${allowedFileTypes.join(', ')}`);
    cb(new ApiError(400, `File type not allowed. Allowed types: ${allowedFileTypes.join(', ')}`), false);
  }
};

// Create the multer upload instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Middleware for handling file upload errors
const handleUploadErrors = (req, res, next) => {
  return (err) => {
    if (err instanceof multer.MulterError) {
      logger.error(`Multer error: ${err.code} - ${err.message}`);
      
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(400, `File too large. Max size is 10MB`));
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
    logger.debug(`Starting single file upload for field: ${fieldName}`);
    upload.single(fieldName)(req, res, handleUploadErrors(req, res, next));
  },
  
  // Multiple files upload - using the same name as in photoRoutes.js
  uploadMany: (fieldName, maxCount = 50) => (req, res, next) => {
    logger.debug(`Starting multiple file upload for field: ${fieldName}, max count: ${maxCount}`);
    
    const uploadMiddleware = upload.array(fieldName, maxCount);
    
    uploadMiddleware(req, res, (err) => {
      if (err) {
        logger.error(`Upload error: ${err.message}`, err);
        if (err instanceof multer.MulterError) {
          logger.error(`Multer error code: ${err.code}, field: ${err.field}`);
        }
        return handleUploadErrors(req, res, next)(err);
      }
      
      // Log successful upload (only basic info)
      if (req.files && req.files.length > 0) {
        logger.info(`Successfully uploaded ${req.files.length} files`);
        // Only log detailed file info at debug level
        if (logger.debug) {
          req.files.forEach((file, index) => {
            logger.debug(`File ${index + 1}: ${file.originalname}, ${file.size} bytes`);
          });
        }
      } else {
        logger.warn('No files were uploaded');
      }
      
      next();
    });
  }
}; 