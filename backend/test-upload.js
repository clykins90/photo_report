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
    cb(null, tempDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Test route for single file upload
app.post('/test/upload-single', upload.single('photo'), (req, res) => {
  console.log('Single file upload request received');
  console.log('Headers:', req.headers);
  
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }
  
  console.log('File received:', req.file);
  
  res.json({
    success: true,
    file: req.file
  });
});

// Test route for multiple file upload
app.post('/test/upload-batch', upload.array('photos', 20), (req, res) => {
  console.log('Batch file upload request received');
  console.log('Headers:', req.headers);
  
  if (!req.files || req.files.length === 0) {
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

// Start the server
const PORT = 5001;
app.listen(PORT, () => {
  console.log(`Test server running on port ${PORT}`);
  console.log(`Test single upload: http://localhost:${PORT}/test/upload-single`);
  console.log(`Test batch upload: http://localhost:${PORT}/test/upload-batch`);
}); 