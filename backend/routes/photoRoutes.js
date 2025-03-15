const express = require('express');
const { 
  uploadPhotos, 
  getPhoto,
  deletePhoto,
  analyzePhotos,
  initChunkedUpload,
  uploadChunk,
  completeChunkedUpload
} = require('../controllers/photoController');
const { protect } = require('../middleware/auth');
const { uploadMany } = require('../middleware/uploadMiddleware');
const { uploadChunk: uploadChunkMiddleware, validateChunk } = require('../middleware/chunkMiddleware');
const logger = require('../utils/logger');

const router = express.Router();

// Log requests
router.use((req, res, next) => {
  if (req.method !== 'GET') {
    logger.info(`Photo API request: ${req.method} ${req.originalUrl}`);
  }
  next();
});

// Public routes
router.get('/:id', getPhoto);

// Protected routes
router.use(protect);

// @route   POST /api/photos/upload
// @desc    Upload photos for a report
// @access  Private
router.post(
  '/upload',
  uploadMany('photos', 20),
  uploadPhotos
);

// @route   POST /api/photos/upload-chunk/init
// @desc    Initialize a chunked upload
// @access  Private
router.post('/upload-chunk/init', initChunkedUpload);

// @route   POST /api/photos/upload-chunk
// @desc    Upload a chunk
// @access  Private
router.post(
  '/upload-chunk',
  uploadChunkMiddleware(),
  validateChunk,
  uploadChunk
);

// @route   POST /api/photos/complete-upload
// @desc    Complete a chunked upload
// @access  Private
router.post('/complete-upload', completeChunkedUpload);

// @route   POST /api/photos/analyze
// @desc    Analyze photos using AI
// @access  Private
router.post('/analyze/:reportId', analyzePhotos);

// @route   DELETE /api/photos/:id
// @desc    Delete a photo
// @access  Private
router.delete('/:id', deletePhoto);

module.exports = router; 