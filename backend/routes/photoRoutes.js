const express = require('express');
const { 
  uploadPhotos, 
  uploadSinglePhoto, 
  deletePhoto,
  analyzePhoto,
  analyzeBatchPhotos,
  getPhoto
} = require('../controllers/photoController');
const { protect } = require('../middleware/auth');
const { uploadMany, uploadSingle } = require('../middleware/uploadMiddleware');
const { validateImageFiles, validateSingleImage } = require('../middleware/fileValidator');
const logger = require('../utils/logger');

const router = express.Router();

// Log all requests to photo routes
router.use((req, res, next) => {
  logger.info(`Photo API request: ${req.method} ${req.originalUrl}`, {
    contentType: req.headers['content-type'],
    contentLength: req.headers['content-length']
  });
  next();
});

// Public routes
router.get('/:filename', getPhoto);

// All protected routes require authentication
router.use(protect);

// @route   POST /api/photos/upload
// @desc    Main endpoint for uploading photos (single or batch)
// @access  Private
router.post(
  '/upload',
  (req, res, next) => {
    logger.info('Starting photo upload process');
    next();
  },
  uploadMany('photos', 50),
  validateImageFiles(),
  uploadPhotos
);

// @route   POST /api/photos/single
// @desc    Legacy endpoint for single photo upload (maintained for backward compatibility)
// @access  Private
router.post(
  '/single',
  uploadSingle('photo'),
  validateSingleImage(),
  uploadSinglePhoto
);

// @route   POST /api/photos/analyze/:id
// @desc    Analyze a photo using AI
// @access  Private
router.post('/analyze/:id', analyzePhoto);

// @route   POST /api/photos/analyze-batch
// @desc    Analyze multiple photos at once using AI
// @access  Private
router.post('/analyze-batch', analyzeBatchPhotos);

// @route   DELETE /api/photos/:id
// @desc    Delete a photo
// @access  Private
router.delete('/:id', deletePhoto);

module.exports = router; 