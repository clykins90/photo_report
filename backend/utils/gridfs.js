const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Store buckets by name
const buckets = {
  photos: null,
  pdf_report: null
};

/**
 * Initialize a GridFS bucket
 * @param {string} bucketName - Name of the bucket to initialize
 * @returns {GridFSBucket} The GridFS bucket instance
 */
const initGridFS = async (bucketName = 'photos') => {
  try {
    // If bucket already exists, return it
    if (buckets[bucketName]) {
      return buckets[bucketName];
    }
    
    // Check MongoDB connection state
    if (mongoose.connection.readyState !== 1) {
      logger.info('MongoDB not connected, attempting to connect...');
      
      // Try to connect with retry logic
      let retries = 3;
      let connected = false;
      
      while (retries > 0 && !connected) {
        try {
          await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 10000,
            socketTimeoutMS: 45000,
          });
          connected = true;
          logger.info(`MongoDB connected: ${mongoose.connection.host}`);
        } catch (connError) {
          retries--;
          if (retries > 0) {
            logger.warn(`MongoDB connection failed, retrying... (${retries} attempts left)`);
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
          } else {
            throw connError;
          }
        }
      }
    }
    
    // Initialize GridFS bucket with retry logic
    let retries = 2;
    let error;
    
    while (retries >= 0) {
      try {
        buckets[bucketName] = new GridFSBucket(mongoose.connection.db, {
          bucketName: bucketName
        });
        logger.info(`GridFS bucket '${bucketName}' initialized successfully`);
        return buckets[bucketName];
      } catch (bucketError) {
        error = bucketError;
        retries--;
        
        if (retries >= 0) {
          logger.warn(`Failed to initialize GridFS bucket, retrying... (${retries} attempts left)`);
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    }
    
    // If we get here, all retries failed
    logger.error(`All attempts to initialize GridFS bucket '${bucketName}' failed: ${error.message}`);
    return null;
  } catch (error) {
    logger.error(`Error initializing GridFS bucket '${bucketName}': ${error.message}`);
    return null;
  }
};

/**
 * Upload a file to GridFS
 * @param {string} filePath - Path to the file
 * @param {Object} options - Upload options
 * @param {string} bucketName - Name of the bucket to use
 * @returns {Promise<Object>} File information
 */
const uploadFile = async (filePath, options = {}, bucketName = 'photos') => {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found at path: ${filePath}`);
    }
    
    const bucket = await initGridFS(bucketName);
    if (!bucket) {
      throw new Error(`GridFS bucket '${bucketName}' not initialized`);
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
          metadata: options.metadata,
          bucketName
        });
      });
      
      // Pipe read stream to upload stream
      readStream.pipe(uploadStream);
    });
  } catch (error) {
    logger.error(`Error in GridFS upload to '${bucketName}': ${error.message}`);
    throw error;
  }
};

/**
 * Upload a file buffer to GridFS
 * @param {Buffer} buffer - File buffer
 * @param {Object} options - Upload options
 * @param {string} bucketName - Name of the bucket to use
 * @returns {Promise<Object>} File information
 */
const uploadBuffer = async (buffer, options = {}, bucketName = 'photos') => {
  try {
    const bucket = await initGridFS(bucketName);
    if (!bucket) {
      throw new Error(`GridFS bucket '${bucketName}' not initialized`);
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
          metadata: options.metadata,
          bucketName
        });
      });
      
      // Pipe read stream to upload stream
      readStream.pipe(uploadStream);
    });
  } catch (error) {
    logger.error(`Error in GridFS buffer upload to '${bucketName}': ${error.message}`);
    throw error;
  }
};

/**
 * Stream a file from GridFS to response
 * @param {string} fileId - ID of the file to stream
 * @param {Object} res - Express response object
 * @param {string} bucketName - Name of the bucket to use
 */
const streamToResponse = async (fileId, res, bucketName = 'photos') => {
  try {
    const bucket = await initGridFS(bucketName);
    if (!bucket) {
      throw new Error(`GridFS bucket '${bucketName}' not initialized`);
    }

    // Convert string ID to ObjectId if needed
    let id;
    try {
      id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
    } catch (error) {
      logger.error(`Invalid ObjectId format: ${fileId}`);
      throw new Error(`Invalid ObjectId format: ${fileId}`);
    }
    
    // Get file info to set content type
    const files = await bucket.find({ _id: id }).toArray();
    if (!files.length) {
      // If not found in the specified bucket, try the other bucket
      const otherBucketName = bucketName === 'photos' ? 'pdf_report' : 'photos';
      logger.info(`File not found in '${bucketName}', trying '${otherBucketName}'`);
      
      const otherBucket = await initGridFS(otherBucketName);
      const otherFiles = await otherBucket.find({ _id: id }).toArray();
      
      if (!otherFiles.length) {
        throw new Error(`File not found with ID: ${fileId} in any bucket`);
      }
      
      // Use the other bucket and its file
      bucket = otherBucket;
      files[0] = otherFiles[0];
      logger.info(`Found file in '${otherBucketName}' bucket instead`);
    }
    
    // Set content type header
    res.set('Content-Type', files[0].contentType);
    
    // Create download stream
    const downloadStream = bucket.openDownloadStream(id);
    
    // Handle errors
    downloadStream.on('error', (error) => {
      logger.error(`Error in download stream: ${error.message}`);
      if (!res.headersSent) {
        res.status(404).json({ error: `File not found: ${error.message}` });
      }
    });
    
    // Pipe to response
    downloadStream.pipe(res);
  } catch (error) {
    logger.error(`Error streaming file from '${bucketName}': ${error.message}`);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
};

/**
 * Delete a file from GridFS
 * @param {string} fileId - ID of the file to delete
 * @param {string} bucketName - Name of the bucket to use
 */
const deleteFile = async (fileId, bucketName = 'photos') => {
  try {
    const bucket = await initGridFS(bucketName);
    if (!bucket) {
      throw new Error(`GridFS bucket '${bucketName}' not initialized`);
    }

    // Convert string ID to ObjectId if needed
    const id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
    
    try {
      // Delete file
      await bucket.delete(id);
      logger.info(`File deleted from GridFS bucket '${bucketName}': ${fileId}`);
    } catch (error) {
      // If not found in the specified bucket, try the other bucket
      if (error.message.includes('not found')) {
        const otherBucketName = bucketName === 'photos' ? 'pdf_report' : 'photos';
        logger.info(`File not found in '${bucketName}', trying '${otherBucketName}'`);
        
        const otherBucket = await initGridFS(otherBucketName);
        await otherBucket.delete(id);
        logger.info(`File deleted from GridFS bucket '${otherBucketName}': ${fileId}`);
      } else {
        throw error;
      }
    }
  } catch (error) {
    logger.error(`Error deleting file: ${error.message}`);
    throw error;
  }
};

/**
 * Find files in GridFS
 * @param {Object} query - Query to find files
 * @param {string} bucketName - Name of the bucket to use
 * @returns {Promise<Array>} Array of file objects
 */
const findFiles = async (query = {}, bucketName = 'photos') => {
  try {
    const bucket = await initGridFS(bucketName);
    if (!bucket) {
      throw new Error(`GridFS bucket '${bucketName}' not initialized`);
    }
    
    // Find files matching query
    return await bucket.find(query).toArray();
  } catch (error) {
    logger.error(`Error finding files in '${bucketName}': ${error.message}`);
    throw error;
  }
};

/**
 * Upload a PDF report to GridFS
 * @param {Buffer|string} bufferOrPath - PDF buffer or file path
 * @param {Object} options - Upload options
 * @returns {Promise<Object>} File information
 */
const uploadPdfReport = async (bufferOrPath, options = {}) => {
  // Always use pdf_report bucket for PDFs
  const bucketName = 'pdf_report';
  
  if (typeof bufferOrPath === 'string') {
    // It's a file path
    return uploadFile(bufferOrPath, options, bucketName);
  } else {
    // It's a buffer
    return uploadBuffer(bufferOrPath, options, bucketName);
  }
};

/**
 * Get a PDF report from GridFS
 * @param {string} fileId - ID of the PDF to get
 * @param {Object} res - Express response object
 */
const streamPdfReport = async (fileId, res) => {
  // Always use pdf_report bucket for PDFs
  return streamToResponse(fileId, res, 'pdf_report');
};

module.exports = {
  initGridFS,
  uploadFile,
  uploadBuffer,
  streamToResponse,
  deleteFile,
  findFiles,
  uploadPdfReport,
  streamPdfReport
}; 