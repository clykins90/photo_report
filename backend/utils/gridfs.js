const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

let gridFSBucket;

// Cache for empty queries to avoid repeated database calls
let cachedAllFiles = null;
let cacheTimestamp = null;
const CACHE_TTL = 60000; // 1 minute cache TTL

/**
 * Initialize the GridFS bucket
 * @returns {GridFSBucket} The GridFS bucket instance
 */
const initGridFS = () => {
  try {
    if (!gridFSBucket && mongoose.connection.readyState === 1) {
      logger.info('Initializing GridFS bucket...');
      gridFSBucket = new GridFSBucket(mongoose.connection.db, {
        bucketName: 'files'
      });
      logger.info('GridFS bucket initialized successfully');
    } else if (!gridFSBucket) {
      logger.warn(`Cannot initialize GridFS: MongoDB connection not ready (state: ${mongoose.connection.readyState})`);
    }
    return gridFSBucket;
  } catch (error) {
    logger.error(`Error initializing GridFS bucket: ${error.message}`, error);
    return null;
  }
};

/**
 * Invalidate the file cache
 */
const invalidateCache = () => {
  cachedAllFiles = null;
  cacheTimestamp = null;
  logger.debug('GridFS file cache invalidated');
};

/**
 * Upload a file to GridFS
 * @param {string} filePath - Path to the file
 * @param {Object} options - Upload options
 * @param {string} options.filename - Name to store the file as
 * @param {string} options.contentType - MIME type of the file
 * @param {Object} options.metadata - Additional metadata to store with the file
 * @returns {Promise<Object>} File information
 */
const uploadFile = (filePath, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      logger.info(`Starting GridFS upload for file: ${filePath}`);
      
      // Check if file exists
      if (!fs.existsSync(filePath)) {
        const error = new Error(`File not found at path: ${filePath}`);
        logger.error(error.message);
        return reject(error);
      }
      
      const bucket = initGridFS();
      if (!bucket) {
        const error = new Error('GridFS not initialized, database connection may be missing');
        logger.error(error.message);
        return reject(error);
      }

      const filename = options.filename || path.basename(filePath);
      const contentType = options.contentType || 'application/octet-stream';
      
      logger.info(`Creating GridFS upload stream for file: ${filename} (${contentType})`);
      
      // Create upload stream
      const uploadStream = bucket.openUploadStream(filename, {
        contentType,
        metadata: options.metadata || {}
      });

      // Create read stream from file
      const readStream = fs.createReadStream(filePath);
      
      // Handle errors
      readStream.on('error', (error) => {
        logger.error(`Error reading file for GridFS upload: ${error.message}`, error);
        reject(error);
      });
      
      uploadStream.on('error', (error) => {
        logger.error(`Error uploading to GridFS: ${error.message}`, error);
        reject(error);
      });
      
      // On finish, resolve with file info
      uploadStream.on('finish', (file) => {
        logger.info(`File uploaded to GridFS: ${filename}, id: ${uploadStream.id}`);
        // Invalidate cache when a new file is uploaded
        invalidateCache();
        resolve({
          id: uploadStream.id,
          filename,
          contentType,
          metadata: options.metadata
        });
      });
      
      // Pipe read stream to upload stream
      readStream.pipe(uploadStream);
    } catch (error) {
      logger.error(`Error in GridFS upload: ${error.message}`, error);
      reject(error);
    }
  });
};

/**
 * Download a file from GridFS
 * @param {string} fileId - ID of the file to download
 * @param {Object} options - Download options
 * @param {string} options.destination - Path to save the file to (if not specified, returns a stream)
 * @returns {Promise<Object|stream>} File stream or file info
 */
const downloadFile = (fileId, options = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const bucket = initGridFS();
      if (!bucket) {
        logger.error('GridFS not initialized, database connection may be missing');
        return reject(new Error('GridFS not initialized, database connection may be missing'));
      }

      // Convert string ID to ObjectId if needed
      let id;
      try {
        id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
        logger.info(`Converted fileId to ObjectId: ${id}`);
      } catch (idError) {
        logger.error(`Invalid ObjectId format: ${fileId}`, idError);
        return reject(new Error(`Invalid ObjectId format: ${fileId}`));
      }
      
      // Create download stream
      logger.info(`Opening download stream for GridFS file with id: ${id}`);
      const downloadStream = bucket.openDownloadStream(id);
      
      downloadStream.on('error', (error) => {
        logger.error(`Error downloading file from GridFS: ${error.message}`);
        reject(error);
      });

      // If destination is provided, save to file
      if (options.destination) {
        const writeStream = fs.createWriteStream(options.destination);
        
        writeStream.on('error', (error) => {
          logger.error(`Error writing GridFS file to disk: ${error.message}`);
          reject(error);
        });
        
        writeStream.on('finish', () => {
          logger.info(`File downloaded from GridFS to: ${options.destination}`);
          resolve({ destination: options.destination });
        });
        
        downloadStream.pipe(writeStream);
      } else {
        // Otherwise, return the stream
        logger.info(`Download stream created for GridFS file with id: ${id}`);
        resolve(downloadStream);
      }
    } catch (error) {
      logger.error(`Error in GridFS download: ${error.message}`);
      reject(error);
    }
  });
};

/**
 * Delete a file from GridFS
 * @param {string} fileId - ID of the file to delete
 * @returns {Promise<boolean>} Success status
 */
const deleteFile = (fileId) => {
  return new Promise((resolve, reject) => {
    try {
      const bucket = initGridFS();
      if (!bucket) {
        return reject(new Error('GridFS not initialized, database connection may be missing'));
      }

      // Convert string ID to ObjectId if needed
      const id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
      
      bucket.delete(id, (error) => {
        if (error) {
          logger.error(`Error deleting file from GridFS: ${error.message}`);
          reject(error);
        } else {
          logger.info(`File deleted from GridFS: ${fileId}`);
          // Invalidate cache when a file is deleted
          invalidateCache();
          resolve(true);
        }
      });
    } catch (error) {
      logger.error(`Error in GridFS delete: ${error.message}`);
      reject(error);
    }
  });
};

/**
 * Find files in GridFS by query
 * @param {Object} query - MongoDB query for file metadata
 * @param {boolean} useCache - Whether to use cache for empty queries (default: true)
 * @returns {Promise<Array>} Array of matching files
 */
const findFiles = async (query = {}, useCache = true) => {
  try {
    const bucket = initGridFS();
    if (!bucket) {
      throw new Error('GridFS not initialized, database connection may be missing');
    }
    
    // Check if this is an empty query and we can use the cache
    const isEmptyQuery = Object.keys(query).length === 0;
    if (isEmptyQuery && useCache && cachedAllFiles && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_TTL)) {
      // Use cached results for empty queries
      return cachedAllFiles;
    }
    
    // Using MongoDB native find operation
    const files = await mongoose.connection.db.collection('files.files').find(query).toArray();
    
    // Only log for non-empty queries or first empty query
    if (!isEmptyQuery || !cachedAllFiles) {
      logger.info(`Found ${files.length} files in GridFS matching query`);
    }
    
    // Cache results for empty queries
    if (isEmptyQuery) {
      cachedAllFiles = files;
      cacheTimestamp = Date.now();
    }
    
    return files;
  } catch (error) {
    logger.error(`Error finding files in GridFS: ${error.message}`);
    throw error;
  }
};

/**
 * Get file info from GridFS
 * @param {string} fileId - ID of the file
 * @returns {Promise<Object>} File info
 */
const getFileInfo = async (fileId) => {
  try {
    const bucket = initGridFS();
    if (!bucket) {
      throw new Error('GridFS not initialized, database connection may be missing');
    }
    
    // Convert string ID to ObjectId if needed
    const id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
    
    // Check if we can use the cache to find this file
    if (cachedAllFiles && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_TTL)) {
      const cachedFile = cachedAllFiles.find(file => file._id.toString() === id.toString());
      if (cachedFile) {
        return cachedFile;
      }
    }
    
    // Find file by ID
    const file = await mongoose.connection.db.collection('files.files').findOne({ _id: id });
    
    if (!file) {
      throw new Error(`File with ID ${fileId} not found in GridFS`);
    }
    
    logger.info(`Retrieved info for GridFS file: ${file.filename}, id: ${file._id}`);
    return file;
  } catch (error) {
    logger.error(`Error getting file info from GridFS: ${error.message}`);
    throw error;
  }
};

/**
 * Stream a file from GridFS directly to an HTTP response
 * @param {string} fileId - ID of the file
 * @param {Object} res - Express response object
 * @returns {Promise<void>}
 */
const streamToResponse = (fileId, res) => {
  return new Promise((resolve, reject) => {
    try {
      const bucket = initGridFS();
      if (!bucket) {
        logger.error('GridFS not initialized, database connection may be missing');
        if (!res.headersSent) {
          res.status(500).json({ error: 'Database connection error' });
        }
        return reject(new Error('GridFS not initialized, database connection may be missing'));
      }
      
      // Convert string ID to ObjectId if needed
      let id;
      try {
        id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
      } catch (idError) {
        logger.error(`Invalid ObjectId format: ${fileId}`);
        if (!res.headersSent) {
          res.status(400).json({ error: 'Invalid file ID format' });
        }
        return reject(new Error(`Invalid ObjectId format: ${fileId}`));
      }
      
      // Get file info first to set appropriate headers
      getFileInfo(id)
        .then(fileInfo => {
          // Set response headers
          res.set('Content-Type', fileInfo.contentType || 'application/octet-stream');
          res.set('Content-Disposition', `inline; filename="${fileInfo.filename}"`);
          res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
          
          // Create download stream
          const downloadStream = bucket.openDownloadStream(id);
          
          downloadStream.on('error', (error) => {
            logger.error(`Error streaming file from GridFS: ${error.message}`);
            if (!res.headersSent) {
              res.status(404).json({ error: 'File not found or error streaming file' });
            }
            reject(error);
          });
          
          downloadStream.on('end', () => {
            logger.info(`Completed streaming file: ${fileInfo.filename}`);
            resolve();
          });
          
          // Pipe to response
          downloadStream.pipe(res);
        })
        .catch(error => {
          logger.error(`Error getting file info for streaming: ${error.message}`);
          if (!res.headersSent) {
            res.status(404).json({ error: 'File not found' });
          }
          reject(error);
        });
    } catch (error) {
      logger.error(`Error in GridFS streaming: ${error.message}`);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Server error' });
      }
      reject(error);
    }
  });
};

module.exports = {
  initGridFS,
  uploadFile,
  downloadFile,
  deleteFile,
  findFiles,
  getFileInfo,
  streamToResponse,
  invalidateCache
}; 