const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

dotenv.config();

// Always use /tmp for temporary files to be compatible with Vercel
const tempUploadDir = '/tmp';
const uploadDir = '/tmp/uploads';

// Log the directories being used
console.log(`Using temp directory: ${tempUploadDir}`);
console.log(`Using uploads directory: ${uploadDir}`);

// Ensure uploads directory exists in non-Vercel environments
// In Vercel, we can't create directories outside of /tmp
if (process.env.VERCEL !== '1') {
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
  maxFileSize: 15 * 1024 * 1024, // 15MB
  serverTimeout: 300000, // 5 minutes for long uploads
  maxRequestSize: 150 * 1024 * 1024, // 150MB total request size
  allowedFileTypes: ['image/jpeg', 'image/png', 'image/jpg', 'image/heic'],
  isVercel: process.env.VERCEL === '1', // For backward compatibility
}; 