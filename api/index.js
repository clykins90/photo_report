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
  console.log(`API Request - Host: ${req.headers.host}, Path: ${req.url}`);
  
  // Force set environment variables for Vercel
  process.env.VERCEL = '1';
  process.env.USE_GRIDFS = 'true';
  
  // Check if this is a file request
  const isFileRequest = req.url.startsWith('/files/') || req.url.startsWith('/api/files/');
  
  if (isFileRequest) {
    logger.info(`File Request: ${req.method} ${req.url}`);
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
        // Connect to MongoDB with a shorter timeout
        await connectDB();
        console.log(`MongoDB Connected: ${mongoose.connection.host}`);
      }
      
      // Wait for connection to be fully established with a shorter timeout
      if (mongoose.connection.readyState !== 1) {
        console.log('Waiting for MongoDB connection to be fully established...');
        
        // Wait for connection to be ready with a shorter timeout
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
          
          // Add a timeout to prevent hanging - reduced to 5 seconds
          setTimeout(() => {
            console.log('MongoDB connection timeout - proceeding anyway');
            resolve();
          }, 5000);
        });
      }
      
      // Initialize GridFS only if needed
      if (isFileRequest || req.url.includes('/photos')) {
        const bucket = await gridfs.initGridFS();
        if (bucket) {
          console.log('GridFS initialized successfully');
        } else {
          console.error('Failed to initialize GridFS');
        }
      }
      
      dbInitialized = true;
    } catch (error) {
      console.error(`Error initializing database: ${error.message}`);
      // Continue anyway to avoid blocking the request
    }
  }
  
  // Forward the request to the Express app
  return app(req, res);
}; 