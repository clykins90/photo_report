/**
 * Test script to compare regular and chunked uploads
 * 
 * This script tests both upload methods with the same file and reports timing and success
 * 
 * Usage: node compare-upload-methods.js <reportId> <filePath>
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:5001';
const CHUNK_SIZE = 500 * 1024; // 500KB chunks

// Get command line arguments
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node compare-upload-methods.js <reportId> <filePath>');
  process.exit(1);
}

const reportId = args[0];
const filePath = args[1];

// Validate file exists
if (!fs.existsSync(filePath)) {
  console.error(`File not found: ${filePath}`);
  process.exit(1);
}

// Get file info
const fileStats = fs.statSync(filePath);
const fileName = path.basename(filePath);
const fileSize = fileStats.size;
const totalChunks = Math.ceil(fileSize / CHUNK_SIZE);

console.log(`Comparing upload methods with file: ${fileName}`);
console.log(`File size: ${fileSize} bytes (${(fileSize / (1024 * 1024)).toFixed(2)} MB)`);
console.log(`Chunk size: ${CHUNK_SIZE} bytes (${(CHUNK_SIZE / 1024).toFixed(2)} KB)`);
console.log(`Total chunks: ${totalChunks}`);

// Read the file
const fileBuffer = fs.readFileSync(filePath);

// Function to get content type based on file extension
const getContentType = (filename) => {
  const ext = path.extname(filename).toLowerCase();
  const contentTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.heic': 'image/heic',
    '.heif': 'image/heif'
  };
  return contentTypes[ext] || 'application/octet-stream';
};

// Function to test regular upload
const testRegularUpload = async () => {
  try {
    console.log('\n--- Testing Regular Upload ---');
    const startTime = Date.now();
    
    const formData = new FormData();
    formData.append('reportId', reportId);
    formData.append('photos', fileBuffer, {
      filename: fileName,
      contentType: getContentType(fileName)
    });
    
    console.log('Uploading file...');
    
    const response = await axios.post(`${API_URL}/api/photos/upload`, formData, {
      headers: {
        ...formData.getHeaders()
      }
    });
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('Regular upload completed successfully');
    console.log(`Duration: ${duration.toFixed(2)} seconds`);
    console.log(`Upload speed: ${((fileSize / 1024 / 1024) / duration).toFixed(2)} MB/s`);
    
    return {
      success: true,
      duration,
      photo: response.data.photos[0]
    };
  } catch (error) {
    console.error('Regular upload failed:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
};

// Function to test chunked upload
const testChunkedUpload = async () => {
  try {
    console.log('\n--- Testing Chunked Upload ---');
    const startTime = Date.now();
    
    // Initialize chunked upload
    console.log('Initializing chunked upload...');
    const initResponse = await axios.post(`${API_URL}/api/photos/upload-chunk/init`, {
      reportId,
      filename: fileName,
      contentType: getContentType(fileName),
      totalChunks
    });
    
    const fileId = initResponse.data.fileId;
    console.log(`Chunked upload initialized with file ID: ${fileId}`);
    
    // Upload chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileSize);
      const chunkData = fileBuffer.slice(start, end);
      
      const formData = new FormData();
      formData.append('fileId', fileId);
      formData.append('chunkIndex', i);
      formData.append('totalChunks', totalChunks);
      formData.append('chunk', chunkData, { 
        filename: `chunk-${i}`, 
        contentType: 'application/octet-stream' 
      });
      
      console.log(`Uploading chunk ${i + 1}/${totalChunks}...`);
      
      await axios.post(`${API_URL}/api/photos/upload-chunk`, formData, {
        headers: {
          ...formData.getHeaders()
        }
      });
    }
    
    // Complete chunked upload
    console.log('Completing chunked upload...');
    const completeResponse = await axios.post(`${API_URL}/api/photos/complete-upload`, {
      fileId,
      reportId
    });
    
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    
    console.log('Chunked upload completed successfully');
    console.log(`Duration: ${duration.toFixed(2)} seconds`);
    console.log(`Upload speed: ${((fileSize / 1024 / 1024) / duration).toFixed(2)} MB/s`);
    
    return {
      success: true,
      duration,
      photo: completeResponse.data.photo
    };
  } catch (error) {
    console.error('Chunked upload failed:', error.response?.data || error.message);
    return {
      success: false,
      error: error.response?.data || error.message
    };
  }
};

// Main function to run the comparison
const runComparison = async () => {
  try {
    // Test regular upload
    const regularResult = await testRegularUpload();
    
    // Test chunked upload
    const chunkedResult = await testChunkedUpload();
    
    // Compare results
    console.log('\n--- Comparison Results ---');
    console.log(`Regular upload: ${regularResult.success ? 'Success' : 'Failed'}`);
    console.log(`Chunked upload: ${chunkedResult.success ? 'Success' : 'Failed'}`);
    
    if (regularResult.success && chunkedResult.success) {
      console.log(`Regular upload duration: ${regularResult.duration.toFixed(2)} seconds`);
      console.log(`Chunked upload duration: ${chunkedResult.duration.toFixed(2)} seconds`);
      
      const difference = regularResult.duration - chunkedResult.duration;
      const percentDifference = (difference / regularResult.duration) * 100;
      
      if (difference > 0) {
        console.log(`Chunked upload was ${difference.toFixed(2)} seconds faster (${percentDifference.toFixed(2)}% improvement)`);
      } else if (difference < 0) {
        console.log(`Regular upload was ${Math.abs(difference).toFixed(2)} seconds faster (${Math.abs(percentDifference).toFixed(2)}% improvement)`);
      } else {
        console.log('Both methods took the same amount of time');
      }
    }
    
    console.log('\nTest completed!');
  } catch (error) {
    console.error('Test failed:', error.message);
  }
};

// Run the comparison
runComparison(); 