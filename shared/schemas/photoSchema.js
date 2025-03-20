/**
 * Shared schema definition for photo objects
 * Used by both frontend and backend to ensure consistency
 */

const PhotoSchema = {
  // Core fields (always required)
  coreFields: {
    _id: 'string',         // MongoDB ObjectId (used both client & server side)
    originalName: 'string', // Original filename when uploaded
    contentType: 'string', // MIME type (image/jpeg, image/png, etc.)
    status: 'string',      // 'pending', 'uploading', 'uploaded', 'analyzed', 'error'
  },
  
  // Standard fields (usually present)
  standardFields: {
    path: 'string',        // API path to access the photo (/api/photos/:id)
    uploadDate: 'date',    // When the photo was added to the system
    clientId: 'string',    // Temporary client-side tracking ID (only used pre-upload)
  },
  
  // Extended fields (may be present)
  extendedFields: {
    aiAnalysis: 'object',    // AI analysis results
    size: 'number',        // File size in bytes
    width: 'number',       // Image width (if analyzed)
    height: 'number',      // Image height (if analyzed)
    metadata: 'object',    // Additional metadata
  },
  
  // Frontend-only fields (not stored in DB)
  frontendFields: {
    preview: 'string',     // Blob URL for local preview
    uploadProgress: 'number', // Upload progress percentage
  },
  
  // Status enum values
  statusValues: [
    'pending',     // Initial state when added
    'uploaded',    // Successfully uploaded to server
    'analyzed',    // Successfully analyzed by AI
    'error'        // Error state
  ],

  // Simple state validation
  isValidTransition(currentState, nextState) {
    const validTransitions = {
      'pending': ['uploaded', 'error'],
      'uploaded': ['analyzed', 'error'],
      'analyzed': ['error'],
      'error': ['pending']
    };
    return validTransitions[currentState]?.includes(nextState);
  },

  // Helper functions for photo operations
  helpers: {
    canUpload(photo) {
      return photo?.status === 'pending' && !!photo.file;
    },

    canAnalyze(photo) {
      return photo?.status === 'uploaded' && !!photo._id;
    },

    validatePhoto(photo) {
      if (!photo?.status) return { valid: false, error: 'Photo has no status' };
      
      const requirements = {
        'pending': () => !!photo.file,
        'uploaded': () => !!photo._id,
        'analyzed': () => !!photo._id && !!photo.aiAnalysis,
        'error': () => !!photo.error
      };

      const validator = requirements[photo.status];
      if (!validator) return { valid: false, error: `Unknown status: ${photo.status}` };

      return {
        valid: validator(),
        error: validator() ? null : `Invalid photo data for status ${photo.status}`
      };
    },

    generateClientId() {
      return `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    }
  },

  /**
   * Creates a photo object directly from a File object
   * This is the primary way to create new photo objects
   * @param {File} file - The file object from input or drop
   * @param {Object} options - Additional options (clientId, metadata)
   * @returns {Object} - Properly structured photo object
   */
  createFromFile(file, options = {}) {
    if (!file) return null;
    
    // Use existing client ID if provided (from file._tempId, file.clientId, or options)
    const clientId = options.clientId || file._tempId || file.clientId || 
                    `temp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    return {
      _id: null, // Will be set by server after upload
      originalName: file.name,
      contentType: file.type,
      status: 'pending',
      path: '',
      uploadDate: new Date(),
      clientId,
      originalClientId: clientId, // Store original client ID for reference
      size: file.size,
      preview: URL.createObjectURL(file),
      uploadProgress: 0,
      file, // Store the file object for upload
      metadata: options.metadata || {}
    };
  },

  /**
   * Deserializes a photo object from API response (backend → frontend)
   * @param {Object} apiPhoto - Photo data from API
   * @returns {Object} - Deserialized photo for frontend
   */
  deserializeFromApi(apiPhoto) {
    if (!apiPhoto) return null;
    
    // Ensure path format is consistent
    let path = apiPhoto.path || '';
    if (path && !path.startsWith('/api/') && path.startsWith('/photos/')) {
      path = `/api${path}`;
    }
    
    // Determine the correct status based on photo data
    let status = apiPhoto.status || 'pending';
    
    // Only set to analyzed if we have both _id and aiAnalysis
    if (apiPhoto._id && !apiPhoto.aiAnalysis) {
      status = 'uploaded';  // If we have _id but no analysis, it's just uploaded
    } else if (apiPhoto._id && apiPhoto.aiAnalysis) {
      status = 'analyzed';  // Only mark as analyzed if we have both _id and analysis
    }
    
    return {
      _id: apiPhoto._id,
      originalName: apiPhoto.originalName,
      contentType: apiPhoto.contentType,
      status: status,
      path,
      uploadDate: apiPhoto.uploadDate ? new Date(apiPhoto.uploadDate) : new Date(),
      size: apiPhoto.size,
      aiAnalysis: apiPhoto.aiAnalysis || null,
      uploadProgress: 100,
      preview: null
    };
  },

  /**
   * Creates photo metadata for GridFS storage
   * @param {String} reportId - Report ID the photo belongs to
   * @param {String} originalName - Original filename
   @param {String} clientId - Client-side tracking ID
   * @param {Object} additionalMetadata - Additional metadata
   * @returns {Object} - Photo metadata object
   */
  createMetadata(reportId, originalName, clientId = null, additionalMetadata = {}) {
    return {
      reportId,
      originalName,
      uploadDate: new Date(),
      clientId,
      ...additionalMetadata
    };
  }
};

export default PhotoSchema; 