// This file is the entry point for Vercel's serverless function
// It imports the Express app from the backend and forwards all requests to it

// Import the Express app from the backend
const app = require('../backend/server.js');

// Export a handler function that Vercel will use as the serverless function
module.exports = (req, res) => {
  // Log the incoming request for debugging
  console.log(`API Request: ${req.method} ${req.url}`);
  
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
  
  // Forward the request to the Express app
  return app(req, res);
}; 