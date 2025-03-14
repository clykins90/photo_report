const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

// Check if we're running in Vercel environment
const isVercel = process.env.VERCEL === '1';

// Define temp upload directory - use /tmp in Vercel environment
const tempUploadDir = isVercel 
  ? '/tmp' 
  : (process.env.TEMP_UPLOAD_DIR || path.join(__dirname, '../temp'));

// Define permanent upload directory - use /tmp/uploads in Vercel environment
const uploadDir = isVercel 
  ? '/tmp/uploads' 
  : (process.env.UPLOAD_DIR || path.join(__dirname, '../uploads'));

// Log the directories being used
console.log(`Using temp directory: ${tempUploadDir} (Vercel: ${isVercel})`);
console.log(`Using uploads directory: ${uploadDir} (Vercel: ${isVercel})`);

// Only create directories in non-Vercel environments
if (!isVercel) {
  // Ensure temp directory exists
  if (!fs.existsSync(tempUploadDir)) {
    try {
      fs.mkdirSync(tempUploadDir, { recursive: true });
      console.log(`Created temporary upload directory: ${tempUploadDir}`);
    } catch (error) {
      console.warn(`Warning: Could not create temp directory: ${error.message}`);
    }
  }

  // Ensure uploads directory exists
  if (!fs.existsSync(uploadDir)) {
    try {
      fs.mkdirSync(uploadDir, { recursive: true });
      console.log(`Created permanent upload directory: ${uploadDir}`);
    } catch (error) {
      console.warn(`Warning: Could not create uploads directory: ${error.message}`);
    }
  }
} else {
  // In Vercel, we can't create directories, but we can use /tmp
  // Make sure GridFS is enabled
  process.env.USE_GRIDFS = 'true';
  console.log('Running in Vercel environment, forcing GridFS usage');
}

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiration: '1d',
  tempUploadDir,
  uploadDir,
  maxFileSize: 15 * 1024 * 1024, // Increased to 15MB
  serverTimeout: 300000, // 5 minutes for long uploads
  maxRequestSize: 150 * 1024 * 1024, // 150MB total request size
  allowedFileTypes: ['image/jpeg', 'image/png', 'image/jpg', 'image/heic'],
  isVercel, // Export isVercel flag for use in other modules
}; 