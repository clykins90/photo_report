// Initialize directories for Vercel's serverless environment
const fs = require('fs');
const path = require('path');

// Directories that need to exist
const dirs = [
  './temp',
  './temp/pdfs',
  './uploads',
  './public',
  './public/logos'
];

// Create all necessary directories
dirs.forEach(dir => {
  const fullPath = path.join(process.cwd(), dir);
  if (!fs.existsSync(fullPath)) {
    console.log(`Creating directory: ${fullPath}`);
    fs.mkdirSync(fullPath, { recursive: true });
  } else {
    console.log(`Directory already exists: ${fullPath}`);
  }
});

console.log('Vercel environment initialized successfully'); 