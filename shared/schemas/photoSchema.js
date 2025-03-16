/**
 * Shared schema definition for photo objects
 * Used by both frontend and backend to ensure consistency
 */

const PhotoSchema = {
  // Core fields (always required)
  coreFields: {
    _id: 'string',         // MongoDB ObjectId
    originalName: 'string', // Original filename when uploaded
    contentType: 'string', // MIME type (image/jpeg, image/png, etc.)
    status: 'string',      // 'pending', 'uploading', 'uploaded', 'analyzed', 'error'
  },
  
  // Standard fields (usually present)
  standardFields: {
    path: 'string',        // API path to access the photo (/api/photos/:id)
    uploadDate: 'date',    // When the photo was added to the system
    clientId: 'string',    // Client-side tracking ID
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
   * Creates an empty photo object with default values
   * @returns {Object} - Empty photo object with default values
   */
  createEmpty() {
    return {
      _id: null,
      originalName: '',
      contentType: 'image/jpeg',
      status: 'pending',
      path: '',
      uploadDate: new Date(),
      clientId: null,
      uploadProgress: 0
    };
  },

  /**
   * Creates a client-side photo object from a File object
   * @param {File} file - The file object from input or drop
   * @returns {Object} - Client-side photo object
   */
  createFromFile(file) {
    if (!file) return null;
    
    const clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    
    return {
      originalName: file.name,
      contentType: file.type,
      size: file.size,
      preview: URL.createObjectURL(file),
      status: 'pending',
      uploadProgress: 0,
      clientId,
      uploadDate: new Date()
    };
  },

  /**
   * Serializes a photo object for API requests (frontend → backend)
   * @param {Object} photo - Frontend photo object
   * @returns {Object} - Serialized photo for API
   */
  serializeForApi(photo) {
    // Remove frontend-only fields
    const { preview, uploadProgress, ...apiPhoto } = photo;
    return apiPhoto;
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
    
    return {
      ...apiPhoto,
      path,
      // Default frontend fields if not present
      uploadProgress: 100,
      preview: null
    };
  },

  /**
   * Creates photo metadata for GridFS storage
   * @param {String} reportId - Report ID the photo belongs to
   * @param {String} originalName - Original filename
   * @param {String} clientId - Client-side tracking ID
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