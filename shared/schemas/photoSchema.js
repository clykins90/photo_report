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
    analysis: 'object',    // AI analysis results
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
    'pending',     // Initial state before upload
    'uploading',   // Currently being uploaded
    'uploaded',    // Successfully uploaded
    'analyzing',   // Being analyzed
    'analyzed',    // Successfully analyzed
    'error'        // Error state
  ],

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
    let status = apiPhoto.status;
    if (!status) {
      // If no status provided but has _id, it's at least uploaded
      status = apiPhoto._id ? 'uploaded' : 'pending';
      // If it has analysis data, it should be analyzed
      if (apiPhoto.analysis) {
        status = 'analyzed';
      }
    }
    
    return {
      _id: apiPhoto._id,
      originalName: apiPhoto.originalName,
      contentType: apiPhoto.contentType,
      status: status,
      path,
      uploadDate: apiPhoto.uploadDate ? new Date(apiPhoto.uploadDate) : new Date(),
      size: apiPhoto.size,
      analysis: apiPhoto.analysis || null,
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