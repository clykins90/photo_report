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

// Import routes
const authRoutes = require('./routes/authRoutes');
const companyRoutes = require('./routes/companyRoutes');
const reportRoutes = require('./routes/reportRoutes');
const photoRoutes = require('./routes/photoRoutes');

// Load environment variables
dotenv.config();

// Create Express app
const app = express();

// Set server timeout for large uploads
app.timeout = config.serverTimeout || 300000; // 5 minutes default

// Create temp directory if it doesn't exist
const tempDir = process.env.TEMP_UPLOAD_DIR || './temp';
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Create public directory if it doesn't exist
const publicDir = path.join(process.cwd(), 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
  
  // Create logos subdirectory
  const logosDir = path.join(publicDir, 'logos');
  if (!fs.existsSync(logosDir)) {
    fs.mkdirSync(logosDir, { recursive: true });
  }
  
  logger.info(`Created public directories: ${publicDir}, ${logosDir}`);
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
connectDB();

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/company', companyRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/photos', photoRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the Photo Report API' });
});

// REMOVE DUPLICATE STATIC DIRECTORIES - these were causing confusion
// with multiple ways to access the same files
// app.use('/temp', express.static(path.join(__dirname, 'temp')));
// app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// app.use('/public/uploads', express.static(path.join(__dirname, 'public', 'uploads')));

// Serve PDF files from temp/pdfs directory
app.use('/pdfs', (req, res, next) => {
  const pdfPath = path.join(__dirname, 'temp/pdfs', req.path);
  if (fs.existsSync(pdfPath) && !fs.statSync(pdfPath).isDirectory()) {
    next();
  } else {
    res.status(404).json({ success: false, message: 'PDF not found' });
  }
}, express.static(path.join(__dirname, 'temp/pdfs')));

// Error handling middleware
app.use(errorHandler);

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
}); 