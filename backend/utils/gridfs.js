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

// Cache expiration timestamps
const bucketTimestamps = {
  photos: null,
  pdf_report: null
};

// Cache TTL in milliseconds (30 minutes)
const BUCKET_CACHE_TTL = 30 * 60 * 1000;

// Store temporary chunks
const tempChunks = {};

/**
 * Initialize a GridFS bucket
 * @param {string} bucketName - Name of the bucket to initialize
 * @param {boolean} forceRefresh - Force refresh the bucket even if cached
 * @returns {GridFSBucket} The GridFS bucket instance
 */
const initGridFS = async (bucketName = 'photos', forceRefresh = false) => {
  // Check if bucket exists in cache and is not expired
  const now = Date.now();
  if (!forceRefresh && 
      buckets[bucketName] && 
      bucketTimestamps[bucketName] && 
      now - bucketTimestamps[bucketName] < BUCKET_CACHE_TTL) {
    // Bucket exists and is not expired, return it
    return buckets[bucketName];
  }
  
  // Check MongoDB connection state
  if (mongoose.connection.readyState !== 1) {
    logger.info('MongoDB not connected, using existing connection...');
    
    // Don't try to reconnect here - rely on the main connection logic
    // This avoids multiple connection attempts
    if (mongoose.connection.readyState === 0) {
      logger.warn('MongoDB disconnected, GridFS initialization may fail');
    }
  }
  
  try {
    // Get the db instance from the existing connection
    const db = mongoose.connection.db;
    if (!db) {
      logger.error('No database instance available');
      return null;
    }
    
    // Create a new bucket
    const bucket = new mongoose.mongo.GridFSBucket(db, {
      bucketName: bucketName
    });
    
    // Cache the bucket
    buckets[bucketName] = bucket;
    bucketTimestamps[bucketName] = now;
    
    logger.info(`GridFS bucket '${bucketName}' initialized successfully`);
    return bucket;
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
    // Get bucket from cache or initialize
    const bucket = await initGridFS(bucketName);
    if (!bucket) {
      throw new Error(`GridFS bucket '${bucketName}' not initialized`);
    }

    const filename = options.filename || `file_${Date.now()}`;
    const contentType = options.contentType || 'application/octet-stream';
    
    // Use a more efficient approach for small files (< 16MB)
    if (buffer.length < 16 * 1024 * 1024) {
      return new Promise((resolve, reject) => {
        // Create upload stream with optimized chunk size
        // Default MongoDB chunk size is 255KB, we'll use 1MB for better performance with larger files
        const uploadStream = bucket.openUploadStream(filename, {
          contentType,
          metadata: options.metadata || {},
          chunkSizeBytes: 1024 * 1024 // 1MB chunks
        });

        // Use direct buffer upload instead of creating a readable stream
        // This avoids the overhead of the stream pipeline
        uploadStream.once('finish', () => {
          resolve({
            id: uploadStream.id,
            filename,
            contentType,
            metadata: options.metadata,
            bucketName
          });
        });
        
        uploadStream.on('error', (err) => {
          logger.error(`GridFS upload stream error: ${err.message}`);
          reject(err);
        });
        
        // Write buffer directly to the upload stream
        uploadStream.write(buffer);
        uploadStream.end();
      });
    } else {
      // For larger files, use streaming approach with optimized settings
      return new Promise((resolve, reject) => {
        // Create upload stream with optimized chunk size
        const uploadStream = bucket.openUploadStream(filename, {
          contentType,
          metadata: options.metadata || {},
          chunkSizeBytes: 1024 * 1024 // 1MB chunks
        });

        // Create readable stream from buffer
        const { Readable } = require('stream');
        const readStream = new Readable({
          // Set high watermark to improve streaming performance
          highWaterMark: 1024 * 1024, // 1MB
          read() {} // Implementation required but not used
        });
        
        // Push the buffer in chunks to avoid memory issues
        const chunkSize = 1024 * 1024; // 1MB chunks
        let offset = 0;
        
        // Function to push chunks efficiently
        const pushChunks = () => {
          while (offset < buffer.length) {
            const end = Math.min(offset + chunkSize, buffer.length);
            const chunk = buffer.slice(offset, end);
            
            // If we can't push more (backpressure), wait for drain event
            if (!readStream.push(chunk)) {
              readStream.once('drain', pushChunks);
              return;
            }
            
            offset = end;
            
            // If we've pushed all chunks, end the stream
            if (offset >= buffer.length) {
              readStream.push(null);
              break;
            }
          }
        };
        
        // Start pushing chunks
        pushChunks();
        
        // Handle errors
        readStream.on('error', (err) => {
          logger.error(`Read stream error: ${err.message}`);
          reject(err);
        });
        
        uploadStream.on('error', (err) => {
          logger.error(`Upload stream error: ${err.message}`);
          reject(err);
        });
        
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
    }
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
    let bucket = await initGridFS(bucketName);
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

/**
 * Get a download stream for a file from GridFS
 * @param {string|ObjectId} fileId - ID of the file to download
 * @param {string} bucketName - Name of the bucket to use
 * @returns {Promise<stream.Readable>} A readable stream of the file
 */
const downloadFile = async (fileId, bucketName = 'photos') => {
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
    
    // Check if file exists in this bucket
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
      
      // Use the other bucket
      return otherBucket.openDownloadStream(id);
    }
    
    // Create and return download stream
    return bucket.openDownloadStream(id);
  } catch (error) {
    logger.error(`Error getting download stream for file '${fileId}': ${error.message}`);
    throw error;
  }
};

/**
 * Create a new chunked upload session
 * @param {string} fileId - Unique ID for the file being uploaded
 * @param {Object} options - Upload options
 * @param {string} bucketName - Name of the bucket to use
 * @returns {Promise<Object>} Session information
 */
const createChunkedUploadSession = async (fileId, options = {}, bucketName = 'photos') => {
  try {
    // Initialize bucket if needed
    await initGridFS(bucketName);
    
    // Create a new entry in tempChunks
    tempChunks[fileId] = {
      chunks: new Array(options.totalChunks || 0).fill(null),
      metadata: options.metadata || {},
      filename: options.filename || `chunked_${Date.now()}`,
      contentType: options.contentType || 'application/octet-stream',
      totalChunks: options.totalChunks || 0,
      receivedChunks: 0,
      complete: false,
      createdAt: new Date(),
      bucketName
    };
    
    logger.info(`Created chunked upload session for file ${fileId} with ${options.totalChunks} chunks`);
    
    return {
      fileId,
      filename: tempChunks[fileId].filename,
      totalChunks: tempChunks[fileId].totalChunks,
      status: 'initialized'
    };
  } catch (error) {
    logger.error(`Error creating chunked upload session: ${error.message}`);
    throw error;
  }
};

/**
 * Write a chunk to a chunked upload session
 * @param {string} fileId - ID of the file being uploaded
 * @param {number} chunkIndex - Index of the chunk
 * @param {Buffer} chunkData - Chunk data
 * @returns {Promise<Object>} Chunk status
 */
const writeChunk = async (fileId, chunkIndex, chunkData) => {
  try {
    // Check if session exists
    if (!tempChunks[fileId]) {
      throw new Error(`Chunked upload session not found for file ID: ${fileId}`);
    }
    
    const session = tempChunks[fileId];
    
    // Validate chunk index
    if (chunkIndex < 0 || chunkIndex >= session.totalChunks) {
      throw new Error(`Invalid chunk index: ${chunkIndex}`);
    }
    
    // Store chunk
    session.chunks[chunkIndex] = chunkData;
    session.receivedChunks++;
    
    logger.info(`Received chunk ${chunkIndex + 1}/${session.totalChunks} for file ${fileId}`);
    
    return {
      fileId,
      chunkIndex,
      receivedChunks: session.receivedChunks,
      totalChunks: session.totalChunks,
      progress: Math.round((session.receivedChunks / session.totalChunks) * 100),
      complete: session.receivedChunks === session.totalChunks
    };
  } catch (error) {
    logger.error(`Error writing chunk: ${error.message}`);
    throw error;
  }
};

/**
 * Complete a chunked upload by combining chunks and storing in GridFS
 * @param {string} fileId - ID of the file being uploaded
 * @param {Object} options - Additional options for the final file
 * @returns {Promise<Object>} File information
 */
const completeChunkedUpload = async (fileId, options = {}) => {
  try {
    // Check if session exists
    if (!tempChunks[fileId]) {
      throw new Error(`Chunked upload session not found for file ID: ${fileId}`);
    }
    
    const session = tempChunks[fileId];
    
    // Check if all chunks are received
    if (session.receivedChunks !== session.totalChunks) {
      throw new Error(`Cannot complete upload: only ${session.receivedChunks}/${session.totalChunks} chunks received`);
    }
    
    // Get bucket
    const bucket = await initGridFS(session.bucketName);
    if (!bucket) {
      throw new Error(`GridFS bucket '${session.bucketName}' not initialized`);
    }
    
    // Update metadata with any new options
    const metadata = {
      ...session.metadata,
      ...(options.metadata || {})
    };
    
    // Create upload stream
    const uploadStream = bucket.openUploadStream(
      options.filename || session.filename,
      {
        contentType: options.contentType || session.contentType,
        metadata,
        chunkSizeBytes: 1024 * 1024 // 1MB chunks for better performance
      }
    );
    
    // Process chunks in batches to avoid memory issues
    return new Promise((resolve, reject) => {
      let chunkIndex = 0;
      
      // Process next chunk
      const processNextChunk = () => {
        if (chunkIndex >= session.totalChunks) {
          // All chunks processed, end the stream
          uploadStream.end();
          return;
        }
        
        const chunk = session.chunks[chunkIndex];
        
        // Check if chunk exists
        if (!chunk) {
          uploadStream.destroy(new Error(`Missing chunk at index ${chunkIndex}`));
          return;
        }
        
        // Write chunk to stream
        const canContinue = uploadStream.write(chunk);
        
        // Free memory by removing the chunk after writing
        session.chunks[chunkIndex] = null;
        
        // Move to next chunk
        chunkIndex++;
        
        // If we can continue writing immediately, process next chunk
        // Otherwise wait for drain event
        if (canContinue && chunkIndex < session.totalChunks) {
          // Use setImmediate to avoid stack overflow for large files
          setImmediate(processNextChunk);
        } else if (chunkIndex < session.totalChunks) {
          uploadStream.once('drain', processNextChunk);
        }
      };
      
      // Handle upload completion
      uploadStream.on('finish', () => {
        logger.info(`Completed chunked upload for file ${fileId}, final size: ${uploadStream.bytesWritten} bytes`);
        
        // Clean up the temporary chunks
        delete tempChunks[fileId];
        
        resolve({
          id: uploadStream.id,
          filename: options.filename || session.filename,
          contentType: options.contentType || session.contentType,
          metadata,
          bucketName: session.bucketName
        });
      });
      
      // Handle errors
      uploadStream.on('error', (err) => {
        logger.error(`Error in chunked upload stream: ${err.message}`);
        
        // Clean up on error
        delete tempChunks[fileId];
        
        reject(err);
      });
      
      // Start processing chunks
      processNextChunk();
    });
  } catch (error) {
    logger.error(`Error completing chunked upload: ${error.message}`);
    
    // Clean up on error
    if (tempChunks[fileId]) {
      delete tempChunks[fileId];
    }
    
    throw error;
  }
};

/**
 * Clean up abandoned chunked upload sessions
 * @param {number} maxAgeMinutes - Maximum age in minutes before cleanup
 * @returns {Promise<number>} Number of sessions cleaned up
 */
const cleanupChunkedUploads = async (maxAgeMinutes = 60) => {
  try {
    const now = new Date();
    const maxAge = maxAgeMinutes * 60 * 1000; // Convert to milliseconds
    let cleanedCount = 0;
    
    for (const fileId in tempChunks) {
      const session = tempChunks[fileId];
      const sessionAge = now - session.createdAt;
      
      if (sessionAge > maxAge) {
        delete tempChunks[fileId];
        cleanedCount++;
        logger.info(`Cleaned up abandoned chunked upload session for file ${fileId}, age: ${Math.round(sessionAge / 60000)} minutes`);
      }
    }
    
    return cleanedCount;
  } catch (error) {
    logger.error(`Error cleaning up chunked uploads: ${error.message}`);
    return 0;
  }
};

module.exports = {
  initGridFS,
  uploadFile,
  uploadBuffer,
  streamToResponse,
  deleteFile,
  findFiles,
  uploadPdfReport,
  streamPdfReport,
  downloadFile,
  createChunkedUploadSession,
  writeChunk,
  completeChunkedUpload,
  cleanupChunkedUploads
}; 