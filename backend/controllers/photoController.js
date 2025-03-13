const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs'); // Add regular fs module for sync operations
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const imageProcessor = require('../utils/imageProcessor');
const config = require('../config/config');
const photoAnalysisService = require('../services/photoAnalysisService');

/**
 * Upload and process a batch of photos
 * @route POST /api/photos/batch
 * @access Private
 */
const uploadBatchPhotos = async (req, res, next) => {
  try {
    // Check if files exist
    if (!req.files || req.files.length === 0) {
      logger.error('No files in request:', {
        headers: req.headers,
        files: req.files,
        body: req.body
      });
      throw new ApiError(400, 'Please upload at least one photo');
    }

    logger.info(`Processing ${req.files.length} uploaded files`);

    // Get file paths
    const filePaths = req.files.map(file => {
      logger.info(`Processing file: ${file.originalname}, saved as: ${file.filename}`);
      return path.join(file.destination, file.filename);
    });

    // Process images
    const processedImages = await Promise.all(filePaths.map(async (filePath, index) => {
      try {
        // Get original file info
        const originalFile = req.files[index];
        
        // Process image (resize, optimize)
        const optimizedPath = await imageProcessor.optimizeImage(filePath, {
          width: 1200,
          quality: 80,
          format: 'jpeg',
        });
        
        // Generate thumbnail
        const thumbnailPath = await imageProcessor.generateThumbnail(filePath, {
          width: 300,
          height: 300,
        });
        
        // Extract EXIF data if available
        let metadata = {};
        try {
          metadata = await imageProcessor.extractExifData(filePath);
        } catch (exifError) {
          logger.warn(`Could not extract EXIF data for ${filePath}: ${exifError.message}`);
        }
        
        // Create a more detailed response with URL paths
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const optimizedFilename = path.basename(optimizedPath);
        const thumbnailFilename = path.basename(thumbnailPath);
        
        logger.info(`Generated files for ${originalFile.originalname}:
          - Original: ${filePath}
          - Optimized: ${optimizedPath} (${optimizedFilename})
          - Thumbnail: ${thumbnailPath} (${thumbnailFilename})
        `);
        
        return {
          originalName: originalFile.originalname,
          filename: originalFile.filename,
          path: filePath,
          optimizedPath,
          thumbnailPath,
          optimizedFilename,
          thumbnailFilename,
          optimizedUrl: `${baseUrl}/api/photos/${optimizedFilename}`,
          thumbnailUrl: `${baseUrl}/api/photos/${thumbnailFilename}`,
          size: originalFile.size,
          mimetype: originalFile.mimetype,
          metadata
        };
      } catch (error) {
        logger.error(`Error processing image ${filePath}: ${error.message}`);
        return {
          originalName: req.files[index].originalname,
          filename: req.files[index].filename,
          path: filePath,
          error: error.message
        };
      }
    }));

    logger.info(`Successfully processed ${processedImages.length} images`);

    res.status(200).json({
      success: true,
      count: processedImages.length,
      data: processedImages,
    });
  } catch (error) {
    logger.error(`Error in uploadBatchPhotos: ${error.message}`);
    next(error);
  }
};

/**
 * Upload and process a single photo
 * @route POST /api/photos/single
 * @access Private
 */
const uploadSinglePhoto = async (req, res, next) => {
  try {
    // Check if file exists
    if (!req.file) {
      throw new ApiError(400, 'Please upload a photo');
    }

    // Get file path
    const filePath = path.join(req.file.destination, req.file.filename);

    // Process image
    const optimizedPath = await imageProcessor.optimizeImage(filePath, {
      width: 1200,
      quality: 80,
      format: 'jpeg',
    });

    // Generate thumbnail
    const thumbnailPath = await imageProcessor.generateThumbnail(filePath, {
      width: 300,
      height: 300,
    });

    // Extract EXIF data
    const exifData = await imageProcessor.extractExifData(filePath);

    res.status(200).json({
      success: true,
      data: {
        original: filePath,
        optimized: optimizedPath,
        thumbnail: thumbnailPath,
        metadata: exifData,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Analyze a photo using AI with specialized roofing inspection system prompt
 * @route POST /api/photos/analyze/:filename
 * @access Private
 */
const analyzePhoto = async (req, res, next) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent directory traversal
    if (!filename || filename.includes('..') || filename.includes('/')) {
      throw new ApiError(400, 'Invalid filename');
    }

    const filePath = path.join(config.tempUploadDir, filename);
    
    try {
      // Check if file exists
      await fs.access(filePath);
      
      logger.info(`Starting AI analysis for photo: ${filename}`);
      
      // Analyze the photo using the specialized roofing inspection system prompt
      const analysis = await photoAnalysisService.analyzePhoto(filePath);
      
      logger.info(`Successfully analyzed photo ${filename}: ${analysis.damageDetected ? 'Damage detected' : 'No damage detected'}`);
      
      res.status(200).json({
        success: true,
        data: analysis,
      });
    } catch (error) {
      logger.error(`AI analysis failed for photo ${filename}: ${error.message}`);
      
      // File doesn't exist or analysis failed
      if (error.message.includes('ENOENT')) {
        throw new ApiError(404, `Photo file not found: ${filename}`);
      } else if (error.message.includes('OpenAI')) {
        throw new ApiError(500, `AI service error: ${error.message}`);
      } else {
        throw new ApiError(500, `Failed to analyze photo: ${error.message}`);
      }
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Delete a temporary photo
 * @route DELETE /api/photos/:filename
 * @access Private
 */
const deletePhoto = async (req, res, next) => {
  try {
    const { filename } = req.params;
    
    // Validate filename to prevent directory traversal
    if (!filename || filename.includes('..') || filename.includes('/')) {
      throw new ApiError(400, 'Invalid filename');
    }

    const filePath = path.join(config.tempUploadDir, filename);
    
    try {
      // Check if file exists
      await fs.access(filePath);
      
      // Delete file
      await fs.unlink(filePath);
      
      res.status(200).json({
        success: true,
        message: 'Photo deleted successfully',
      });
    } catch (error) {
      // File doesn't exist
      throw new ApiError(404, 'Photo not found');
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Get a photo by filename
 * @route GET /api/photos/:filename
 * @access Public - but with security checks
 */
const getPhoto = async (req, res, next) => {
  try {
    const { filename } = req.params;
    logger.info(`Photo API request: GET /api/photos/${filename}`, {
      contentType: req.headers['content-type'],
      contentLength: req.headers['content-length']
    });
    
    // Basic security: Validate filename to prevent directory traversal
    if (!filename || filename.includes('..') || filename.includes('/')) {
      logger.error(`Security check failed for filename: ${filename}`);
      throw new ApiError(400, 'Invalid filename');
    }
    
    // Determine if we're looking for a thumbnail based on the filename
    const isThumbnailRequest = filename.includes('_thumb');
    logger.info(`This appears to be a ${isThumbnailRequest ? 'thumbnail' : 'regular image'} request`);
    
    // Get the absolute paths to the directories from config
    const tempDir = config.tempUploadDir;
    const uploadsDir = config.uploadDir;
    const cwdPath = process.cwd();
    
    logger.info(`Current working directory: ${cwdPath}`);
    logger.info(`Temp directory: ${tempDir}`);
    logger.info(`Uploads directory: ${uploadsDir}`);
    
    // Try multiple possible paths where the photo might be stored
    const possiblePaths = [
      // Main upload directories
      path.join(tempDir, filename),
      path.join(uploadsDir, filename),
      
      // Check optimized versions (if we're not looking for a thumb already)
      !isThumbnailRequest ? path.join(tempDir, filename.replace('.jpg', '_optimized.jpg').replace('.jpeg', '_optimized.jpeg')) : null,
      
      // Check thumbnail versions (if we're not looking for a thumb already)
      !isThumbnailRequest ? path.join(tempDir, filename.replace('.jpg', '_thumb.jpg').replace('.jpeg', '_thumb.jpeg')) : null,
      
      // Try original filename variations (if we're looking for a derived file)
      isThumbnailRequest ? path.join(tempDir, filename.replace('_thumb.jpg', '.jpg').replace('_thumb.jpeg', '.jpeg')) : null,
      filename.includes('_optimized') ? path.join(tempDir, filename.replace('_optimized.jpg', '.jpg').replace('_optimized.jpeg', '.jpeg')) : null,
      
      // Fallback to other locations relative to cwd
      path.join(cwdPath, 'temp', filename),
      path.join(cwdPath, 'uploads', filename),
      path.join('./backend/temp', filename),
      path.join('./backend/uploads', filename),
      
      // Public directory fallback
      path.join(cwdPath, 'public', 'uploads', filename)
    ].filter(Boolean); // Remove null entries
    
    // Log all possible paths we're going to check
    logger.info(`Will check the following paths for ${filename}:`, possiblePaths);
    
    // Find the first path that exists
    let foundPath = null;
    let checkedPaths = [];
    
    for (const testPath of possiblePaths) {
      try {
        logger.info(`Checking path: ${testPath}`);
        // Track all checked paths for debugging
        checkedPaths.push({
          path: testPath,
          exists: fsSync.existsSync(testPath),
          isDirectory: fsSync.existsSync(testPath) ? fsSync.statSync(testPath).isDirectory() : false
        });
        
        if (fsSync.existsSync(testPath) && !fsSync.statSync(testPath).isDirectory()) {
          foundPath = testPath;
          logger.info(`Found photo at: ${foundPath}`);
          break;
        }
      } catch (err) {
        logger.warn(`Error checking path ${testPath}: ${err.message}`);
        checkedPaths.push({
          path: testPath,
          error: err.message
        });
      }
    }
    
    if (foundPath) {
      // Determine content type based on file extension
      const ext = path.extname(foundPath).toLowerCase();
      let contentType = 'application/octet-stream'; // Default
      
      if (ext === '.jpg' || ext === '.jpeg') {
        contentType = 'image/jpeg';
      } else if (ext === '.png') {
        contentType = 'image/png';
      } else if (ext === '.heic') {
        contentType = 'image/heic';
      }
      
      // Add cache control headers for better performance
      res.set({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
        'ETag': require('crypto').createHash('md5').update(filename).digest('hex')
      });
      
      // Stream the file to the response
      try {
        logger.info(`Preparing to stream photo from: ${foundPath}`);
        const stream = fsSync.createReadStream(foundPath);
        
        // Add explicit error handling for the stream
        stream.on('error', (err) => {
          logger.error(`Error streaming photo: ${err.message}, Stack: ${err.stack}`);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              error: `Error serving image: ${err.message}`
            });
          }
        });
        
        // Add finish event handler to confirm successful streaming
        stream.on('end', () => {
          logger.info(`Successfully streamed photo: ${filename}`);
        });
        
        stream.pipe(res);
      } catch (streamError) {
        logger.error(`Exception when creating stream: ${streamError.message}, Stack: ${streamError.stack}`);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: `Failed to create stream: ${streamError.message}`
          });
        }
      }
    } else {
      // Log more details when photo is not found
      logger.error(`Photo not found: ${filename}`);
      logger.error(`Checked paths: ${JSON.stringify(checkedPaths)}`);
      
      // Log available photos in temp directory for debugging
      try {
        const tempFiles = fsSync.readdirSync(config.tempUploadDir);
        logger.info(`Available files in temp directory: ${JSON.stringify(tempFiles.slice(0, 10))}${tempFiles.length > 10 ? ` (and ${tempFiles.length - 10} more)` : ''}`);
        
        const uploadFiles = fsSync.readdirSync(config.uploadDir);
        logger.info(`Available files in uploads directory: ${JSON.stringify(uploadFiles.slice(0, 10))}${uploadFiles.length > 10 ? ` (and ${uploadFiles.length - 10} more)` : ''}`);
      } catch (err) {
        logger.warn(`Error reading directories: ${err.message}`);
      }
      
      throw new ApiError(404, 'Photo not found');
    }
  }
  catch (error) {
    next(error);
  }
};

// Export all the controllers
module.exports = {
  uploadBatchPhotos,
  uploadSinglePhoto,
  analyzePhoto,
  deletePhoto,
  getPhoto
}; 