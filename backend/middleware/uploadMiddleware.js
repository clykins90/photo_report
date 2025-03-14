const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const logger = require('../utils/logger');

// Create temp directory if it doesn't exist
const uploadDir = './temp';
if (!fs.existsSync(uploadDir)) {
  try {
    fs.mkdirSync(uploadDir, { recursive: true });
    logger.info(`Created temporary upload directory: ${uploadDir}`);
  } catch (error) {
    logger.warn(`Could not create temp directory: ${error.message}`);
  }
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Generate a unique filename with original extension
    const uniqueFilename = `${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueFilename);
  }
});

// Define allowed file types
const allowedFileTypes = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif'
];

// File filter to only allow certain image types
const fileFilter = (req, file, cb) => {
  if (allowedFileTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed. Allowed types: ${allowedFileTypes.join(', ')}`), false);
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

// Export configured upload middleware
module.exports = {
  // Multiple files upload
  uploadMany: (fieldName, maxCount = 20) => (req, res, next) => {
    upload.array(fieldName, maxCount)(req, res, (err) => {
      if (err) {
        logger.error(`Upload error: ${err.message}`);
        return res.status(400).json({ error: err.message });
      }
      
      if (req.files && req.files.length > 0) {
        logger.info(`Successfully uploaded ${req.files.length} files`);
      } else {
        logger.warn('No files were uploaded');
      }
      
      next();
    });
  },
  
  // Company logo upload (single file)
  uploadLogo: () => (req, res, next) => {
    upload.single('logo')(req, res, (err) => {
      if (err) {
        logger.error(`Logo upload error: ${err.message}`);
        return res.status(400).json({ error: err.message });
      }
      
      if (req.file) {
        logger.info(`Successfully uploaded company logo: ${req.file.filename}`);
      } else {
        logger.warn('No logo file was uploaded');
      }
      
      next();
    });
  }
}; 