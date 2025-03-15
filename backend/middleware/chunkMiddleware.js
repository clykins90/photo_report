const multer = require('multer');
const path = require('path');
const fs = require('fs');
const logger = require('../utils/logger');

// Use memory storage for chunk uploads
const storage = multer.memoryStorage();

// Define allowed file types for chunks
const allowedFileTypes = [
  'application/octet-stream',
  'binary/octet-stream',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif'
];

// File filter to only allow certain types
const fileFilter = (req, file, cb) => {
  if (allowedFileTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`File type not allowed. Allowed types: ${allowedFileTypes.join(', ')}`), false);
  }
};

// Create the multer upload instance for chunks
const chunkUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 1 * 1024 * 1024 // 1MB max chunk size
  }
});

// Validate chunk data
const validateChunk = (req, res, next) => {
  // Check if required fields are present
  if (!req.body.fileId) {
    return res.status(400).json({ error: 'File ID is required' });
  }
  
  if (!req.body.chunkIndex) {
    return res.status(400).json({ error: 'Chunk index is required' });
  }
  
  if (!req.body.totalChunks) {
    return res.status(400).json({ error: 'Total chunks is required' });
  }
  
  // Convert to numbers
  req.body.chunkIndex = parseInt(req.body.chunkIndex, 10);
  req.body.totalChunks = parseInt(req.body.totalChunks, 10);
  
  // Validate numbers
  if (isNaN(req.body.chunkIndex) || req.body.chunkIndex < 0) {
    return res.status(400).json({ error: 'Invalid chunk index' });
  }
  
  if (isNaN(req.body.totalChunks) || req.body.totalChunks <= 0) {
    return res.status(400).json({ error: 'Invalid total chunks' });
  }
  
  if (req.body.chunkIndex >= req.body.totalChunks) {
    return res.status(400).json({ error: 'Chunk index exceeds total chunks' });
  }
  
  next();
};

// Export configured chunk upload middleware
module.exports = {
  // Single chunk upload
  uploadChunk: () => (req, res, next) => {
    chunkUpload.single('chunk')(req, res, (err) => {
      if (err) {
        logger.error(`Chunk upload error: ${err.message}`);
        return res.status(400).json({ error: err.message });
      }
      
      if (!req.file) {
        logger.warn('No chunk file was uploaded');
        return res.status(400).json({ error: 'No chunk file was uploaded' });
      }
      
      logger.info(`Successfully uploaded chunk: ${req.body.chunkIndex + 1}/${req.body.totalChunks}`);
      next();
    });
  },
  
  validateChunk
}; 