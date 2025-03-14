const mongoose = require('mongoose');

// Cache the database connection
let cachedConnection = null;

const connectDB = async () => {
  // If we have a cached connection, use it
  if (cachedConnection) {
    console.log('Using cached database connection');
    return cachedConnection;
  }

  try {
    // Set connection options for better reliability in serverless environments
    const options = {
      serverSelectionTimeoutMS: 10000, // Increased timeout for server selection
      socketTimeoutMS: 60000, // Increased socket timeout
      maxPoolSize: 10, // Limit the number of connections
      minPoolSize: 1, // Maintain at least one connection
      connectTimeoutMS: 15000, // Increased connection timeout
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
    });
    
    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected, will try to reconnect');
      cachedConnection = null; // Reset cached connection on disconnect
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
    
    throw error; // Re-throw the error for proper handling
  }
};

module.exports = connectDB; 