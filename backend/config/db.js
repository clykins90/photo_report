const mongoose = require('mongoose');

// Cache the database connection
let cachedConnection = null;
let connectionPromise = null;

const connectDB = async () => {
  // If we already have a connection promise in progress, return it
  if (connectionPromise) {
    return connectionPromise;
  }
  
  // If we have a cached connection and it's connected, use it
  if (cachedConnection && mongoose.connection.readyState === 1) {
    console.log('Using cached database connection');
    return cachedConnection;
  }

  // Create a new connection promise
  connectionPromise = (async () => {
    try {
      // Set connection options optimized for serverless environments
      const options = {
        serverSelectionTimeoutMS: 5000, // Reduced from 10000
        socketTimeoutMS: 30000, // Reduced from 60000
        maxPoolSize: 5, // Reduced from 10
        minPoolSize: 1,
        connectTimeoutMS: 5000, // Reduced from 15000
        retryWrites: true,
        retryReads: true,
        // Add heartbeat to keep connection alive
        heartbeatFrequencyMS: 10000,
      };

      // Connect to MongoDB
      const conn = await mongoose.connect(process.env.MONGODB_URI, options);
      console.log(`MongoDB Connected: ${conn.connection.host}`);
      
      // Add event listeners for connection issues
      mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
        cachedConnection = null; // Reset cached connection on error
        connectionPromise = null;
      });
      
      mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB disconnected');
        cachedConnection = null; // Reset cached connection on disconnect
        connectionPromise = null;
      });
      
      // Cache the connection
      cachedConnection = conn;
      return conn;
    } catch (error) {
      console.error(`Error connecting to MongoDB: ${error.message}`);
      
      // Don't exit the process in serverless environments
      if (process.env.VERCEL !== '1') {
        process.exit(1);
      }
      
      // Clear the connection promise so we can try again
      connectionPromise = null;
      throw error; // Re-throw the error for proper handling
    }
  })();

  return connectionPromise;
};

module.exports = connectDB; 