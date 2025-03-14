const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load environment variables
const rootEnvPath = path.resolve(__dirname, '../.env.local');
const backendEnvPath = path.resolve(__dirname, '.env');

console.log('Checking for .env files:');
console.log(`Root .env.local exists: ${fs.existsSync(rootEnvPath)}`);
console.log(`Backend .env exists: ${fs.existsSync(backendEnvPath)}`);

// Load both files to ensure all variables are set
if (fs.existsSync(rootEnvPath)) {
  console.log('Loading environment variables from root .env.local');
  dotenv.config({ path: rootEnvPath });
}

if (fs.existsSync(backendEnvPath)) {
  console.log('Loading environment variables from backend .env');
  dotenv.config({ path: backendEnvPath });
}

// Use direct connection string
const directConnectionString = 'mongodb://courtlykins:cJjgW16c1YiBJesW@cluster0-shard-00-00.08yto.mongodb.net:27017,cluster0-shard-00-01.08yto.mongodb.net:27017,cluster0-shard-00-02.08yto.mongodb.net:27017/photo-report-app?ssl=true&replicaSet=atlas-ywvxvl-shard-0&authSource=admin&retryWrites=true&w=majority&appName=Cluster0';

console.log('Using direct connection string instead of environment variable');

// Test connection
async function testConnection() {
  try {
    console.log('Attempting to connect to MongoDB...');
    
    // Set connection options
    const options = {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 1,
      connectTimeoutMS: 10000,
      retryWrites: true,
      retryReads: true,
    };
    
    // Connect to MongoDB using direct connection string
    const conn = await mongoose.connect(directConnectionString, options);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    
    // Close the connection
    await mongoose.connection.close();
    console.log('Connection closed successfully');
  } catch (error) {
    console.error(`Error connecting to MongoDB: ${error.message}`);
    console.error('Full error:', error);
  }
}

testConnection(); 