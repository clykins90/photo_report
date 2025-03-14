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
      serverSelectionTimeoutMS: 5000, // Reduce the timeout for faster failures
      socketTimeoutMS: 45000, // Keep socket alive longer
      maxPoolSize: 10, // Limit the number of connections
      minPoolSize: 1, // Maintain at least one connection
      connectTimeoutMS: 10000, // Connection timeout
      retryWrites: true,
      retryReads: true,
    };

    // Connect to MongoDB
    const conn = await mongoose.connect(process.env.MONGODB_URI, options);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
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