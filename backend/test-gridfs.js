const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const gridfs = require('./utils/gridfs');

// Load environment variables
dotenv.config();

// Test file paths
const TEST_IMAGE_PATH = path.join(__dirname, 'test-image.jpg');
const TEST_PDF_PATH = path.join(__dirname, 'test-pdf.pdf');
const TEST_TEXT_PATH = path.join(__dirname, 'test-text.txt');
const DOWNLOAD_PATH = path.join(__dirname, 'temp', 'download-test');

// Create test files if they don't exist
async function createTestFiles() {
  // Create test directories
  if (!fs.existsSync(path.join(__dirname, 'temp'))) {
    fs.mkdirSync(path.join(__dirname, 'temp'), { recursive: true });
  }
  
  if (!fs.existsSync(DOWNLOAD_PATH)) {
    fs.mkdirSync(DOWNLOAD_PATH, { recursive: true });
  }
  
  // Create a simple text file for testing
  if (!fs.existsSync(TEST_TEXT_PATH)) {
    console.log('Creating test text file...');
    fs.writeFileSync(TEST_TEXT_PATH, 'This is a test file for GridFS testing.');
    console.log('Test text file created.');
  }
  
  // For image and PDF, check if files already exist in the test or public directories
  const testImage = 
    fs.existsSync(TEST_IMAGE_PATH) ? TEST_IMAGE_PATH : 
    fs.existsSync(path.join(__dirname, 'public/logos/default.png')) ? 
    path.join(__dirname, 'public/logos/default.png') : null;
    
  const testPdf = 
    fs.existsSync(TEST_PDF_PATH) ? TEST_PDF_PATH :
    fs.existsSync(path.join(__dirname, 'temp/pdfs/sample.pdf')) ? 
    path.join(__dirname, 'temp/pdfs/sample.pdf') : null;
  
  if (!testImage) {
    console.log('No test image found. Using text file for testing instead.');
  }
  
  if (!testPdf) {
    console.log('No test PDF found. Using text file for testing instead.');
  }
  
  return {
    textFilePath: TEST_TEXT_PATH,
    imageFilePath: testImage,
    pdfFilePath: testPdf
  };
}

// Run tests
async function runTests() {
  try {
    console.log('Starting GridFS tests...');
    
    // Create test files
    const testFiles = await createTestFiles();
    
    // Connect to database
    const conn = await connectDB();
    console.log('Database connected.');
    
    // Initialize GridFS
    const bucket = gridfs.initGridFS();
    console.log('GridFS initialized:', bucket ? 'Success' : 'Failed');
    
    if (!bucket) {
      throw new Error('GridFS bucket not initialized');
    }
    
    console.log('\n--- UPLOAD TESTS ---');
    
    // Text file test
    console.log('\nTest 1: Uploading text file...');
    const textFile = await gridfs.uploadFile(testFiles.textFilePath, {
      filename: 'test-text.txt',
      contentType: 'text/plain',
      metadata: {
        test: true,
        fileType: 'text'
      }
    });
    console.log('Text file uploaded successfully:', textFile);
    
    let imageFile = null;
    let pdfFile = null;
    
    // Upload image if available
    if (testFiles.imageFilePath) {
      console.log('\nTest 2: Uploading image...');
      imageFile = await gridfs.uploadFile(testFiles.imageFilePath, {
        filename: path.basename(testFiles.imageFilePath),
        contentType: 'image/jpeg',
        metadata: {
          test: true,
          fileType: 'image'
        }
      });
      console.log('Image uploaded successfully:', imageFile);
    }
    
    // Upload PDF if available
    if (testFiles.pdfFilePath) {
      console.log('\nTest 3: Uploading PDF...');
      pdfFile = await gridfs.uploadFile(testFiles.pdfFilePath, {
        filename: path.basename(testFiles.pdfFilePath),
        contentType: 'application/pdf',
        metadata: {
          test: true,
          fileType: 'pdf'
        }
      });
      console.log('PDF uploaded successfully:', pdfFile);
    }
    
    console.log('\n--- RETRIEVAL TESTS ---');
    
    // Test: Get file info
    console.log('\nTest 4: Getting file info...');
    const fileInfo = await gridfs.getFileInfo(textFile.id);
    console.log('Text file info:', fileInfo);
    
    // Test: Find files
    console.log('\nTest 5: Finding files with metadata...');
    const testFilesResult = await gridfs.findFiles({ 'metadata.test': true });
    console.log(`Found ${testFilesResult.length} test files:`, testFilesResult.map(f => f.filename));
    
    // Test: Download file
    console.log('\nTest 6: Downloading files...');
    const textDownloadPath = path.join(DOWNLOAD_PATH, 'downloaded-text.txt');
    await gridfs.downloadFile(textFile.id, { destination: textDownloadPath });
    console.log(`Text file downloaded to ${textDownloadPath}`);
    
    if (imageFile) {
      const imageDownloadPath = path.join(DOWNLOAD_PATH, 'downloaded-image.jpg');
      await gridfs.downloadFile(imageFile.id, { destination: imageDownloadPath });
      console.log(`Image downloaded to ${imageDownloadPath}`);
    }
    
    if (pdfFile) {
      const pdfDownloadPath = path.join(DOWNLOAD_PATH, 'downloaded-pdf.pdf');
      await gridfs.downloadFile(pdfFile.id, { destination: pdfDownloadPath });
      console.log(`PDF downloaded to ${pdfDownloadPath}`);
    }
    
    console.log('\n--- CLEANUP TESTS ---');
    
    // Test: Delete files
    console.log('\nTest 7: Deleting files...');
    await gridfs.deleteFile(textFile.id);
    console.log(`Text file ${textFile.id} deleted.`);
    
    if (imageFile) {
      await gridfs.deleteFile(imageFile.id);
      console.log(`Image file ${imageFile.id} deleted.`);
    }
    
    if (pdfFile) {
      await gridfs.deleteFile(pdfFile.id);
      console.log(`PDF file ${pdfFile.id} deleted.`);
    }
    
    // Final check
    const remainingFiles = await gridfs.findFiles({ 'metadata.test': true });
    console.log(`Remaining test files: ${remainingFiles.length}`);
    
    console.log('\nAll tests completed successfully!');
  } catch (error) {
    console.error('Error running tests:', error);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('Database connection closed.');
  }
}

// Run the tests
runTests(); 