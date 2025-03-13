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
const initGridFS = () => {
  if (!gridFSBucket && mongoose.connection.readyState === 1) {
    gridFSBucket = new GridFSBucket(mongoose.connection.db, {
      bucketName: 'files'
    });
    logger.info('GridFS bucket initialized');
  }
  return gridFSBucket;
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
      const bucket = initGridFS();
      if (!bucket) {
        return reject(new Error('GridFS not initialized, database connection may be missing'));
      }

      const filename = options.filename || path.basename(filePath);
      const contentType = options.contentType || 'application/octet-stream';
      
      // Create upload stream
      const uploadStream = bucket.openUploadStream(filename, {
        contentType,
        metadata: options.metadata || {}
      });

      // Create read stream from file
      const readStream = fs.createReadStream(filePath);
      
      // Handle errors
      readStream.on('error', (error) => {
        logger.error(`Error reading file for GridFS upload: ${error.message}`);
        reject(error);
      });
      
      uploadStream.on('error', (error) => {
        logger.error(`Error uploading to GridFS: ${error.message}`);
        reject(error);
      });
      
      // On finish, resolve with file info
      uploadStream.on('finish', (file) => {
        logger.info(`File uploaded to GridFS: ${filename}, id: ${uploadStream.id}`);
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
      logger.error(`Error in GridFS upload: ${error.message}`);
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
        return reject(new Error('GridFS not initialized, database connection may be missing'));
      }

      // Convert string ID to ObjectId if needed
      const id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
      
      // Create download stream
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
        logger.info(`Download stream created for GridFS file with id: ${fileId}`);
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
 * @returns {Promise<Array>} Array of matching files
 */
const findFiles = async (query = {}) => {
  try {
    const bucket = initGridFS();
    if (!bucket) {
      throw new Error('GridFS not initialized, database connection may be missing');
    }
    
    // Using MongoDB native find operation
    const files = await mongoose.connection.db.collection('files.files').find(query).toArray();
    logger.info(`Found ${files.length} files in GridFS matching query`);
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
        return reject(new Error('GridFS not initialized, database connection may be missing'));
      }
      
      // Convert string ID to ObjectId if needed
      const id = typeof fileId === 'string' ? new mongoose.Types.ObjectId(fileId) : fileId;
      
      // Get file info first to set appropriate headers
      getFileInfo(id)
        .then(fileInfo => {
          // Set response headers
          res.set('Content-Type', fileInfo.contentType);
          res.set('Content-Disposition', `inline; filename="${fileInfo.filename}"`);
          
          // Create download stream
          const downloadStream = bucket.openDownloadStream(id);
          
          downloadStream.on('error', (error) => {
            logger.error(`Error streaming file from GridFS: ${error.message}`);
            if (!res.headersSent) {
              res.status(404).json({ error: 'File not found' });
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
  streamToResponse
}; 