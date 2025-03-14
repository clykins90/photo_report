// This file is the entry point for Vercel's serverless function
// It imports the Express app from the backend and forwards all requests to it

// Import the Express app from the backend
const app = require('../backend/server.js');
const mongoose = require('mongoose');
const connectDB = require('../backend/config/db');
const gridfs = require('../backend/utils/gridfs');
const logger = require('../backend/utils/logger');

// Track if we've already initialized the database connection
let dbInitialized = false;

// Export a handler function that Vercel will use as the serverless function
module.exports = async (req, res) => {
  // Log the incoming request for debugging
  console.log(`API Request - BaseURL: ${req.headers.host}, Path: ${req.url}`);
  
  // Force set environment variables for Vercel
  process.env.VERCEL = '1';
  process.env.USE_GRIDFS = 'true';
  
  // Check if this is a file request
  const isFileRequest = req.url.startsWith('/files/') || req.url.startsWith('/api/files/');
  
  if (isFileRequest) {
    logger.info(`API Request: ${req.method} ${req.url}, Path: ${req.url.split('?')[0]}, BaseUrl: ${req.url.split('/')[1]}`);
  }
  
  // Initialize database connection if not already done
  if (!dbInitialized || isFileRequest) {
    console.log(`Initializing database connection for Vercel serverless function (File request: ${isFileRequest})`);
    
    try {
      // Check MongoDB connection state
      const dbState = mongoose.connection.readyState;
      const dbStateText = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
      }[dbState] || 'unknown';
      
      console.log(`MongoDB connection state: ${dbStateText} (${dbState})`);
      
      // Connect to MongoDB if not already connected
      if (dbState !== 1) {
        // Connect to MongoDB
        await connectDB();
        console.log(`MongoDB Connected: ${mongoose.connection.host}`);
      }
      
      // Wait for connection to be fully established
      if (mongoose.connection.readyState !== 1) {
        console.log('Waiting for MongoDB connection to be fully established...');
        
        // Wait for connection to be ready
        await new Promise((resolve) => {
          // If already connected, resolve immediately
          if (mongoose.connection.readyState === 1) {
            return resolve();
          }
          
          // Otherwise wait for the connected event
          mongoose.connection.once('connected', () => {
            console.log('MongoDB connection established');
            resolve();
          });
          
          // Add a timeout to prevent hanging
          setTimeout(() => {
            console.log('MongoDB connection timeout - proceeding anyway');
            resolve();
          }, 5000);
        });
      }
      
      // Initialize GridFS
      const bucket = gridfs.initGridFS();
      if (bucket) {
        console.log('GridFS initialized successfully');
      } else {
        console.error('Failed to initialize GridFS');
      }
      
      dbInitialized = true;
    } catch (error) {
      console.error(`Error initializing database: ${error.message}`);
      
      // If this is a file request and we couldn't connect to the database, return an error
      if (isFileRequest) {
        return res.status(500).json({
          success: false,
          message: 'Database connection error',
          error: error.message
        });
      }
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
  }
  
  // Special handling for file requests to ensure GridFS is initialized
  if (isFileRequest) {
    // Extract the file ID from the URL
    const fileIdMatch = req.url.match(/\/files\/([^/?]+)/);
    if (fileIdMatch && fileIdMatch[1]) {
      const fileId = fileIdMatch[1];
      console.log(`Handling file request for ID: ${fileId}`);
      
      // Ensure GridFS is initialized
      try {
        const bucket = await gridfs.initGridFS(true); // Force initialization
        if (!bucket) {
          console.error('GridFS not initialized for file request');
          return res.status(500).json({
            success: false,
            message: 'GridFS not initialized',
            error: 'Database connection error'
          });
        }
      } catch (error) {
        console.error(`Error initializing GridFS: ${error.message}`);
        return res.status(500).json({
          success: false,
          message: 'Error initializing GridFS',
          error: error.message
        });
      }
    }
  }
  
  // Forward the request to the Express app
  return app(req, res);
}; 