const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const logger = require('../utils/logger');

// Always use /tmp directory for temporary files
const uploadDir = '/tmp';

// Always use memory storage for file uploads
const storage = multer.memoryStorage();
logger.info('Using memory storage for file uploads');

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

// Process uploaded files to write to /tmp if needed
const processUpload = (req, res, next) => {
  if (!req.files) {
    return next();
  }
  
  // Handle the in-memory files
  req.files.forEach(file => {
    // Add additional properties that would normally be set by disk storage
    file.path = `${uploadDir}/${uuidv4()}${path.extname(file.originalname)}`;
    
    // Write to /tmp directory
    if (file.buffer) {
      try {
        fs.writeFileSync(file.path, file.buffer);
        logger.info(`Wrote file to temporary location: ${file.path}`);
      } catch (error) {
        logger.error(`Failed to write file to ${uploadDir}: ${error.message}`);
      }
    }
  });
  
  next();
};

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
        processUpload(req, res, next);
      } else {
        logger.warn('No files were uploaded');
        next();
      }
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
        logger.info(`Successfully uploaded company logo: ${req.file.originalname}`);
        
        // Process file
        if (req.file.buffer) {
          const filePath = `${uploadDir}/${uuidv4()}${path.extname(req.file.originalname)}`;
          try {
            fs.writeFileSync(filePath, req.file.buffer);
            req.file.path = filePath;
            logger.info(`Wrote logo to temporary location: ${filePath}`);
          } catch (error) {
            logger.error(`Failed to write logo to ${uploadDir}: ${error.message}`);
          }
        }
      } else {
        logger.warn('No logo file was uploaded');
      }
      
      next();
    });
  }
}; 