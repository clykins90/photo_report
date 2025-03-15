const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const mongoose = require('mongoose');
const logger = require('./logger');
const gridfs = require('./gridfs');

/**
 * Downloads a file from GridFS and saves it to a temporary location
 * @param {string} fileId - The ID of the file to download
 * @param {string} tempDir - Directory to store the temp file (defaults to /tmp)
 * @returns {Promise<Object>} Object containing the temp file path and stats
 */
const downloadToTempFile = async (fileId, tempDir = '/tmp') => {
  if (!mongoose.Types.ObjectId.isValid(fileId)) {
    throw new Error(`Invalid ObjectId format: ${fileId}`);
  }

  const startTime = Date.now();
  logger.debug(`Starting download of file ${fileId} to temp location`);
  
  // Create the temp file path
  const tempFilePath = path.join(tempDir, `${fileId}.jpg`);
  
  // Initialize GridFS bucket
  const bucket = await gridfs.initGridFS();
  
  // Create download stream
  const downloadStream = bucket.openDownloadStream(new mongoose.Types.ObjectId(fileId));
  const writeStream = fs.createWriteStream(tempFilePath);
  
  // Download the file
  await new Promise((resolve, reject) => {
    downloadStream.pipe(writeStream)
      .on('error', reject)
      .on('finish', resolve);
  });
  
  // Get file stats
  const fileStats = await fsPromises.stat(tempFilePath);
  
  const downloadTime = (Date.now() - startTime) / 1000;
  logger.debug(`File ${fileId} downloaded to ${tempFilePath} (${Math.round(fileStats.size/1024)} KB) in ${downloadTime}s`);
  
  return {
    path: tempFilePath,
    stats: fileStats,
    downloadTime
  };
};

/**
 * Cleans up a temporary file
 * @param {string} tempFilePath - Path to the temporary file
 */
const cleanupTempFile = async (tempFilePath) => {
  try {
    await fsPromises.unlink(tempFilePath);
    logger.debug(`Deleted temporary file: ${tempFilePath}`);
  } catch (unlinkError) {
    logger.warn(`Failed to delete temporary file ${tempFilePath}: ${unlinkError.message}`);
  }
};

/**
 * Processes photos in parallel with a specified batch size
 * @param {Array} photos - Array of photos to process
 * @param {Function} processFn - Processing function for each photo
 * @param {Object} options - Processing options
 * @returns {Promise<Array>} Array of processing results
 */
const processPhotosInParallel = async (photos, processFn, options = {}) => {
  const {
    batchSize = 3,
    shouldSortPhotos = false,
    shouldAbortOnError = false
  } = options;
  
  if (!photos || photos.length === 0) {
    return [];
  }
  
  // Make a copy of the photos array to avoid modifying the original
  let photosToProcess = [...photos];
  
  // Sort photos if needed (e.g., by upload date or filename)
  if (shouldSortPhotos) {
    photosToProcess.sort((a, b) => {
      return new Date(a.uploadDate) - new Date(b.uploadDate);
    });
  }
  
  const results = [];
  const batches = [];
  
  // Split photos into batches
  for (let i = 0; i < photosToProcess.length; i += batchSize) {
    batches.push(photosToProcess.slice(i, i + batchSize));
  }
  
  // Process batches sequentially
  for (const batch of batches) {
    try {
      // Process photos in current batch in parallel
      const batchPromises = batch.map(photo => 
        processFn(photo)
          .catch(error => {
            logger.error(`Error processing photo ${photo._id}: ${error.message}`);
            if (shouldAbortOnError) {
              throw error; // Rethrow to abort entire batch
            }
            return { photoId: photo._id, status: 'error', error: error.message };
          })
      );
      
      // Wait for all photos in batch to complete
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    } catch (error) {
      if (shouldAbortOnError) {
        throw error; // Abort entire processing
      }
      // Otherwise continue with next batch
    }
  }
  
  return results;
};

module.exports = {
  downloadToTempFile,
  cleanupTempFile,
  processPhotosInParallel
}; 