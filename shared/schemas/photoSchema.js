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
      // A photo can be analyzed if:
      // 1. It has a status of 'uploaded' AND has an _id (preferred path)
      if (photo?.status === 'uploaded' && !!photo._id) {
        return true;
      }
      
      // 2. It has an _id but no analysis yet (fallback)
      if (!!photo?._id && !photo.aiAnalysis && !photo.analysis && 
          photo.status !== 'analyzed' && photo.status !== 'pending') {
        return true;
      }
      
      return false;
    },

    validatePhoto(photo) {
      if (!photo?.status) return { valid: false, error: 'Photo has no status' };
      
      const requirements = {
        'pending': () => !!photo.file,
        'uploaded': () => !!photo._id,
        'analyzed': () => !!photo._id && (!!photo.aiAnalysis || !!photo.analysis),
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
    
    // Attach clientId to the file object itself so it can be accessed during upload
    file.clientId = clientId;
    file.originalClientId = clientId;
    
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
   * @param {Object} [clientPhoto] - Optional client-side photo to merge with
   * @returns {Object} - Deserialized photo for frontend
   */
  deserializeFromApi(apiPhoto, clientPhoto = null) {
    if (!apiPhoto) return null;
    
    // Ensure path format is consistent
    let path = apiPhoto.path || '';
    if (path && !path.startsWith('/api/') && path.startsWith('/photos/')) {
      path = `/api${path}`;
    }
    
    // Always use the server's status value
    const status = apiPhoto.status || 'uploaded';
    
    // Create the standardized server response
    const standardizedPhoto = {
      _id: apiPhoto._id,
      originalName: apiPhoto.originalName,
      contentType: apiPhoto.contentType || (apiPhoto.file?.type || null),
      status,
      path,
      uploadDate: apiPhoto.uploadDate ? new Date(apiPhoto.uploadDate) : new Date(),
      size: apiPhoto.size,
      // Use aiAnalysis from either property name (aiAnalysis or analysis)
      aiAnalysis: apiPhoto.aiAnalysis || apiPhoto.analysis || null,
      uploadProgress: 100
    };
    
    // Merge with client photo if provided
    if (clientPhoto) {
      return {
        ...clientPhoto,         // Preserve client data (base)
        ...standardizedPhoto,   // Apply server data over it
        // Explicitly preserve important client-side properties
        preview: clientPhoto.preview || null, // Keep client preview
        file: clientPhoto.file || null,       // Keep client file
        // Ensure critical properties from server always take precedence
        _id: standardizedPhoto._id,
        status: standardizedPhoto.status,
        path: standardizedPhoto.path,
        aiAnalysis: standardizedPhoto.aiAnalysis
      };
    }
    
    // If no client photo, just return the standardized server data
    return standardizedPhoto;
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