const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const gridfs = require('../utils/gridfs');
const logger = require('../utils/logger');
const config = require('../config/config');

// Check if running in Vercel environment
const isVercel = process.env.VERCEL === '1';

// Ensure temp directory exists in non-Vercel environments
const tempDir = path.resolve(process.env.TEMP_UPLOAD_DIR || './temp');
if (!isVercel && !fs.existsSync(tempDir)) {
  try {
    fs.mkdirSync(tempDir, { recursive: true });
    logger.info(`Created temporary upload directory: ${tempDir}`);
  } catch (error) {
    logger.warn(`Could not create temp directory: ${error.message}`);
  }
}

// Configure multer storage based on environment
let storage;

if (isVercel) {
  // Use memory storage in Vercel environment to avoid filesystem issues
  logger.info('Using memory storage for file uploads in Vercel environment');
  storage = multer.memoryStorage();
} else {
  // Use disk storage in development/non-Vercel environments
  storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, tempDir);
    },
    filename: (req, file, cb) => {
      // Generate unique filename
      const uniqueFilename = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
      cb(null, uniqueFilename);
    },
  });
}

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

      let fileInfo;

      if (isVercel) {
        // In Vercel, file is in memory (file.buffer)
        if (!file.buffer) {
          throw new Error('No file buffer found for memory storage');
        }

        // Create a readable stream from buffer
        const { Readable } = require('stream');
        const readableStream = new Readable();
        readableStream.push(file.buffer);
        readableStream.push(null); // Mark end of stream

        // Get GridFS bucket and create a stream to upload
        const bucket = gridfs.initGridFS();
        if (!bucket) {
          throw new Error('GridFS not initialized, database connection may be missing');
        }

        // Create upload stream
        const uploadStream = bucket.openUploadStream(file.originalname, {
          contentType: file.mimetype,
          metadata
        });

        // Handle stream completion
        const uploadPromise = new Promise((resolve, reject) => {
          uploadStream.on('error', reject);
          uploadStream.on('finish', () => {
            resolve({
              id: uploadStream.id,
              filename: file.originalname,
              contentType: file.mimetype,
              metadata
            });
          });
        });

        // Pipe the buffer to GridFS
        readableStream.pipe(uploadStream);
        fileInfo = await uploadPromise;
      } else {
        // In non-Vercel, file is on disk
        const filePath = path.join(tempDir, file.filename);
        
        // Upload to GridFS
        fileInfo = await gridfs.uploadFile(filePath, {
          filename: file.filename,
          contentType: file.mimetype,
          metadata
        });

        // Clean up temporary file
        fs.unlink(filePath, (err) => {
          if (err) {
            logger.warn(`Failed to delete temporary file ${filePath}: ${err.message}`);
          } else {
            logger.info(`Temporary file deleted: ${filePath}`);
          }
        });
      }

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