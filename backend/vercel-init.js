/**
 * Initialize server for Vercel deployment
 * - Sets up environment variables
 * - Marks the environment as Vercel
 */

const dotenv = require('dotenv');

// Load env variables
dotenv.config();

// Mark that we're running in Vercel serverless environment
process.env.VERCEL = '1';

console.log('Vercel environment initialized successfully');

// Log important environment settings for debugging
console.log(`Environment: ${process.env.NODE_ENV}`);
console.log(`MongoDB URI set: ${process.env.MONGODB_URI ? 'Yes' : 'No'}`);
console.log(`JWT Secret set: ${process.env.JWT_SECRET ? 'Yes' : 'No'}`);

module.exports = { isVercel: true }; 