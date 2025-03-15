const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Load environment variables first, before any other imports
// Try to load from root .env.local first (which might take precedence)
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

// Force set USE_GRIDFS to true for testing
process.env.USE_GRIDFS = 'true';

console.log('Environment variables loaded:');
console.log('USE_GRIDFS =', process.env.USE_GRIDFS);
console.log('NODE_ENV =', process.env.NODE_ENV);
console.log('MONGODB_URI =', process.env.MONGODB_URI ? 'Set (value hidden)' : 'Not set');

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

// Create Express app
const app = express();

// Add verbose logging for debugging on Vercel
app.use((req, res, next) => {
  console.log(`Incoming request: ${req.method} ${req.originalUrl}`);
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  next();
});

// Set server timeout for large uploads
app.timeout = config.serverTimeout || 300000; // 5 minutes default

// Define publicDir at the top level so it's available throughout the file
const publicDir = path.join(process.cwd(), 'public');

// Only try to create directories in non-Vercel environments
if (process.env.VERCEL !== '1') {
  try {
    // Create temp directory if needed
    if (!fs.existsSync(config.tempUploadDir)) {
      fs.mkdirSync(config.tempUploadDir, { recursive: true });
      console.log(`Created directory: ${config.tempUploadDir}`);
    }
    
    // Create uploads directory if needed
    if (!fs.existsSync(config.uploadDir)) {
      fs.mkdirSync(config.uploadDir, { recursive: true });
      console.log(`Created directory: ${config.uploadDir}`);
    }
    
    // Create public directory if needed
    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
      console.log(`Created directory: ${publicDir}`);
    }
  } catch (err) {
    console.error(`Error creating directories: ${err.message}`);
  }
}

// Set security headers using Helmet
// Modify CSP for development environments
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

// Set up CORS - in production restrict to your domain
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://photo-report.vercel.app', 'https://photo-report-app.vercel.app'] 
    : '*',
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

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

// Serve placeholder image and other static assets from public directory
app.use(express.static(publicDir, {
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

// Mount routes - add handler to detect and log path patterns
const routeLogger = (req, res, next) => {
  logger.info(`API Request: ${req.method} ${req.path}`);
  next();
};

// Mount routes with proper prefixes
app.use('/api/auth', routeLogger, authRoutes);
app.use('/api/company', routeLogger, companyRoutes);
app.use('/api/reports', routeLogger, reportRoutes);
app.use('/api/photos', routeLogger, photoRoutes);
app.use('/api/files', routeLogger, gridfsRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Photo Report API' });
});

// Serve PDF files from GridFS
app.use('/pdfs', (req, res, next) => {
  const pdfFilename = req.path.replace('/', ''); // Remove leading slash
  
  // If there's no filename, return 404
  if (!pdfFilename) {
    return res.status(404).json({ success: false, message: 'PDF not found' });
  }
  
  // Try to find the PDF in GridFS pdf_report bucket
  const gridfs = require('./utils/gridfs');
  gridfs.findFiles({ filename: pdfFilename }, 'pdf_report')
    .then(files => {
      if (files && files.length > 0) {
        // Stream the PDF from GridFS pdf_report bucket
        return gridfs.streamPdfReport(files[0]._id, res);
      } else {
        // If not in pdf_report bucket, check the photos bucket (for backward compatibility)
        return gridfs.findFiles({ filename: pdfFilename }, 'photos')
          .then(photoFiles => {
            if (photoFiles && photoFiles.length > 0) {
              // Stream from photos bucket
              return gridfs.streamToResponse(photoFiles[0]._id, res, 'photos');
            } else {
              // If not in GridFS, check if it exists in the filesystem (for backward compatibility)
              const pdfPath = path.join(config.uploadDir, 'pdfs', pdfFilename);
              if (fs.existsSync(pdfPath)) {
                return res.sendFile(pdfPath);
              } else {
                return res.status(404).json({ success: false, message: 'PDF not found' });
              }
            }
          });
      }
    })
    .catch(err => {
      console.error(`Error serving PDF: ${err.message}`);
      return res.status(500).json({ success: false, message: 'Error serving PDF', error: err.message });
    });
});

// Add a catch-all route for Vercel to serve the frontend SPA
if (process.env.VERCEL === '1') {
  logger.info('Running in Vercel environment, adding SPA catch-all route');
  
  // In Vercel, the frontend is handled by the vercel.json configuration
  // This route is just a fallback to prevent 404 errors from the API
  app.get('*', (req, res) => {
    // Only handle non-API routes
    if (!req.path.startsWith('/api/')) {
      res.status(200).json({ 
        message: 'This route should be handled by Vercel routing configuration',
        path: req.path,
        note: 'If you see this response, check your vercel.json configuration'
      });
    } else {
      // For API routes that weren't matched, return 404
      res.status(404).json({ success: false, message: 'API endpoint not found' });
    }
  });
}

// Error handling middleware
app.use(errorHandler);

// Only start the server when this file is run directly (not imported)
if (require.main === module) {
  // Start server
  const PORT = process.env.PORT || 5001;
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
  
  // Set up scheduled cleanup for abandoned chunked uploads
  // Run every 30 minutes
  const CLEANUP_INTERVAL = 30 * 60 * 1000; // 30 minutes in milliseconds
  
  setInterval(async () => {
    try {
      const cleanedCount = await gridfs.cleanupChunkedUploads(60); // Clean uploads older than 60 minutes
      if (cleanedCount > 0) {
        logger.info(`Cleaned up ${cleanedCount} abandoned chunked upload sessions`);
      }
    } catch (error) {
      logger.error(`Error during chunked upload cleanup: ${error.message}`);
    }
  }, CLEANUP_INTERVAL);
  
  logger.info(`Scheduled chunked upload cleanup to run every ${CLEANUP_INTERVAL / 60000} minutes`);
}

// Export the Express app for serverless functions
module.exports = app; 