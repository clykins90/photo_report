// This file is the entry point for Vercel's serverless function
// It imports the Express app from the backend and forwards all requests to it

// Import the Express app from the backend
const app = require('../backend/server.js');

// Export a handler function that Vercel will use as the serverless function
module.exports = (req, res) => {
  // Log the incoming request for debugging
  console.log(`API Request: ${req.method} ${req.url}`);
  
  // Forward the request to the Express app
  return app(req, res);
}; 