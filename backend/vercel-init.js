/**
 * Initialize server for Vercel deployment
 * - Sets up environment variables
 * - Creates necessary directories (with proper error handling for serverless)
 */

const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load env variables
dotenv.config();

// Mark that we're running in Vercel serverless environment
process.env.VERCEL = '1';

console.log('Vercel environment initialized successfully');

// Define fallbacks for important config variables
// In Vercel, we can't write to the filesystem, so we use these as placeholders
if (!process.env.TEMP_UPLOAD_DIR) {
  process.env.TEMP_UPLOAD_DIR = '/tmp'; // Use /tmp in Vercel (read-only but helps prevent errors)
}

if (!process.env.UPLOAD_DIR) {
  process.env.UPLOAD_DIR = '/tmp/uploads'; // Use /tmp in Vercel (read-only but helps prevent errors)
}

// Log important environment settings for debugging
console.log(`Environment: ${process.env.NODE_ENV}`);
console.log(`MongoDB URI set: ${process.env.MONGODB_URI ? 'Yes' : 'No'}`);
console.log(`JWT Secret set: ${process.env.JWT_SECRET ? 'Yes' : 'No'}`);

module.exports = { isVercel: true }; 