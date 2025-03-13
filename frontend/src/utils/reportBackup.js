/**
 * Utility functions for backing up and restoring report data
 * to avoid losing AI-generated content when submission errors occur
 */

// Key used in localStorage for report backups
const REPORT_BACKUP_KEY = 'photo_report_app_backup';

/**
 * Sanitizes photo data to remove circular references and non-serializable properties
 * @param {Array} photos - The photos to sanitize
 * @returns {Array} Sanitized photos array
 */
const sanitizePhotosForBackup = (photos) => {
  if (!photos || !Array.isArray(photos)) return [];
  
  return photos.map(photo => {
    // Create a clean copy without circular references
    const sanitizedPhoto = {
      id: photo.id,
      name: photo.name,
      filename: photo.filename || photo.name,
      description: photo.description || '',
      status: photo.status || 'pending',
      preview: typeof photo.preview === 'string' ? photo.preview : null,
    };
    
    // Add important uploadedData properties if available
    if (photo.uploadedData) {
      sanitizedPhoto.uploadedData = {
        filename: photo.uploadedData.filename,
        thumbnailFilename: photo.uploadedData.thumbnailFilename,
        optimizedFilename: photo.uploadedData.optimizedFilename,
        thumbnailUrl: photo.uploadedData.thumbnailUrl,
        optimizedUrl: photo.uploadedData.optimizedUrl,
        originalUrl: photo.uploadedData.originalUrl,
      };
    }
    
    // Include analysis data if it exists
    if (photo.analysis) {
      sanitizedPhoto.analysis = {
        description: photo.analysis.description || '',
        tags: Array.isArray(photo.analysis.tags) ? photo.analysis.tags : [],
        damageDetected: photo.analysis.damageDetected || false,
        confidence: photo.analysis.confidence || 0,
        severity: photo.analysis.severity || 'unknown'
      };
    }
    
    return sanitizedPhoto;
  });
};

/**
 * Backs up report data to localStorage
 * @param {Object} reportData - The report data to back up
 * @param {Array} photos - The photos data to back up
 * @returns {void}
 */
export const backupReportData = (reportData, photos) => {
  try {
    // Make a shallow copy of reportData to avoid modifying the original
    const reportDataCopy = { ...reportData };
    
    // Remove any File objects or references from reportDataCopy
    if (reportDataCopy.photos) {
      delete reportDataCopy.photos;
    }
    
    // Sanitize photos to remove circular references
    const sanitizedPhotos = sanitizePhotosForBackup(photos);
    
    // Create a backup object with timestamp
    const backup = {
      timestamp: new Date().toISOString(),
      reportData: reportDataCopy,
      photos: sanitizedPhotos
    };
    
    // Attempt to serialize - if it fails, try a more aggressive sanitization
    try {
      JSON.stringify(backup);
    } catch (serializationError) {
      console.warn('Initial serialization failed, attempting more aggressive sanitization', serializationError);
      
      // More aggressive sanitization that converts File objects to simple references
      const safeBackup = JSON.parse(JSON.stringify({
        timestamp: backup.timestamp,
        reportData: backup.reportData,
        photos: backup.photos.map(p => ({
          ...p,
          // Remove any potentially problematic fields
          file: undefined,
          originalFile: undefined,
          preview: typeof p.preview === 'string' ? p.preview : null
        }))
      }, (key, value) => {
        // Handle non-serializable objects
        if (value instanceof File || value instanceof Blob) {
          return undefined; // Skip File objects
        }
        if (typeof value === 'object' && value !== null && Object.prototype.toString.call(value) === '[object File]') {
          return undefined; // Skip File-like objects
        }
        return value;
      }));
      
      // Save to localStorage
      localStorage.setItem(REPORT_BACKUP_KEY, JSON.stringify(safeBackup));
      console.log('Report data backed up successfully (after aggressive sanitization)');
      return true;
    }
    
    // If we got here, the initial serialization was successful
    localStorage.setItem(REPORT_BACKUP_KEY, JSON.stringify(backup));
    console.log('Report data backed up successfully');
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