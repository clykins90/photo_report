const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

// Define temp upload directory
const tempUploadDir = process.env.TEMP_UPLOAD_DIR || path.join(__dirname, '../temp');
// Define permanent upload directory
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');

// Only create directories in non-production environments or if specifically configured
const isVercel = process.env.VERCEL === '1';
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
}; 