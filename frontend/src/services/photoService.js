import api from './api';

/**
 * Upload a single photo
 * @param {File} file - The photo file to upload
 * @returns {Promise} - The response from the API
 */
export const uploadSinglePhoto = async (file) => {
  const formData = new FormData();
  formData.append('photo', file);
  
  console.log('Uploading single photo with field name "photo":', file.name);

  // Let Axios handle the Content-Type automatically
  const response = await api.post('/api/photos/single', formData);

  return response.data;
};

/**
 * Upload multiple photos
 * @param {FormData|Array<File>} filesOrFormData - FormData object or array of photo files to upload
 * @returns {Promise} - The response from the API
 */
export const uploadBatchPhotos = async (filesOrFormData) => {
  let formData;
  
  // Check if the input is already a FormData object
  if (filesOrFormData instanceof FormData) {
    formData = filesOrFormData;
    console.log('Using existing FormData object');
  } else {
    // If it's an array of files, create a new FormData
    formData = new FormData();
    console.log('Created new FormData object');
    
    if (Array.isArray(filesOrFormData)) {
      filesOrFormData.forEach((file, index) => {
        console.log(`Adding file ${index + 1} to FormData with field name 'photos':`, file.name);
        formData.append('photos', file);
      });
    } else {
      throw new Error('Invalid input: expected FormData or array of files');
    }
  }

  try {
    // MORE DETAILED DEBUG LOGGING
    console.log('FormData object type:', Object.prototype.toString.call(formData));
    
    // Log the FormData contents for debugging
    console.log('Uploading files with FormData:');
    let fieldNames = new Set();
    for (const pair of formData.entries()) {
      console.log(`Field name: ${pair[0]}`);
      fieldNames.add(pair[0]);
      if (pair[1] instanceof File) {
        console.log(`Value: File object - ${pair[1].name} (${pair[1].type}, ${pair[1].size} bytes)`);
      } else {
        console.log(`Value: ${pair[1]}`);
      }
    }
    
    console.log('FormData field names:', Array.from(fieldNames));
    
    // Let Axios handle the Content-Type automatically for FormData
    // Don't set it explicitly, as this can interfere with the boundary parameter
    console.log('Making API request without explicit Content-Type');
    console.log('API endpoint:', '/api/photos/batch');
    
    const response = await api.post('/api/photos/batch', formData);
    console.log('API response status:', response.status);
    
    return response.data;
  } catch (error) {
    console.error('Error uploading photos:', error);
    
    // Provide more detailed error information
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error('Server response error:', error.response.data);
      throw new Error(error.response.data.error || 'Server error during upload');
    } else if (error.request) {
      // The request was made but no response was received
      console.error('No response received:', error.request);
      throw new Error('No response from server. Check your network connection.');
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Request setup error:', error.message);
      throw new Error(`Error setting up upload request: ${error.message}`);
    }
  }
};

/**
 * Analyze a photo using AI
 * @param {string} filename - The filename of the photo to analyze
 * @returns {Promise} - The response from the API
 */
export const analyzePhoto = async (filename) => {
  const response = await api.post(`/api/photos/analyze/${filename}`);
  return response.data;
};

/**
 * Delete a temporary photo
 * @param {string} filename - The filename of the photo to delete
 * @returns {Promise} - The response from the API
 */
export const deletePhoto = async (filename) => {
  const response = await api.delete(`/api/photos/${filename}`);
  return response.data;
}; 