const fs = require('fs');
const path = require('path');
const express = require('express');
const multer = require('multer');
const cors = require('cors');

// Create a simple Express app for testing
const app = express();
app.use(cors());
app.use(express.json());

// Create temp directory if it doesn't exist
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
  console.log(`Created temporary directory: ${tempDir}`);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    console.log(`Setting destination for file: ${file.originalname}`);
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const filename = uniqueSuffix + path.extname(file.originalname);
    console.log(`Generated filename: ${filename} for ${file.originalname}`);
    cb(null, filename);
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Middleware to log request details
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  console.log('Headers:', req.headers);
  next();
});

// Test route for multiple file upload with 'photos' field name
app.post('/test/photos', upload.array('photos', 20), (req, res) => {
  console.log('Batch file upload request received with "photos" field');
  console.log('Headers:', req.headers);
  
  if (!req.files || req.files.length === 0) {
    console.log('No files found in request');
    return res.status(400).json({ success: false, error: 'No files uploaded' });
  }
  
  console.log(`Received ${req.files.length} files`);
  req.files.forEach((file, index) => {
    console.log(`File ${index + 1}:`, file.originalname, file.mimetype, file.size);
  });
  
  res.json({
    success: true,
    count: req.files.length,
    files: req.files
  });
});

// Serve the test HTML page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'test-upload.html'));
});

// Start the server
const PORT = 5002;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT} in your browser to test uploads`);
}); 