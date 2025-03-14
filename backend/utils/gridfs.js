const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

let gridFSBucket;

/**
 * Initialize the GridFS bucket
 * @returns {GridFSBucket} The GridFS bucket instance
 */
const initGridFS = async () => {
  try {
    // If bucket already exists, return it
    if (gridFSBucket) {
      return gridFSBucket;
    }
    
    // Check MongoDB connection state
    if (mongoose.connection.readyState !== 1) {
      logger.info('MongoDB not connected, attempting to connect...');
      await mongoose.connect(process.env.MONGODB_URI);
      logger.info(`MongoDB connected: ${mongoose.connection.host}`);
    }
    
    // Initialize GridFS bucket
    gridFSBucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'photos'
    });
    logger.info('GridFS bucket initialized successfully');
    
    return gridFSBucket;
  } catch (error) {
    logger.error(`Error initializing GridFS bucket: ${error.message}`);
    return null;
  }
};

/**
 * Upload a file to GridFS
 * @param {string} filePath - Path to the file
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} File information
 */
const uploadFile = async (filePath, options = {}) => {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at path: ${filePath}`);
    }
    
    const bucket = await initGridFS();
    if (!bucket) {
      throw new Error('GridFS not initialized');
    }

    const filename = options.filename || path.basename(filePath);
    const contentType = options.contentType || 'application/octet-stream';
    
    return new Promise((resolve, reject) => {
      // Create upload stream
      const uploadStream = bucket.openUploadStream(filename, {
        contentType,
        metadata: options.metadata || {}
      });

      // Create read stream from file
      const readStream = fs.createReadStream(filePath);
      
      // Handle errors
      readStream.on('error', reject);
      uploadStream.on('error', reject);
      
      // On finish, resolve with file info
      uploadStream.on('finish', () => {
        resolve({
          id: uploadStream.id,
          filename,
          contentType,
          metadata: options.metadata
        });
      });
      
      // Pipe read stream to upload stream
      readStream.pipe(uploadStream);
    });
  } catch (error) {
    logger.error(`Error in GridFS upload: ${error.message}`);
    throw error;
  }
};

/**
 * Upload a file buffer to GridFS
 * @param {Buffer} buffer - File buffer
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} File information
 */
const uploadBuffer = async (buffer, options = {}) => {
  try {
    const bucket = await initGridFS();
    if (!bucket) {
      throw new Error('GridFS not initialized');
    }

    const filename = options.filename || `file_${Date.now()}`;
    const contentType = options.contentType || 'application/octet-stream';
    
    return new Promise((resolve, reject) => {
      // Create upload stream
      const uploadStream = bucket.openUploadStream(filename, {
        contentType,
        metadata: options.metadata || {}
      });

      // Create readable stream from buffer
      const { Readable } = require('stream');
      const readStream = new Readable();
      readStream.push(buffer);
      readStream.push(null); // Mark end of stream
      
      // Handle errors
      readStream.on('error', reject);
      uploadStream.on('error', reject);
      
      // On finish, resolve with file info
      uploadStream.on('finish', () => {
        resolve({
          id: uploadStream.id,
          filename,
          contentType,
          metadata: options.metadata
        });
      });
      
      // Pipe read stream to upload stream
      readStream.pipe(uploadStream);
    });
  } catch (error) {
    logger.error(`Error in GridFS buffer upload: ${error.message}`);
    throw error;
  }
};

/**
 * Stream a file from GridFS to response
 * @param {string} fileId - ID of the file to stream
 * @param {Object} res - Express response object
 */
const streamToResponse = async (fileId, res) => {
  try {
    const bucket = await initGridFS();
    if (!bucket) {
      throw new Error('GridFS not initialized');
    }

    // Convert string ID to ObjectId if needed
    const id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
    
    // Get file info to set content type
    const files = await bucket.find({ _id: id }).toArray();
    if (!files.length) {
      throw new Error(`File not found with ID: ${fileId}`);
    }
    
    // Set content type header
    res.set('Content-Type', files[0].contentType);
    
    // Create download stream
    const downloadStream = bucket.openDownloadStream(id);
    
    // Handle errors
    downloadStream.on('error', (error) => {
      if (!res.headersSent) {
        res.status(404).json({ error: `File not found: ${error.message}` });
      }
    });
    
    // Pipe to response
    downloadStream.pipe(res);
  } catch (error) {
    logger.error(`Error streaming file: ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
};

/**
 * Delete a file from GridFS
 * @param {string} fileId - ID of the file to delete
 */
const deleteFile = async (fileId) => {
  try {
    const bucket = await initGridFS();
    if (!bucket) {
      throw new Error('GridFS not initialized');
    }

    // Convert string ID to ObjectId if needed
    const id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
    
    // Delete file
    await bucket.delete(id);
    logger.info(`File deleted from GridFS: ${fileId}`);
  } catch (error) {
    logger.error(`Error deleting file: ${error.message}`);
    throw error;
  }
};

/**
 * Find files in GridFS
 * @param {Object} query - Query to find files
 * @returns {Promise<Array>} Array of file objects
 */
const findFiles = async (query = {}) => {
  try {
    const bucket = await initGridFS();
    if (!bucket) {
      throw new Error('GridFS not initialized');
    }
    
    // Find files matching query
    return await bucket.find(query).toArray();
  } catch (error) {
    logger.error(`Error finding files: ${error.message}`);
    throw error;
  }
};

module.exports = {
  initGridFS,
  uploadFile,
  uploadBuffer,
  streamToResponse,
  deleteFile,
  findFiles
}; 