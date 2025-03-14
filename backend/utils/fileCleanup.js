const fs = require('fs');
const fsPromises = fs.promises;
const path = require('path');
const logger = require('./logger');
const config = require('../config/config');

/**
 * Delete a file from the temporary directory
 * @param {string} filename - The name of the file to delete
 * @returns {Promise<boolean>} - True if successful, false otherwise
 */
const deleteFile = async (filename) => {
  try {
    const filePath = path.join(config.tempUploadDir, filename);
    if (fs.existsSync(filePath)) {
      await fsPromises.unlink(filePath);
      logger.info(`Deleted temporary file: ${filePath}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Error deleting file ${filename}: ${error.message}`);
    return false;
  }
};

/**
 * Clean up old temporary files
 * @param {number} maxAgeMs - Maximum age of files in milliseconds
 * @returns {Promise<number>} - Number of files deleted
 */
const cleanupOldFiles = async (maxAgeMs = 24 * 60 * 60 * 1000) => { // Default: 24 hours
  try {
    const now = Date.now();
    let deletedCount = 0;
    
    // Read all files in the temp directory
    const files = await fsPromises.readdir(config.tempUploadDir);
    
    for (const file of files) {
      const filePath = path.join(config.tempUploadDir, file);
      
      // Get file stats
      const stats = await fsPromises.stat(filePath);
      
      // Check if file is older than maxAgeMs
      if (now - stats.mtimeMs > maxAgeMs) {
        await fsPromises.unlink(filePath);
        logger.info(`Cleaned up old temporary file: ${filePath}`);
        deletedCount++;
      }
    }
    
    return deletedCount;
  } catch (error) {
    logger.error(`Error cleaning up old files: ${error.message}`);
    return 0;
  }
};

module.exports = {
  deleteFile,
  cleanupOldFiles
}; 