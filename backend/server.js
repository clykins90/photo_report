const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const config = require('./config/config');
const gridfs = require('./utils/gridfs');

// Run initialization (important for Vercel deployment)
require('./vercel-init');

// Import routes
const authRoutes = require('./routes/authRoutes');
const companyRoutes = require('./routes/companyRoutes');
const reportRoutes = require('./routes/reportRoutes');
const photoRoutes = require('./routes/photoRoutes');
const gridfsRoutes = require('./routes/gridfsRoutes');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Set server timeout for large uploads
app.timeout = config.serverTimeout || 300000; // 5 minutes default

// Create temp directory if it doesn't exist
const tempDir = process.env.TEMP_UPLOAD_DIR || './temp';
const isVercel = process.env.VERCEL === '1';
// Define publicDir at the top level so it's available throughout the file
const publicDir = path.join(process.cwd(), 'public');

// Only try to create directories in non-Vercel environments
if (!isVercel) {
  try {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
      console.log(`Created directory: ${tempDir}`);
    } else {
      console.log(`Directory already exists: ${tempDir}`);
    }
    
    // Create PDF directory
    const pdfDir = path.join(tempDir, 'pdfs');
    if (!fs.existsSync(pdfDir)) {
      fs.mkdirSync(pdfDir, { recursive: true });
      console.log(`Created directory: ${pdfDir}`);
    } else {
      console.log(`Directory already exists: ${pdfDir}`);
    }
    
    // Create uploads directory
    const uploadsDir = path.resolve(config.uploadDir);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
      console.log(`Created directory: ${uploadsDir}`);
    } else {
      console.log(`Directory already exists: ${uploadsDir}`);
    }
    
    // Create public directory if it doesn't exist
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
      
      // Create logos subdirectory
      const logosDir = path.join(publicDir, 'logos');
      if (!fs.existsSync(logosDir)) {
        fs.mkdirSync(logosDir, { recursive: true });
      }
      
      logger.info(`Created public directories: ${publicDir}, ${logosDir}`);
    }
  } catch (error) {
    logger.warn(`Warning: Could not create directories: ${error.message}`);
  }
} else {
  logger.info('Running in Vercel environment, skipping directory creation');
}

// Middleware
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'blob:', '*'],
    },
  },
})); // Security headers
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', '*'],
  credentials: true,
  exposedHeaders: ['Content-Disposition']
})); // Enable CORS

// Configure body parser for larger payloads
app.use(express.json({ limit: config.maxRequestSize || '50mb' }));
app.use(express.urlencoded({ 
  extended: true, 
  limit: config.maxRequestSize || '50mb' 
}));

app.use(morgan('dev')); // HTTP request logger

// Serve files from temp directory - allows direct browser access
// Use 404 handler to avoid infinite loops on missing files
app.use('/temp', (req, res, next) => {
  const requestedPath = path.join(config.tempUploadDir, req.path);
  if (fs.existsSync(requestedPath) && !fs.statSync(requestedPath).isDirectory()) {
    next(); // File exists, continue to static middleware
  } else {
    logger.info(`File not found at ${requestedPath}, sending 404 to prevent retries`);
    res.status(404).json({ success: false, message: 'File not found' });
  }
}, express.static(path.resolve(config.tempUploadDir), {
  setHeaders: (res) => {
    res.set('Cache-Control', 'public, max-age=86400');
  }
}));

// Serve files from uploads directory
app.use('/uploads', (req, res, next) => {
  const requestedPath = path.join(config.uploadDir, req.path);
  if (fs.existsSync(requestedPath) && !fs.statSync(requestedPath).isDirectory()) {
    next(); // File exists, continue to static middleware
  } else {
    logger.info(`File not found at ${requestedPath}, sending 404 to prevent retries`);
    res.status(404).json({ success: false, message: 'File not found' });
  }
}, express.static(path.resolve(config.uploadDir), {
  setHeaders: (res) => {
    res.set('Cache-Control', 'public, max-age=86400');
  }
}));

// Serve files from public directory (for company logos, etc.)
app.use('/logos', (req, res, next) => {
  const requestedPath = path.join(publicDir, 'logos', req.path);
  if (fs.existsSync(requestedPath) && !fs.statSync(requestedPath).isDirectory()) {
    next(); // File exists, continue to static middleware
  } else {
    logger.info(`Logo not found at ${requestedPath}, sending 404`);
    res.status(404).json({ success: false, message: 'Logo not found' });
  }
}, express.static(path.join(publicDir, 'logos'), {
  setHeaders: (res) => {
    res.set('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
  }
}));

// Connect to database
connectDB().then(() => {
  // Initialize GridFS after database connection
  gridfs.initGridFS();
  logger.info('GridFS initialized');
});

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/files', gridfsRoutes); // New GridFS routes

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Photo Report API' });
});

// REMOVE DUPLICATE STATIC DIRECTORIES - these were causing confusion
// with multiple ways to access the same files
// app.use('/temp', express.static(path.join(__dirname, 'temp')));
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// app.use('/public/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Serve PDF files from temp/pdfs directory or GridFS in Vercel
app.use('/pdfs', (req, res, next) => {
  const isVercel = process.env.VERCEL === '1';
  
  if (isVercel) {
    // In Vercel, we should check GridFS for PDFs
    const pdfFilename = req.path.replace('/', ''); // Remove leading slash
    
    // If there's no filename, return 404
    if (!pdfFilename) {
      return res.status(404).json({ success: false, message: 'PDF not found' });
    }
    
    // Try to find the PDF in GridFS
    const gridfs = require('./utils/gridfs');
    gridfs.findFiles({ filename: pdfFilename })
      .then(files => {
        if (files && files.length > 0) {
          // Found the PDF in GridFS, stream it to the response
          gridfs.streamToResponse(files[0]._id, res, {
            contentType: 'application/pdf',
            disposition: 'inline',
            filename: pdfFilename
          });
        } else {
          // PDF not found in GridFS
          res.status(404).json({ success: false, message: 'PDF not found in GridFS' });
        }
      })
      .catch(err => {
        logger.error(`Error serving PDF from GridFS: ${err.message}`);
        res.status(500).json({ success: false, message: 'Error serving PDF' });
      });
  } else {
    // In non-Vercel, use filesystem
    const pdfPath = path.join(__dirname, 'temp/pdfs', req.path);
    if (fs.existsSync(pdfPath) && !fs.statSync(pdfPath).isDirectory()) {
      next();
    } else {
      res.status(404).json({ success: false, message: 'PDF not found' });
    }
  }
}, express.static(path.join(__dirname, 'temp/pdfs')));

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
}); 