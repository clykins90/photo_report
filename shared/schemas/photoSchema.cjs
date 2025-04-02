/**
 * Shared schema definition for photo objects
 * Used by both frontend and backend to ensure consistency
 * CommonJS version for backend use
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
  },

  /**
   * Serializes a photo object for API responses
   * @param {Object} photo - Database photo object
   * @returns {Object} - API-ready photo object
   */
  serializeForApi(photo) {
    if (!photo) return null;
    
    // Check if photo is a Mongoose document
    const rawData = photo._doc || photo;
    
    // For debugging
    console.log('Raw photo data for serialization:', {
      id: rawData._id,
      hasAnalysis: !!rawData.analysis,
      hasAiAnalysis: !!rawData.aiAnalysis,
      analysisKeys: rawData.analysis ? Object.keys(rawData.analysis) : [],
      analysisData: rawData.analysis
    });
    
    // Extract only the necessary fields to prevent circular references
    // and avoid sending internal Mongoose properties
    const cleanPhoto = {
      _id: rawData._id,
      path: rawData.path || '',
      section: rawData.section || 'Uncategorized',
      userDescription: rawData.userDescription || '',
      status: rawData.status || 'uploaded', // Always include the server's status
      aiAnalysis: null // We'll set this below with proper checks
    };
    
    // Properly extract and combine analysis data from either analysis or aiAnalysis field
    const analysisSource = rawData.analysis || rawData.aiAnalysis;
    if (analysisSource) {
      cleanPhoto.aiAnalysis = {
        tags: Array.isArray(analysisSource.tags) ? analysisSource.tags : [],
        severity: analysisSource.severity || 'unknown',
        description: analysisSource.description || '',
        confidence: typeof analysisSource.confidence === 'number' ? analysisSource.confidence : 0,
        damageDetected: !!analysisSource.damageDetected
      };
      
      // Make sure we explicitly copy the status from the database
      if (rawData.status === 'analyzed') {
        cleanPhoto.status = 'analyzed';
      }
      
      // If we have analysis data with content but status is not 'analyzed', 
      // ensure it's set properly
      if (cleanPhoto.aiAnalysis.description || cleanPhoto.aiAnalysis.tags.length > 0) {
        cleanPhoto.status = 'analyzed';
      }
    } else {
      // No analysis data
      cleanPhoto.aiAnalysis = { 
        tags: [], 
        severity: 'unknown', 
        description: '', 
        confidence: 0, 
        damageDetected: false 
      };
    }
    
    // Add other fields if they exist
    if (rawData.filename) cleanPhoto.filename = rawData.filename;
    if (rawData.contentType) cleanPhoto.contentType = rawData.contentType;
    if (rawData.size) cleanPhoto.size = rawData.size;
    if (rawData.uploadDate) cleanPhoto.uploadDate = rawData.uploadDate;
    if (rawData.clientId) cleanPhoto.clientId = rawData.clientId;
    if (rawData.originalName) cleanPhoto.originalName = rawData.originalName;
    
    // If there's metadata, extract only what's needed
    if (rawData.metadata && typeof rawData.metadata === 'object') {
      cleanPhoto.reportId = rawData.metadata.reportId;
      if (!cleanPhoto.clientId && rawData.metadata.clientId) {
        cleanPhoto.clientId = rawData.metadata.clientId;
      }
    }
    
    return cleanPhoto;
  },

  /**
   * Deserializes a photo object from API request
   * @param {Object} apiPhoto - Photo data from API request
   * @returns {Object} - Database-ready photo object
   */
  deserializeFromApi(apiPhoto) {
    if (!apiPhoto) return null;
    
    // Remove frontend-only fields
    const { preview, uploadProgress, ...dbPhoto } = apiPhoto;
    return dbPhoto;
  }
};

module.exports = PhotoSchema; 