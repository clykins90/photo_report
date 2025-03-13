const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

// Define temp upload directory
const tempUploadDir = process.env.TEMP_UPLOAD_DIR || path.join(__dirname, '../temp');
// Define permanent upload directory
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '../uploads');

// Ensure temp directory exists
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
  console.log(`Created temporary upload directory: ${tempUploadDir}`);
}

// Ensure uploads directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log(`Created permanent upload directory: ${uploadDir}`);
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