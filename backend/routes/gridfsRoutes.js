const express = require('express');
const { ObjectId } = require('mongodb');
const gridfs = require('../utils/gridfs');
const logger = require('../utils/logger');
const { protect } = require('../middleware/auth');
const { uploadSingleToGridFS } = require('../middleware/gridfsUpload');
const path = require('path');

const router = express.Router();

/**
 * Middleware to serve the test HTML page
 */
router.get('/test-page', (req, res) => {
  res.sendFile(path.join(__dirname, '../test-gridfs.html'));
});

/**
 * @route   POST /api/files/upload
 * @desc    Upload a file to GridFS
 * @access  Public (for testing)
 */
router.post('/upload', ...uploadSingleToGridFS('file'), (req, res) => {
  try {
    if (!req.gridfsFile) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }
    
    logger.info(`File uploaded to GridFS: ${req.gridfsFile.filename}`);
    
    res.status(200).json({
      success: true,
      file: req.gridfsFile
    });
  } catch (error) {
    logger.error(`Error uploading file to GridFS: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error uploading file',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/files/:fileId
 * @desc    Stream a file from GridFS
 * @access  Public
 */
router.get('/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    
    // Validate fileId format
    if (!ObjectId.isValid(fileId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file ID format'
      });
    }
    
    logger.info(`Streaming file with ID ${fileId} from GridFS`);
    
    // Ensure GridFS is initialized
    const bucket = await gridfs.initGridFS();
    if (!bucket) {
      logger.error('GridFS not initialized, database connection may be missing');
      return res.status(500).json({
        success: false,
        message: 'Database connection error'
      });
    }
    
    // Stream file to response
    await gridfs.streamToResponse(fileId, res);
  } catch (error) {
    logger.error(`Error streaming file from GridFS: ${error.message}`);
    
    // Only send error response if headers not already sent
    if (!res.headersSent) {
      res.status(404).json({
        success: false,
        message: 'File not found or error streaming file',
        error: error.message
      });
    }
  }
});

/**
 * @route   GET /api/files/info/:fileId
 * @desc    Get file information from GridFS
 * @access  Public (for testing)
 */
router.get('/info/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    
    // Validate fileId format
    if (!ObjectId.isValid(fileId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file ID format'
      });
    }
    
    // Get file info
    const fileInfo = await gridfs.getFileInfo(fileId);
    
    res.status(200).json({
      success: true,
      file: fileInfo
    });
  } catch (error) {
    logger.error(`Error getting file info from GridFS: ${error.message}`);
    res.status(404).json({
      success: false,
      message: 'File not found or error getting file info',
      error: error.message
    });
  }
});

/**
 * @route   DELETE /api/files/:fileId
 * @desc    Delete a file from GridFS
 * @access  Public (for testing)
 */
router.delete('/:fileId', async (req, res) => {
  try {
    const fileId = req.params.fileId;
    
    // Validate fileId format
    if (!ObjectId.isValid(fileId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid file ID format'
      });
    }
    
    // Delete file
    await gridfs.deleteFile(fileId);
    
    res.status(200).json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting file from GridFS: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error deleting file',
      error: error.message
    });
  }
});

/**
 * @route   GET /api/files/search
 * @desc    Search files by metadata (filename, content type, etc.)
 * @access  Public (for testing)
 */
router.get('/search', async (req, res) => {
  try {
    // Build query from request query parameters
    const query = {};
    
    // Filter by filename if provided
    if (req.query.filename) {
      query.filename = { $regex: req.query.filename, $options: 'i' };
    }
    
    // Filter by content type if provided
    if (req.query.contentType) {
      query.contentType = { $regex: req.query.contentType, $options: 'i' };
    }
    
    // Filter by user ID if provided
    if (req.query.userId) {
      query['metadata.userId'] = req.query.userId;
    }
    
    // Find files matching query
    const files = await gridfs.findFiles(query);
    
    res.status(200).json({
      success: true,
      count: files.length,
      files
    });
  } catch (error) {
    logger.error(`Error searching files in GridFS: ${error.message}`);
    res.status(500).json({
      success: false,
      message: 'Error searching files',
      error: error.message
    });
  }
});

module.exports = router; 