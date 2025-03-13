const express = require('express');
const { 
  uploadBatchPhotos, 
  uploadSinglePhoto, 
  deletePhoto,
  analyzePhoto,
  analyzeBatchPhotos,
  getPhoto
} = require('../controllers/photoController');
const { protect } = require('../middleware/auth');
const { uploadMultiple, uploadSingle } = require('../middleware/tempUpload');
const { uploadMultipleToGridFS, uploadSingleToGridFS } = require('../middleware/gridfsUpload');
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

// @route   POST /api/photos/batch
// @desc    Upload and process a batch of photos
// @access  Private
router.post(
  '/batch',
  (req, res, next) => {
    logger.info('Starting batch photo upload process');
    next();
  },
  uploadMultiple('photos', 50),
  validateImageFiles(),
  uploadBatchPhotos
);

// @route   POST /api/photos/batch/gridfs
// @desc    Upload and process a batch of photos directly to GridFS
// @access  Private
router.post(
  '/batch/gridfs',
  (req, res, next) => {
    logger.info('Starting batch photo upload process with GridFS');
    next();
  },
  uploadMultipleToGridFS('photos', 50),
  validateImageFiles(),
  uploadBatchPhotos
);

// @route   POST /api/photos/single
// @desc    Upload and process a single photo
// @access  Private
router.post(
  '/single',
  (req, res, next) => {
    logger.info('Starting single photo upload process');
    next();
  },
  uploadSingle('photo'),
  validateSingleImage(),
  uploadSinglePhoto
);

// @route   POST /api/photos/single/gridfs
// @desc    Upload and process a single photo directly to GridFS
// @access  Private
router.post(
  '/single/gridfs',
  (req, res, next) => {
    logger.info('Starting single photo upload process with GridFS');
    next();
  },
  uploadSingleToGridFS('photo'),
  validateSingleImage(),
  uploadSinglePhoto
);

// Main ID-based routes (preferred)
// @route   POST /api/photos/analyze-by-id/:id
// @desc    Analyze a photo using AI with file ID
// @access  Private
router.post('/analyze-by-id/:id', analyzePhoto);

// @route   POST /api/photos/analyze-batch
// @desc    Analyze multiple photos (up to 20) at once using AI
// @access  Private
router.post('/analyze-batch', analyzeBatchPhotos);

// @route   DELETE /api/photos/delete-by-id/:id
// @desc    Delete a photo by ID
// @access  Private
router.delete('/delete-by-id/:id', deletePhoto);

// Legacy filename-based routes (maintained for backward compatibility)
// @route   POST /api/photos/analyze/:filename
// @desc    Analyze a photo using AI with filename
// @access  Private
router.post('/analyze/:filename', analyzePhoto);

// @route   DELETE /api/photos/:filename
// @desc    Delete a photo by filename
// @access  Private
router.delete('/:filename', deletePhoto);

module.exports = router; 