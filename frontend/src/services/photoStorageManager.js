import PhotoSchema from 'shared/schemas/photoSchema';
import { photoLogger } from '../utils/logger';

/**
 * PhotoStorageManager - Centralizes photo data handling across components
 * 
 * Responsible for:
 * - Tracking available photo representations (file, blob, URL)
 * - Determining best source for operations (analysis, display)
 * - Preserving local file data through component transitions
 */
class PhotoStorageManager {
  
  /**
   * Ensure a photo object has all necessary data and properties preserved
   * @param {Object} photo - The photo object to process
   * @returns {Object} - Enhanced photo object with preserved data
   */
  preservePhotoData(photo) {
    if (!photo) return null;
    
    // Create a new object to avoid modifying the original
    const processedPhoto = { ...photo };
    
    // Ensure file object is preserved
    if (photo.file) {
      processedPhoto.file = photo.file;
      
      // Create preview URL if missing but we have a file
      if (!processedPhoto.preview && photo.file instanceof File) {
        processedPhoto.preview = URL.createObjectURL(photo.file);
      }
      
      // Create data URL synchronously if we have a file but no localDataUrl
      // This is more immediate but can block the UI for large files
      if (!processedPhoto.localDataUrl && photo.file.size < 5 * 1024 * 1024) { // Only for files under 5MB
        try {
          const reader = new FileReader();
          // Use a synchronous approach with a flag
          let dataUrl = null;
          let done = false;
          
          reader.onload = () => {
            dataUrl = reader.result;
            done = true;
          };
          
          reader.readAsDataURL(photo.file);
          
          // Small spin wait for the reader to complete (this is a bit of a hack but works for small files)
          const startTime = Date.now();
          while (!done && Date.now() - startTime < 200) {
            // Wait for reader to complete or timeout after 200ms
          }
          
          if (dataUrl) {
            processedPhoto.localDataUrl = dataUrl;
          }
        } catch (err) {
          console.error('Failed to create data URL synchronously:', err);
        }
      }
    }
    
    // Ensure preview URLs are preserved
    if (photo.preview) {
      processedPhoto.preview = photo.preview;
      
      // Store data URLs as localDataUrl for analysis
      if (photo.preview.startsWith('data:') && !processedPhoto.localDataUrl) {
        processedPhoto.localDataUrl = photo.preview;
      }
    }
    
    // Preserve existing localDataUrl
    if (photo.localDataUrl) {
      processedPhoto.localDataUrl = photo.localDataUrl;
    }
    
    // If we have a preview but no localDataUrl, and the preview is a blob URL,
    // try to convert it to a data URL for better persistence (async fallback)
    if (processedPhoto.preview && !processedPhoto.localDataUrl && 
        processedPhoto.preview.startsWith('blob:') && processedPhoto.file) {
      // We'll create a data URL asynchronously as a fallback
      this.createDataUrlFromFile(processedPhoto.file)
        .then(dataUrl => {
          processedPhoto.localDataUrl = dataUrl;
        })
        .catch(err => {
          console.error('Failed to create data URL from file:', err);
        });
    }
    
    // Ensure path/URL is set
    if (!processedPhoto.url && !processedPhoto.path) {
      this.ensurePhotoUrl(processedPhoto);
    }
    
    return processedPhoto;
  }
  
  /**
   * Create a data URL from a file object
   * @param {File} file - The file to convert
   * @returns {Promise<string>} - Promise resolving to a data URL
   */
  createDataUrlFromFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('No file provided'));
        return;
      }
      
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
  
  /**
   * Process a batch of photos to ensure all have preserved data
   * @param {Array} photos - Array of photo objects
   * @returns {Array} - Array of enhanced photo objects
   */
  preserveBatchPhotoData(photos) {
    if (!photos || !Array.isArray(photos)) return [];
    return photos.map(photo => this.preservePhotoData(photo));
  }
  
  /**
   * Ensure a photo has a URL property
   * @param {Object} photo - The photo object to process
   * @returns {Object} - The photo object with URL set
   */
  ensurePhotoUrl(photo) {
    if (!photo) return null;
    
    const processedPhoto = { ...photo };
    
    if (!processedPhoto.url && !processedPhoto.path) {
      const baseApiUrl = import.meta.env.VITE_API_URL || '';
      
      // Try to construct a URL from available identifiers
      if (processedPhoto._id) {
        processedPhoto.path = `/api/photos/${processedPhoto._id}`;
      } else if (processedPhoto.fileId) {
        processedPhoto.path = `/api/photos/${processedPhoto.fileId}`;
      } else if (processedPhoto.id) {
        processedPhoto.path = `/api/photos/${processedPhoto.id}`;
      }
    }
    
    return processedPhoto;
  }
  
  /**
   * Get the best available data source for a photo
   * @param {Object} photo - The photo object
   * @returns {Object} - Source info { type: 'file|blob|url', data: Object }
   */
  getBestDataSource(photo) {
    if (!photo) return { type: 'none', data: null };
    
    // Prioritize local file for best performance and quality
    if (photo.file) {
      return { type: 'file', data: photo.file };
    }
    
    // Next best is a data URL or blob URL stored locally
    if (photo.localDataUrl) {
      return { type: 'dataUrl', data: photo.localDataUrl };
    }
    
    if (photo.preview && photo.preview.startsWith('data:')) {
      return { type: 'dataUrl', data: photo.preview };
    }
    
    // Fall back to server URL if we have an ID
    if (photo._id || photo.id) {
      return { 
        type: 'serverUrl', 
        data: photo.path || `/api/photos/${photo._id || photo.id}`,
        id: photo._id || photo.id
      };
    }
    
    // No good data source
    return { type: 'none', data: null };
  }
  
  /**
   * Get the best URL for displaying a photo
   * @param {Object} photo - The photo object
   * @param {String} size - Size variant ('original', 'thumbnail', 'medium')
   * @returns {String} - Best URL for the photo
   */
  getPhotoUrl(photo, size = 'original') {
    if (!photo) return '';
    
    // Use preview if available (client-side preview)
    if (photo.preview) {
      return photo.preview;
    }
    
    // Extract the ID from the photo object
    const photoId = photo._id || photo.fileId || photo.id;
    
    if (!photoId) {
      return '';
    }
    
    // Generate appropriate URL based on size
    const baseUrl = `/api/photos/${photoId}`;
    
    switch(size) {
      case 'thumbnail':
        return `${baseUrl}?size=thumbnail`;
      case 'medium':
        return `${baseUrl}?size=medium`;
      default:
        return baseUrl;
    }
  }
  
  /**
   * Sort photos into groups based on available data
   * @param {Array} photos - Array of photo objects
   * @returns {Object} - Groups of photos { withLocalData: [], needsServerAnalysis: [] }
   */
  groupPhotosByDataAvailability(photos) {
    if (!photos || !Array.isArray(photos)) {
      return { withLocalData: [], needsServerAnalysis: [] };
    }
    
    const withLocalData = [];
    const needsServerAnalysis = [];
    
    photos.forEach(photo => {
      const dataSource = this.getBestDataSource(photo);
      
      if (dataSource.type === 'file' || dataSource.type === 'dataUrl') {
        withLocalData.push(photo);
      } else if (dataSource.type === 'serverUrl') {
        needsServerAnalysis.push(photo);
      }
    });
    
    return { withLocalData, needsServerAnalysis };
  }
  
  /**
   * Log diagnostic info about photo data availability
   * @param {Array} photos - Array of photo objects 
   * @returns {Array} - Array of photo data availability info
   */
  logPhotoDataAvailability(photos) {
    if (!photos || !Array.isArray(photos)) return [];
    
    const availability = photos.map(p => ({
      id: p._id || p.id,
      hasFile: !!p.file,
      hasPreview: !!p.preview,
      hasLocalDataUrl: !!p.localDataUrl,
      bestSource: this.getBestDataSource(p).type
    }));
    
    photoLogger.info('Photo data availability:', availability);
    
    // Count photos with file data
    const withLocalData = photos.filter(p => p.file || p.localDataUrl || 
      (p.preview && p.preview.startsWith('data:'))).length;
    
    photoLogger.info(`${withLocalData} of ${photos.length} photos have local data available`);
    
    return availability;
  }
}

// Export a singleton instance
export default new PhotoStorageManager(); 