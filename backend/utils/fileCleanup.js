const fs = require('fs');
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
      await fs.promises.unlink(filePath);
      logger.info(`Deleted file: ${filename}`);
      return true;
    }
    return false;
  } catch (error) {
    logger.error(`Error deleting file ${filename}:`, error);
    return false;
  }
};

/**
 * Clean up files older than a certain age
 * @param {number} maxAgeMs - Maximum age in milliseconds
 * @returns {Promise<number>} - Number of files deleted
 */
const cleanupOldFiles = async (maxAgeMs = 24 * 60 * 60 * 1000) => { // Default: 24 hours
  try {
    const now = Date.now();
    const files = await fs.promises.readdir(config.tempUploadDir);
    let deletedCount = 0;
    
    for (const file of files) {
      const filePath = path.join(config.tempUploadDir, file);
      const stats = await fs.promises.stat(filePath);
      const fileAge = now - stats.mtime.getTime();
      
      if (fileAge > maxAgeMs) {
        await fs.promises.unlink(filePath);
        deletedCount++;
        logger.info(`Deleted old file: ${file} (age: ${Math.round(fileAge / 1000 / 60)} minutes)`);
      }
    }
    
    return deletedCount;
  } catch (error) {
    logger.error('Error cleaning up old files:', error);
    return 0;
  }
};

module.exports = {
  deleteFile,
  cleanupOldFiles
}; 