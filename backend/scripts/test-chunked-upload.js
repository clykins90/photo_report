/**
 * Test script for chunked uploads
 * 
 * This script tests the chunked upload functionality by:
 * 1. Initializing a chunked upload
 * 2. Uploading chunks
 * 3. Completing the upload
 * 
 * Usage: node test-chunked-upload.js <reportId> <filePath>
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
  console.error('Usage: node test-chunked-upload.js <reportId> <filePath>');
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

console.log(`Testing chunked upload with file: ${fileName}`);
console.log(`File size: ${fileSize} bytes`);
console.log(`Chunk size: ${CHUNK_SIZE} bytes`);
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

// Function to initialize chunked upload
const initChunkedUpload = async () => {
  try {
    console.log('Initializing chunked upload...');
    const response = await axios.post(`${API_URL}/api/photos/upload-chunk/init`, {
      reportId,
      filename: fileName,
      contentType: getContentType(fileName),
      totalChunks
    });
    
    console.log('Chunked upload initialized:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error initializing chunked upload:', error.response?.data || error.message);
    throw error;
  }
};

// Function to upload a chunk
const uploadChunk = async (fileId, chunkIndex, chunkData) => {
  try {
    const formData = new FormData();
    formData.append('fileId', fileId);
    formData.append('chunkIndex', chunkIndex);
    formData.append('totalChunks', totalChunks);
    formData.append('chunk', chunkData, { filename: `chunk-${chunkIndex}`, contentType: 'application/octet-stream' });
    
    console.log(`Uploading chunk ${chunkIndex + 1}/${totalChunks}...`);
    
    const response = await axios.post(`${API_URL}/api/photos/upload-chunk`, formData, {
      headers: {
        ...formData.getHeaders()
      }
    });
    
    console.log(`Chunk ${chunkIndex + 1}/${totalChunks} uploaded:`, response.data);
    return response.data;
  } catch (error) {
    console.error(`Error uploading chunk ${chunkIndex + 1}:`, error.response?.data || error.message);
    throw error;
  }
};

// Function to complete chunked upload
const completeChunkedUpload = async (fileId) => {
  try {
    console.log('Completing chunked upload...');
    const response = await axios.post(`${API_URL}/api/photos/complete-upload`, {
      fileId,
      reportId
    });
    
    console.log('Chunked upload completed:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error completing chunked upload:', error.response?.data || error.message);
    throw error;
  }
};

// Main function to run the test
const runTest = async () => {
  try {
    // Initialize chunked upload
    const initResult = await initChunkedUpload();
    const fileId = initResult.fileId;
    
    // Upload chunks
    for (let i = 0; i < totalChunks; i++) {
      const start = i * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, fileSize);
      const chunkData = fileBuffer.slice(start, end);
      
      await uploadChunk(fileId, i, chunkData);
    }
    
    // Complete chunked upload
    await completeChunkedUpload(fileId);
    
    console.log('Test completed successfully!');
  } catch (error) {
    console.error('Test failed:', error.message);
  }
};

// Run the test
runTest(); 