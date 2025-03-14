// This file is the entry point for Vercel's serverless function
// It imports the Express app from the backend and forwards all requests to it

// Import the Express app from the backend
const app = require('../backend/server.js');
const mongoose = require('mongoose');
const connectDB = require('../backend/config/db');
const gridfs = require('../backend/utils/gridfs');

// Track if we've already initialized the database connection
let dbInitialized = false;

// Export a handler function that Vercel will use as the serverless function
module.exports = async (req, res) => {
  // Log the incoming request for debugging
  console.log(`API Request - BaseURL: ${req.headers.host}, Path: ${req.url}`);
  
  // Initialize database connection if not already done
  if (!dbInitialized) {
    console.log('Initializing database connection for Vercel serverless function');
    
    // Force set environment variables for Vercel
    process.env.VERCEL = '1';
    process.env.USE_GRIDFS = 'true';
    
    try {
      // Connect to MongoDB
      await connectDB();
      console.log(`MongoDB Connected: ${mongoose.connection.host}`);
      
      // Initialize GridFS
      gridfs.initGridFS();
      console.log('GridFS initialized');
      
      dbInitialized = true;
    } catch (error) {
      console.error(`Error initializing database: ${error.message}`);
    }
  }
  
  // Remove duplicate /api prefix to prevent routing issues
  if (req.url.startsWith('/api/')) {
    req.url = req.url.replace('/api', '');
    console.log(`Modified URL to prevent duplicate /api path: ${req.url}`);
  }
  
  // Handle special characters in URLs
  // Decode URL components to handle paths with special characters
  req.url = decodeURIComponent(req.url);
  
  // Remove any leading ./ from paths
  if (req.url.includes('./')) {
    req.url = req.url.replace(/\.\//g, '');
    console.log(`Removed ./ from URL: ${req.url}`);
  }
  
  // Special handling for photo URLs with numeric filenames
  if (req.url.match(/\/photos\/\d+\.\w+/)) {
    console.log(`Detected numeric filename in photo URL: ${req.url}`);
    
    // Add environment variable to indicate we're running on Vercel
    process.env.VERCEL = '1';
    
    // Force GridFS usage on Vercel
    process.env.USE_GRIDFS = 'true';
  }
  
  // Forward the request to the Express app
  return app(req, res);
}; 