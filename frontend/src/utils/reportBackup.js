/**
 * Utility functions for backing up and restoring report data
 * to avoid losing AI-generated content when submission errors occur
 */

// Key used in localStorage for report backups
const REPORT_BACKUP_KEY = 'photo_report_app_backup';

/**
 * Backs up report data to localStorage
 * @param {Object} reportData - The report data to back up
 * @param {Array} photos - The photos data to back up
 * @returns {void}
 */
export const backupReportData = (reportData, photos) => {
  try {
    // Create a backup object with timestamp
    const backup = {
      timestamp: new Date().toISOString(),
      reportData,
      photos
    };
    
    // Save to localStorage
    localStorage.setItem(REPORT_BACKUP_KEY, JSON.stringify(backup));
    console.log('Report data backed up successfully', backup);
    return true;
  } catch (error) {
    console.error('Failed to backup report data:', error);
    return false;
  }
};

/**
 * Retrieves backed up report data from localStorage
 * @returns {Object|null} The backed up report data or null if none exists
 */
export const getBackupReportData = () => {
  try {
    const backupJson = localStorage.getItem(REPORT_BACKUP_KEY);
    if (!backupJson) return null;
    
    const backup = JSON.parse(backupJson);
    console.log('Retrieved backup report data from', backup.timestamp);
    return backup;
  } catch (error) {
    console.error('Failed to retrieve backup report data:', error);
    return null;
  }
};

/**
 * Clears backed up report data from localStorage
 * @returns {boolean} Whether the operation was successful
 */
export const clearBackupReportData = () => {
  try {
    localStorage.removeItem(REPORT_BACKUP_KEY);
    console.log('Backup report data cleared');
    return true;
  } catch (error) {
    console.error('Failed to clear backup report data:', error);
    return false;
  }
};

/**
 * Checks if there is backed up report data
 * @returns {boolean} Whether there is backed up report data
 */
export const hasBackupReportData = () => {
  return localStorage.getItem(REPORT_BACKUP_KEY) !== null;
}; 