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
const mongoose = require('mongoose');
const gridfs = require('../utils/gridfs');

const router = express.Router();

// Log only non-GET photo API requests to reduce noise
router.use((req, res, next) => {
  if (req.method !== 'GET') {
    logger.info(`Photo API request: ${req.method} ${req.originalUrl}`);
  } else {
    // For GET requests, only log at debug level
    logger.debug(`Photo API request: ${req.method} ${req.originalUrl}`);
  }
  next();
});

// Add a test endpoint to verify database connection
router.get('/test-db', async (req, res) => {
  try {
    // Check MongoDB connection
    const dbState = mongoose.connection.readyState;
    const dbStateText = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    }[dbState] || 'unknown';
    
    // Check GridFS initialization
    let gridfsStatus = 'not initialized';
    let gridfsFiles = [];
    try {
      // Try to list files in GridFS
      gridfsFiles = await gridfs.findFiles({}, true);
      gridfsStatus = 'initialized';
    } catch (gridfsError) {
      gridfsStatus = `error: ${gridfsError.message}`;
    }
    
    // Return detailed status
    res.json({
      success: true,
      environment: process.env.NODE_ENV || 'unknown',
      isVercel: process.env.VERCEL === '1',
      useGridFS: process.env.USE_GRIDFS === 'true',
      database: {
        state: dbState,
        stateText: dbStateText,
        host: mongoose.connection.host || 'unknown',
        name: mongoose.connection.name || 'unknown'
      },
      gridfs: {
        status: gridfsStatus,
        fileCount: gridfsFiles.length,
        sampleFiles: gridfsFiles.slice(0, 5).map(f => ({
          id: f._id.toString(),
          filename: f.filename,
          contentType: f.contentType,
          uploadDate: f.uploadDate
        }))
      }
    });
  } catch (error) {
    logger.error(`Error in test-db endpoint: ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
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
    logger.debug('Starting photo upload process');
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