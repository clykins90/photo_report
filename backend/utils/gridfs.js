const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

let gridFSBucket;
let initializationInProgress = false;
let lastInitAttempt = 0;
const INIT_COOLDOWN = 1000; // 1 second cooldown between init attempts

// Cache for empty queries to avoid repeated database calls
let cachedAllFiles = null;
let cacheTimestamp = null;
const CACHE_TTL = 60000; // 1 minute cache TTL

/**
 * Initialize the GridFS bucket
 * @param {boolean} force - Force reinitialization even if already initialized
 * @returns {GridFSBucket} The GridFS bucket instance
 */
const initGridFS = async (force = false) => {
  try {
    // If initialization is already in progress, wait a bit and return current bucket
    if (initializationInProgress) {
      logger.info('GridFS initialization already in progress, waiting...');
      await new Promise(r => setTimeout(r, 100));
      return gridFSBucket;
    }
    
    // If bucket already exists and we're not forcing reinitialization, return it
    if (gridFSBucket && !force) {
      return gridFSBucket;
    }
    
    // Check if we've tried to initialize too recently
    const now = Date.now();
    if (!force && lastInitAttempt && (now - lastInitAttempt < INIT_COOLDOWN)) {
      logger.debug(`Skipping GridFS init, last attempt was ${now - lastInitAttempt}ms ago`);
      return gridFSBucket;
    }
    
    // Set initialization flag and timestamp
    initializationInProgress = true;
    lastInitAttempt = now;
    
    // Check MongoDB connection state
    const dbState = mongoose.connection.readyState;
    const dbStateText = {
      0: 'disconnected',
      1: 'connected',
      2: 'connecting',
      3: 'disconnecting'
    }[dbState] || 'unknown';
    
    logger.info(`MongoDB connection state before GridFS init: ${dbStateText} (${dbState})`);
    
    // If not connected, try to connect
    if (dbState !== 1) {
      try {
        logger.info('MongoDB not connected, attempting to connect...');
        await mongoose.connect(process.env.MONGODB_URI);
        logger.info(`MongoDB connected: ${mongoose.connection.host}`);
      } catch (connError) {
        logger.error(`Failed to connect to MongoDB: ${connError.message}`);
        initializationInProgress = false;
        return null;
      }
    }
    
    // Wait for connection to be fully established
    if (mongoose.connection.readyState !== 1) {
      logger.info('Waiting for MongoDB connection to be fully established...');
      
      try {
        // Wait for connection to be ready
        await new Promise((resolve, reject) => {
          // If already connected, resolve immediately
          if (mongoose.connection.readyState === 1) {
            return resolve();
          }
          
          // Otherwise wait for the connected event
          const connectedHandler = () => {
            logger.info('MongoDB connection established');
            resolve();
          };
          
          mongoose.connection.once('connected', connectedHandler);
          
          // Add a timeout to prevent hanging
          const timeoutId = setTimeout(() => {
            mongoose.connection.removeListener('connected', connectedHandler);
            logger.warn('MongoDB connection timeout - proceeding anyway');
            resolve();
          }, 5000);
          
          // Also listen for error events
          const errorHandler = (err) => {
            clearTimeout(timeoutId);
            mongoose.connection.removeListener('connected', connectedHandler);
            logger.error(`MongoDB connection error: ${err.message}`);
            reject(err);
          };
          
          mongoose.connection.once('error', errorHandler);
        });
      } catch (waitError) {
        logger.error(`Error waiting for MongoDB connection: ${waitError.message}`);
        initializationInProgress = false;
        return null;
      }
    }
    
    // Now initialize GridFS bucket
    logger.info('Initializing GridFS bucket...');
    
    try {
      gridFSBucket = new GridFSBucket(mongoose.connection.db, {
        bucketName: 'files'
      });
      logger.info('GridFS bucket initialized successfully');
    } catch (bucketError) {
      logger.error(`Error creating GridFS bucket: ${bucketError.message}`);
      gridFSBucket = null;
    }
    
    // Reset initialization flag
    initializationInProgress = false;
    return gridFSBucket;
  } catch (error) {
    logger.error(`Error initializing GridFS bucket: ${error.message}`, error);
    initializationInProgress = false;
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
const streamToResponse = async (fileId, res) => {
  return new Promise(async (resolve, reject) => {
    try {
      // Try to initialize GridFS up to 3 times
      let bucket = null;
      let retryCount = 0;
      const maxRetries = 3;
      
      while (!bucket && retryCount < maxRetries) {
        try {
          bucket = await initGridFS(retryCount > 0); // Force reinitialization on retry
          
          if (!bucket) {
            retryCount++;
            logger.warn(`GridFS not initialized, attempt ${retryCount}/${maxRetries}`);
            
            // Wait a bit before retrying
            if (retryCount < maxRetries) {
              logger.info(`Waiting before retry ${retryCount}...`);
              await new Promise(r => setTimeout(r, 500 * retryCount));
            }
          }
        } catch (initError) {
          logger.error(`Error initializing GridFS: ${initError.message}`);
          retryCount++;
          
          if (retryCount < maxRetries) {
            await new Promise(r => setTimeout(r, 500 * retryCount));
          }
        }
      }
      
      if (!bucket) {
        logger.error('GridFS not initialized after multiple attempts, database connection may be missing');
        if (!res.headersSent) {
          res.status(500).json({ 
            error: 'Database connection error',
            message: 'Could not initialize GridFS after multiple attempts'
          });
        }
        return reject(new Error('GridFS not initialized, database connection may be missing'));
      }
      
      // Convert string ID to ObjectId if needed
      let id;
      try {
        id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
        logger.info(`Streaming file with ID: ${id}`);
      } catch (idError) {
        logger.error(`Invalid ObjectId format: ${fileId}`);
        if (!res.headersSent) {
          res.status(400).json({ error: 'Invalid file ID format' });
        }
        return reject(new Error(`Invalid ObjectId format: ${fileId}`));
      }
      
      // Get file info first to set appropriate headers
      try {
        const fileInfo = await getFileInfo(id);
        
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
      } catch (error) {
        logger.error(`Error getting file info for streaming: ${error.message}`);
        
        // Try a direct stream as a fallback
        try {
          logger.info(`Attempting direct stream for file ID: ${id}`);
          const directStream = bucket.openDownloadStream(id);
          
          directStream.on('error', (streamError) => {
            logger.error(`Error in direct stream fallback: ${streamError.message}`);
            if (!res.headersSent) {
              res.status(404).json({ error: 'File not found' });
            }
            reject(streamError);
          });
          
          directStream.on('end', () => {
            logger.info(`Completed direct stream for file ID: ${id}`);
            resolve();
          });
          
          // Set basic headers for direct stream
          res.set('Content-Type', 'application/octet-stream');
          res.set('Cache-Control', 'public, max-age=86400');
          
          // Pipe to response
          directStream.pipe(res);
        } catch (directError) {
          logger.error(`Direct stream fallback failed: ${directError.message}`);
          if (!res.headersSent) {
            res.status(404).json({ error: 'File not found' });
          }
          reject(error);
        }
      }
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