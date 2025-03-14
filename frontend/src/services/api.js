import axios from 'axios';

// Determine the correct API base URL based on environment
const getBaseUrl = () => {
  const env = import.meta.env.MODE || 'development';
  const apiUrl = import.meta.env.VITE_API_URL;
  
  console.log(`Environment: ${env}, API URL from env: ${apiUrl}`);
  
  if (env === 'production') {
    // In production, use relative path (/api)
    return '/api';
  } else if (apiUrl) {
    // Use configured URL if available
    return apiUrl;
  } else {
    // Default for local development
    return 'http://localhost:5001';
  }
};

// Create an Axios instance with default config
const api = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
  // Increase timeout for large requests
  timeout: 60000, // 60 seconds
  // Increase max content size
  maxContentLength: 20 * 1024 * 1024, // 20MB
  maxBodyLength: 20 * 1024 * 1024, // 20MB
});

// Add a request interceptor to include auth token in requests
api.interceptors.request.use(
  (config) => {
    // Only log non-FormData requests or enable with a debug flag
    const isFormData = config.data instanceof FormData;
    const isPhotoUpload = config.url && config.url.includes('/photos/upload');
    
    // Reduce logging for photo uploads which can be verbose
    if (!isPhotoUpload || !isFormData) {
      console.log('API Request:', config.method.toUpperCase(), config.url);
    }
    
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      // Only log token application in non-photo upload requests
      if (!isPhotoUpload) {
        console.log('Auth token found and applied');
      }
    } else if (!isPhotoUpload) {
      console.log('No auth token found');
    }
    
    // Important: Let axios set the correct content-type for FormData
    if (isFormData) {
      delete config.headers['Content-Type'];
      
      // Only log this for non-photo uploads to reduce noise
      if (!isPhotoUpload) {
        console.log('FormData detected, letting Axios set Content-Type automatically');
      }
    }
    
    // Log request size for debugging large requests, but skip for photo uploads
    if (config.data && typeof config.data === 'object' && !isFormData && !isPhotoUpload) {
      try {
        const size = JSON.stringify(config.data).length;
        console.log(`Request payload size: ${size} bytes`);
        if (size > 5000000) { // 5MB
          console.warn('Very large request payload detected:', size, 'bytes');
        }
      } catch (error) {
        console.error('Could not stringify request data:', error);
      }
    }
    
    return config;
  },
  (error) => {
    console.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Add a response interceptor to handle common error patterns
api.interceptors.response.use(
  (response) => {
    // Reduce logging for photo uploads
    const isPhotoUpload = response.config.url.includes('/photos/upload');
    if (!isPhotoUpload) {
      console.log('API Response Success:', response.status, response.config.url);
    }
    return response;
  },
  (error) => {
    console.error('API Error:', error.message);
    
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
      
      if (error.response.status === 413) {
        console.error('Request entity too large - payload too big');
        // Create a more specific error
        const enhancedError = new Error('The data you are trying to send is too large. Try reducing the number of photos or the size of the report.');
        enhancedError.isPayloadTooLarge = true;
        enhancedError.response = error.response;
        return Promise.reject(enhancedError);
      }
      
      // Handle authentication errors
      if (error.response.status === 401) {
        // Only redirect to login if it's a token validation error
        // and not during a login/register request (which would also return 401 for invalid credentials)
        const isAuthEndpoint = 
          error.config.url.includes('/auth/login') || 
          error.config.url.includes('/auth/register');
        
        if (!isAuthEndpoint) {
          console.log('Authentication error, redirecting to login');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          // Only redirect if we're not already on the login page
          if (!window.location.pathname.includes('/login')) {
            window.location.href = '/login';
          }
        }
      }
    } else if (error.request) {
      console.error('No response received, request was:', error.request);
      
      // Check for request timeout
      if (error.code === 'ECONNABORTED') {
        console.error('Request timeout - the server took too long to respond');
      }
    }
    
    return Promise.reject(error);
  }
);

export default api; 