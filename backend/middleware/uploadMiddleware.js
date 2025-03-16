const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');
const config = require('../config/config');
const gridfs = require('../utils/gridfs');
const PhotoSchema = require('../../shared/schemas/photoSchema.cjs');

// Always use memory storage for file uploads
const storage = multer.memoryStorage();
logger.info('Using memory storage for file uploads');

// Define allowed file types
const allowedFileTypes = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'application/pdf'  // Added PDF support from gridfsUpload
];

// File filter to only allow certain file types
const fileFilter = (req, file, cb) => {
  if (allowedFileTypes.includes(file.mimetype) || 
      (file.mimetype.startsWith('image/') && !allowedFileTypes.includes(file.mimetype))) {
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
    fileSize: config.maxFileSize || 10 * 1024 * 1024 // 10MB default
  }
});

/**
 * Upload middleware that moves file to GridFS
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
      // Get reportId from request body if available
      const reportId = req.body.reportId || null;
      
      // Get clientId from request body if available
      const clientId = req.body.clientId || 
                      (req.body.clientIds && Array.isArray(req.body.clientIds) ? 
                        req.body.clientIds[files.indexOf(file)] : null);
      
      // Create metadata using the PhotoSchema utility function
      const additionalMetadata = {
        size: file.size,
        userId: req.user?._id?.toString(),
        mimetype: file.mimetype
      };
      
      const metadata = PhotoSchema.createMetadata(reportId, file.originalname, clientId, additionalMetadata);

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
    logger.error(`Error in upload middleware: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'File upload failed',
      error: error.message
    });
  }
};

// Export consolidated upload middleware
module.exports = {
  // Standard uploads (no GridFS)
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
  
  uploadSingle: (fieldName) => (req, res, next) => {
    upload.single(fieldName)(req, res, (err) => {
      if (err) {
        logger.error(`Upload error: ${err.message}`);
        return res.status(400).json({ error: err.message });
      }
      
      if (req.file) {
        logger.info(`Successfully uploaded file: ${req.file.originalname}`);
      } else {
        logger.warn('No file was uploaded');
      }
      
      next();
    });
  },
  
  // GridFS uploads
  uploadToGridFS: (fieldName, maxCount = 10) => [
    upload.array(fieldName, maxCount),
    uploadToGridFS
  ],
  
  uploadSingleToGridFS: (fieldName) => [
    upload.single(fieldName),
    uploadToGridFS
  ]
}; 