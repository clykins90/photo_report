import api from './api';

/**
 * Generate a MongoDB-compatible ObjectId string
 * This creates a valid 24-character hexadecimal string that MongoDB will accept as an ObjectId
 * @returns {string} A valid MongoDB ObjectId string
 */
const generateObjectId = () => {
  const hexChars = '0123456789abcdef';
  let objectId = '';
  
  // Generate a 24-character hex string
  for (let i = 0; i < 24; i++) {
    objectId += hexChars.charAt(Math.floor(Math.random() * hexChars.length));
  }
  
  return objectId;
};

/**
 * Normalize severity value to match the backend's expected enum values
 * @param {string} severity - The severity value to normalize
 * @returns {string} - A normalized severity value that matches backend enum
 */
const normalizeSeverity = (severity) => {
  if (!severity) return 'minor';
  
  // Convert to lowercase for case-insensitive comparison
  const lowerSeverity = String(severity).toLowerCase().trim();
  
  // Handle exact matches first
  if (lowerSeverity === 'minor') return 'minor';
  if (lowerSeverity === 'moderate') return 'moderate';
  if (lowerSeverity === 'severe') return 'severe';
  
  // The valid enum values in the backend schema are: 'minor', 'moderate', 'severe'
  // Handle combination cases
  if (lowerSeverity.includes('moderate') && lowerSeverity.includes('severe')) {
    return 'severe'; // Handle "moderate to severe" case
  }
  if (lowerSeverity.includes('minor') && lowerSeverity.includes('moderate')) {
    return 'moderate'; // Handle "minor to moderate" case
  }
  
  // Handle partial matches
  if (lowerSeverity.includes('minor') || lowerSeverity.includes('low')) {
    return 'minor';
  } else if (lowerSeverity.includes('moderate') || lowerSeverity.includes('medium')) {
    return 'moderate';
  } else if (lowerSeverity.includes('major') || lowerSeverity.includes('high') || lowerSeverity.includes('severe')) {
    return 'severe';
  } else if (lowerSeverity.includes('critical')) {
    return 'severe'; // Map critical to the highest severity level
  }
  
  // Default to 'minor' if no match
  console.warn(`Unrecognized severity value: "${severity}" - defaulting to "minor"`);
  return 'minor';
};

/**
 * Create a new report
 * @param {Object} reportData - The report data
 * @returns {Promise} - The response from the API
 */
export const createReport = async (reportData) => {
  // Create a sanitized version of the data
  let dataToSend;
  try {
    // Deep clone to avoid reference issues and catch circular references early
    dataToSend = JSON.parse(JSON.stringify(reportData));
  } catch (error) {
    console.error('Error during JSON stringify/parse (likely circular references):', error);
    
    // Manually sanitize the data instead
    dataToSend = {
      title: reportData.title,
      clientName: reportData.clientName,
      propertyAddress: reportData.propertyAddress ? { ...reportData.propertyAddress } : undefined,
      inspectionDate: reportData.inspectionDate,
      weather: reportData.weather ? { ...reportData.weather } : undefined,
      summary: reportData.summary,
      damages: reportData.damages ? 
        reportData.damages.map(damage => ({
          type: damage.type,
          severity: normalizeSeverity(damage.severity), // Normalize damage severity
          description: damage.description,
          affectedAreas: damage.affectedAreas
        })) : [],
      recommendations: reportData.recommendations,
      materials: reportData.materials,
      tags: Array.isArray(reportData.tags) ? [...reportData.tags] : []
    };
    
    // Safely process photos
    if (reportData.photos && Array.isArray(reportData.photos)) {
      dataToSend.photos = reportData.photos.map(photo => {
        const sanitizedPhoto = {
          // Ensure each photo has a valid _id
          _id: photo._id || photo.id || generateObjectId(),
          filename: photo.filename || photo.name,
          path: photo.path || photo.url || photo.preview || '',
          section: photo.section || 'Uncategorized',
          userDescription: photo.description || ''
        };
        
        // Safely extract aiAnalysis if available
        if (photo.analysis || photo.aiAnalysis) {
          const analysis = photo.analysis || photo.aiAnalysis;
          sanitizedPhoto.aiAnalysis = {
            description: analysis.description || '',
            tags: Array.isArray(analysis.tags) ? analysis.tags : [],
            damageDetected: analysis.damageDetected || false,
            confidence: analysis.confidence || 0,
            severity: normalizeSeverity(analysis.severity) // Normalize severity to valid enum value
          };
        }
        
        return sanitizedPhoto;
      });
    }
  }
  
  // Prepare the data for MongoDB by ensuring user and company are valid IDs
  const preparedData = {
    ...dataToSend,
    // Convert IDs to string format
    user: dataToSend.user ? String(dataToSend.user) : undefined,
    company: dataToSend.company ? String(dataToSend.company) : undefined
  };
  
  // Ensure recommendations is always a string
  if (preparedData.recommendations) {
    if (Array.isArray(preparedData.recommendations)) {
      preparedData.recommendations = preparedData.recommendations.join('\n\n');
    } else if (typeof preparedData.recommendations !== 'string') {
      preparedData.recommendations = String(preparedData.recommendations);
    }
  }
  
  // Make sure each photo has consistently named fields and valid severity values
  if (preparedData.photos && Array.isArray(preparedData.photos)) {
    preparedData.photos = preparedData.photos.map(photo => {
      // Ensure we're using consistent field names
      const normalizedPhoto = {
        ...photo,
        // Make sure we have an _id field
        _id: photo._id || photo.id || generateObjectId(),
        // Make sure we're using the right field names expected by the backend
        filename: photo.filename || photo.name,
        path: photo.path || photo.url || photo.preview || '',
        section: photo.section || 'Uncategorized',
        // Use userDescription as the field name for consistency with backend
        userDescription: photo.description || photo.userDescription || ''
      };
      
      // Normalize severity in aiAnalysis to ensure it matches backend enum
      if (normalizedPhoto.aiAnalysis && normalizedPhoto.aiAnalysis.severity) {
        normalizedPhoto.aiAnalysis.severity = normalizeSeverity(normalizedPhoto.aiAnalysis.severity);
      }
      
      return normalizedPhoto;
    });
  }
  
  // Log the sanitized data size for debugging
  const dataSize = JSON.stringify(preparedData).length;
  console.log(`Creating report, data size: ${dataSize} bytes`);
  
  // Warn about large data sizes
  if (dataSize > 5000000) { // 5MB
    console.warn('Report data is very large, consider optimizing the data size');
  }
  
  try {
    const response = await api.post('/api/reports', preparedData);
    console.log('Create response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error creating report:', error);
    
    // Enhanced error handling
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      
      // Check for specific error messages
      if (error.response.data && error.response.data.error) {
        const errorMsg = error.response.data.error;
        
        // Handle company-related errors
        if (errorMsg.includes('company')) {
          console.error('Company information error detected. User company:', preparedData.company);
          
          // If we get a company error but we're using a placeholder, show more specific message
          if (preparedData.company && preparedData.company.name === "[COMPANY NAME]") {
            throw new Error('Report created with placeholder company information. You may want to update your company profile in settings for better-looking reports.');
          } else if (!preparedData.company) {
            throw new Error('Missing company information. Please update your company profile in the settings.');
          } else {
            throw new Error(`Company error: ${errorMsg}. Your company ID is: ${preparedData.company}`);
          }
        }
        
        // Pass through the original error message
        throw new Error(errorMsg);
      }
    }
    
    throw error;
  }
};

/**
 * Get all reports for the current user
 * @returns {Promise} - The response from the API
 */
export const getReports = async () => {
  const response = await api.get('/api/reports');
  return response.data;
};

/**
 * Get a single report by ID
 * @param {string} id - The report ID
 * @returns {Promise} - The response from the API
 */
export const getReport = async (id) => {
  const response = await api.get(`/api/reports/${id}`);
  return response.data;
};

/**
 * Update a report
 * @param {string} id - The report ID
 * @param {Object} reportData - The updated report data
 * @returns {Promise} - The response from the API
 */
export const updateReport = async (id, reportData) => {
  if (!id) {
    console.error('Cannot update report: No ID provided');
    throw new Error('Report ID is required for updates');
  }

  // Create a sanitized version of the data
  let dataToSend;
  try {
    // Deep clone to avoid reference issues and catch circular references early
    dataToSend = JSON.parse(JSON.stringify(reportData));
  } catch (error) {
    console.error('Error during JSON stringify/parse (likely circular references):', error);
    
    // Manually sanitize the data instead
    dataToSend = {
      title: reportData.title,
      clientName: reportData.clientName,
      propertyAddress: reportData.propertyAddress ? { ...reportData.propertyAddress } : undefined,
      inspectionDate: reportData.inspectionDate,
      weather: reportData.weather ? { ...reportData.weather } : undefined,
      summary: reportData.summary,
      damages: reportData.damages ? 
        reportData.damages.map(damage => ({
          type: damage.type,
          severity: normalizeSeverity(damage.severity), // Normalize damage severity
          description: damage.description,
          affectedAreas: damage.affectedAreas
        })) : [],
      recommendations: reportData.recommendations,
      materials: reportData.materials,
      tags: Array.isArray(reportData.tags) ? [...reportData.tags] : []
    };
    
    // Safely process photos
    if (reportData.photos && Array.isArray(reportData.photos)) {
      dataToSend.photos = reportData.photos.map(photo => {
        const sanitizedPhoto = {
          // Ensure each photo has a valid _id
          _id: photo._id || photo.id || generateObjectId(),
          filename: photo.filename || photo.name,
          path: photo.path || photo.url || photo.preview || '',
          section: photo.section || 'Uncategorized',
          userDescription: photo.description || ''
        };
        
        // Safely extract aiAnalysis if available
        if (photo.analysis || photo.aiAnalysis) {
          const analysis = photo.analysis || photo.aiAnalysis;
          sanitizedPhoto.aiAnalysis = {
            description: analysis.description || '',
            tags: Array.isArray(analysis.tags) ? analysis.tags : [],
            damageDetected: analysis.damageDetected || false,
            confidence: analysis.confidence || 0,
            severity: normalizeSeverity(analysis.severity) // Normalize severity to valid enum value
          };
        }
        
        return sanitizedPhoto;
      });
    }
  }
  
  // Ensure we're keeping important fields even if they're not in the form
  const preparedData = {
    ...dataToSend,
    // Convert IDs to string format if they exist
    user: dataToSend.user ? String(dataToSend.user) : undefined,
    company: dataToSend.company ? String(dataToSend.company) : undefined
  };
  
  // Ensure recommendations is always a string
  if (preparedData.recommendations) {
    if (Array.isArray(preparedData.recommendations)) {
      preparedData.recommendations = preparedData.recommendations.join('\n\n');
    } else if (typeof preparedData.recommendations !== 'string') {
      preparedData.recommendations = String(preparedData.recommendations);
    }
  }
  
  // Make sure each photo has consistently named fields and valid severity values
  if (preparedData.photos && Array.isArray(preparedData.photos)) {
    preparedData.photos = preparedData.photos.map(photo => {
      // Ensure we're using consistent field names
      const normalizedPhoto = {
        ...photo,
        // Make sure we have an _id field
        _id: photo._id || photo.id || generateObjectId(),
        // Make sure we're using the right field names expected by the backend
        filename: photo.filename || photo.name,
        path: photo.path || photo.url || photo.preview || '',
        section: photo.section || 'Uncategorized',
        // Use userDescription as the field name for consistency with backend
        userDescription: photo.description || photo.userDescription || ''
      };
      
      // Normalize severity in aiAnalysis to ensure it matches backend enum
      if (normalizedPhoto.aiAnalysis && normalizedPhoto.aiAnalysis.severity) {
        normalizedPhoto.aiAnalysis.severity = normalizeSeverity(normalizedPhoto.aiAnalysis.severity);
      }
      
      return normalizedPhoto;
    });
  }
  
  // Log the sanitized data size for debugging
  const dataSize = JSON.stringify(preparedData).length;
  console.log(`Updating report with ID: ${id}, data size: ${dataSize} bytes`);
  
  // Break updates into chunks if necessary (for very large reports)
  if (dataSize > 5000000) { // 5MB
    console.warn('Report data is very large, consider optimizing the data size');
    // Could implement chunked updates here if needed
  }
  
  try {
    const response = await api.put(`/api/reports/${id}`, preparedData);
    console.log('Update response:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error updating report:', error);
    
    // Enhanced error handling
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      
      // Check for specific error messages
      if (error.response.data && error.response.data.error) {
        if (error.response.data.error.includes('size limit')) {
          throw new Error('Report data is too large. Try reducing the amount of photos or data before submitting.');
        }
        
        // Extract enum validation errors
        if (error.response.data.error.includes('not a valid enum value')) {
          console.error('Enum validation error detected:', error.response.data.error);
          throw new Error('Some fields contain invalid values. Please check severity levels or other dropdown fields.');
        }
      }
    }
    
    throw error;
  }
};

/**
 * Delete a report
 * @param {string} id - The report ID
 * @returns {Promise} - The response from the API
 */
export const deleteReport = async (id) => {
  const response = await api.delete(`/api/reports/${id}`);
  return response.data;
};

/**
 * Generate a PDF for a report
 * @param {string} id - The report ID
 * @returns {Promise} - The PDF data as an ArrayBuffer
 */
export const generateReportPdf = async (id) => {
  const response = await api.post(`/api/reports/${id}/generate-pdf`, {}, {
    responseType: 'arraybuffer' // Set response type to handle binary data
  });
  return response.data;
};

/**
 * Add photos to a report
 * @param {string} id - The report ID
 * @param {Array<File>} files - Array of photo files to upload
 * @param {Object} metadata - Additional metadata (section, description)
 * @returns {Promise} - The response from the API
 */
export const addPhotosToReport = async (id, files, metadata = {}) => {
  const formData = new FormData();
  
  files.forEach((file) => {
    formData.append('photos', file);
  });
  
  if (metadata.section) {
    formData.append('section', metadata.section);
  }
  
  if (metadata.description) {
    formData.append('description', metadata.description);
  }

  const response = await api.post(`/api/reports/${id}/photos`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });

  return response.data;
};

/**
 * Generate AI summary from analyzed photos
 * @param {Array} photos - Array of photos with AI analysis data
 * @returns {Object} - Object containing generated summary and recommendations
 */
export const generateAISummary = async (photos) => {
  // Filter for photos that have analysis
  const analyzedPhotos = photos.filter(photo => photo.analysis && photo.analysis.description);
  
  if (analyzedPhotos.length === 0) {
    console.error('No analyzed photos found for summary generation');
    throw new Error('No analyzed photos found. Please analyze photos before generating a summary.');
  }
  
  console.log(`Sending ${analyzedPhotos.length} analyzed photos for summary generation`);
  
  try {
    // Ensure we're sending all necessary analysis fields
    const preparedPhotos = analyzedPhotos.map(photo => {
      // Make sure we have all required fields for the analysis
      const analysis = photo.analysis || {};
      
      return {
        id: photo.id,
        name: photo.name || 'Unnamed photo',
        analysis: {
          description: analysis.description || 'No description available',
          tags: analysis.tags || [],
          damageDetected: analysis.damageDetected || false,
          damageType: analysis.damageType || null,
          severity: analysis.severity || null,
          location: analysis.location || 'Unknown location',
          materials: analysis.materials || 'Not specified',
          recommendedAction: analysis.recommendedAction || 'No recommendations provided',
          confidenceScore: analysis.confidenceScore || 0
        }
      };
    });
    
    const response = await api.post('/api/reports/generate-summary', { photos: preparedPhotos });
    
    if (!response.data || !response.data.success) {
      throw new Error('Failed to generate summary: Invalid response from server');
    }
    
    console.log('Summary generated successfully:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error generating AI summary:', error);
    throw error;
  }
}; 