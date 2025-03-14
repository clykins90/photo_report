const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const gridfs = require('../utils/gridfs');
const logger = require('../utils/logger');
const config = require('../config/config');

// Always use memory storage for file uploads
logger.info('Using memory storage for file uploads');
const storage = multer.memoryStorage();

// Configure file filter
const fileFilter = (req, file, cb) => {
  // Accept images and PDFs
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type. Only images and PDFs are allowed.'), false);
  }
};

// Create multer instance
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxFileSize || 10 * 1024 * 1024, // 10MB default
  },
});

/**
 * Upload middleware that moves file from temporary storage to GridFS
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Express next function
 */
const uploadToGridFS = async (req, res, next) => {
  try {
    // Skip if no file
    if (!req.file && (!req.files || req.files.length === 0)) {
      return next();
    }

    const files = req.file ? [req.file] : req.files;
    const gridfsFiles = [];

    for (const file of files) {
      // File metadata
      const metadata = {
        originalName: file.originalname,
        size: file.size,
        uploadDate: new Date(),
        userId: req.user?._id?.toString(),
        mimetype: file.mimetype,
        // Add additional metadata as needed
      };

      // Upload buffer to GridFS
      if (!file.buffer) {
        throw new Error('No file buffer found for memory storage');
      }

      // Upload to GridFS using the uploadBuffer function
      const fileInfo = await gridfs.uploadBuffer(file.buffer, {
        filename: file.originalname,
        contentType: file.mimetype,
        metadata
      });

      // Add GridFS file info to the file object
      file.gridfs = fileInfo;
      gridfsFiles.push({
        originalName: file.originalname,
        filename: fileInfo.filename,
        id: fileInfo.id.toString(),
        contentType: file.mimetype,
        size: file.size,
        metadata
      });
    }

    // Add GridFS files to request
    if (req.file) {
      req.gridfsFile = gridfsFiles[0];
    } else {
      req.gridfsFiles = gridfsFiles;
    }

    next();
  } catch (error) {
    logger.error(`Error in GridFS upload middleware: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'File upload to GridFS failed',
      error: error.message
    });
  }
};

/**
 * Middleware for uploading single file to GridFS
 * @param {string} fieldName - Form field name
 * @returns {Array} Array of middleware functions
 */
const uploadSingleToGridFS = (fieldName) => {
  return [upload.single(fieldName), uploadToGridFS];
};

/**
 * Middleware for uploading multiple files to GridFS
 * @param {string} fieldName - Form field name
 * @param {number} maxCount - Maximum number of files
 * @returns {Array} Array of middleware functions
 */
const uploadMultipleToGridFS = (fieldName, maxCount = 10) => {
  return [upload.array(fieldName, maxCount), uploadToGridFS];
};

module.exports = {
  uploadSingleToGridFS,
  uploadMultipleToGridFS
}; 