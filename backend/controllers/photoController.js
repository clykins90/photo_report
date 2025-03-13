const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs'); // Add regular fs module for sync operations
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const imageProcessor = require('../utils/imageProcessor');
const config = require('../config/config');
const photoAnalysisService = require('../services/photoAnalysisService');
const gridfs = require('../utils/gridfs'); // Add GridFS utility

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
        
        // Upload original file to GridFS
        const originalGridFS = await gridfs.uploadFile(filePath, {
          filename: originalFile.filename,
          contentType: originalFile.mimetype,
          metadata: {
            originalName: originalFile.originalname,
            type: 'original',
            exif: metadata,
            userId: req.user?._id?.toString(),
          }
        });
        
        // Upload optimized file to GridFS
        const optimizedGridFS = await gridfs.uploadFile(optimizedPath, {
          filename: path.basename(optimizedPath),
          contentType: 'image/jpeg',
          metadata: {
            originalName: originalFile.originalname,
            type: 'optimized',
            exif: metadata,
            userId: req.user?._id?.toString(),
          }
        });
        
        // Upload thumbnail to GridFS
        const thumbnailGridFS = await gridfs.uploadFile(thumbnailPath, {
          filename: path.basename(thumbnailPath),
          contentType: 'image/jpeg',
          metadata: {
            originalName: originalFile.originalname,
            type: 'thumbnail',
            exif: metadata,
            userId: req.user?._id?.toString(),
          }
        });
        
        // Create a more detailed response with URL paths
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const optimizedFilename = path.basename(optimizedPath);
        const thumbnailFilename = path.basename(thumbnailPath);
        
        logger.info(`Generated files for ${originalFile.originalname}:
          - Original: ${filePath} -> GridFS ID: ${originalGridFS.id}
          - Optimized: ${optimizedPath} -> GridFS ID: ${optimizedGridFS.id}
          - Thumbnail: ${thumbnailPath} -> GridFS ID: ${thumbnailGridFS.id}
        `);
        
        // Clean up temporary files after uploading to GridFS
        try {
          await fs.unlink(filePath);
          await fs.unlink(optimizedPath);
          await fs.unlink(thumbnailPath);
          logger.info(`Deleted temporary files for ${originalFile.originalname}`);
        } catch (deleteError) {
          logger.warn(`Could not delete temporary files: ${deleteError.message}`);
        }
        
        return {
          originalName: originalFile.originalname,
          filename: originalFile.filename,
          gridfs: {
            original: originalGridFS.id,
            optimized: optimizedGridFS.id,
            thumbnail: thumbnailGridFS.id
          },
          optimizedFilename,
          thumbnailFilename,
          optimizedUrl: `${baseUrl}/api/files/${optimizedGridFS.id}`,
          thumbnailUrl: `${baseUrl}/api/files/${thumbnailGridFS.id}`,
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
    let exifData = {};
    try {
      exifData = await imageProcessor.extractExifData(filePath);
    } catch (exifError) {
      logger.warn(`Could not extract EXIF data for ${filePath}: ${exifError.message}`);
    }
    
    // Upload original file to GridFS
    const originalGridFS = await gridfs.uploadFile(filePath, {
      filename: req.file.filename,
      contentType: req.file.mimetype,
      metadata: {
        originalName: req.file.originalname,
        type: 'original',
        exif: exifData,
        userId: req.user?._id?.toString(),
      }
    });
    
    // Upload optimized file to GridFS
    const optimizedGridFS = await gridfs.uploadFile(optimizedPath, {
      filename: path.basename(optimizedPath),
      contentType: 'image/jpeg',
      metadata: {
        originalName: req.file.originalname,
        type: 'optimized',
        exif: exifData,
        userId: req.user?._id?.toString(),
      }
    });
    
    // Upload thumbnail to GridFS
    const thumbnailGridFS = await gridfs.uploadFile(thumbnailPath, {
      filename: path.basename(thumbnailPath),
      contentType: 'image/jpeg',
      metadata: {
        originalName: req.file.originalname,
        type: 'thumbnail',
        exif: exifData,
        userId: req.user?._id?.toString(),
      }
    });
    
    // Create URL paths
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    // Clean up temporary files after uploading to GridFS
    try {
      await fs.unlink(filePath);
      await fs.unlink(optimizedPath);
      await fs.unlink(thumbnailPath);
      logger.info(`Deleted temporary files for ${req.file.originalname}`);
    } catch (deleteError) {
      logger.warn(`Could not delete temporary files: ${deleteError.message}`);
    }

    res.status(200).json({
      success: true,
      data: {
        originalName: req.file.originalname,
        gridfs: {
          original: originalGridFS.id,
          optimized: optimizedGridFS.id,
          thumbnail: thumbnailGridFS.id
        },
        originalUrl: `${baseUrl}/api/files/${originalGridFS.id}`,
        optimizedUrl: `${baseUrl}/api/files/${optimizedGridFS.id}`,
        thumbnailUrl: `${baseUrl}/api/files/${thumbnailGridFS.id}`,
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

    // Try to find the file in GridFS by filename
    const query = { filename };
    const files = await gridfs.findFiles(query);
    
    if (files && files.length > 0) {
      logger.info(`Found file in GridFS with ID: ${files[0]._id} for analysis`);
      
      // Create a temporary file for analysis
      const tempFilePath = path.join(config.tempUploadDir, `temp_${filename}`);
      
      try {
        // Download the file from GridFS to a temporary location
        await gridfs.downloadFile(files[0]._id, { destination: tempFilePath });
        
        logger.info(`Starting AI analysis for photo from GridFS: ${filename}`);
        
        // Analyze the photo using the specialized roofing inspection system prompt
        const analysis = await photoAnalysisService.analyzePhoto(tempFilePath);
        
        logger.info(`Successfully analyzed photo ${filename}: ${analysis.damageDetected ? 'Damage detected' : 'No damage detected'}`);
        
        // Clean up temporary file
        try {
          await fs.unlink(tempFilePath);
          logger.info(`Deleted temporary file: ${tempFilePath}`);
        } catch (deleteError) {
          logger.warn(`Could not delete temporary file: ${deleteError.message}`);
        }
        
        return res.status(200).json({
          success: true,
          data: analysis,
        });
      } catch (error) {
        // Clean up temporary file if it exists
        try {
          await fs.access(tempFilePath);
          await fs.unlink(tempFilePath);
        } catch (e) {
          // Ignore if file doesn't exist
        }
        
        logger.error(`AI analysis failed for GridFS photo ${filename}: ${error.message}`);
        throw new ApiError(500, `Failed to analyze photo: ${error.message}`);
      }
    }
    
    // Fallback to filesystem for backward compatibility
    logger.warn(`File not found in GridFS, checking filesystem: ${filename}`);
    
    const filePath = path.join(config.tempUploadDir, filename);
    
    try {
      // Check if file exists in filesystem
      await fs.access(filePath);
      
      logger.info(`Starting AI analysis for photo from filesystem: ${filename}`);
      
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

    // Try to find the file in GridFS by filename
    const query = { filename };
    const files = await gridfs.findFiles(query);
    
    if (files && files.length > 0) {
      // Delete all matching files in GridFS
      const deletionPromises = files.map(file => gridfs.deleteFile(file._id));
      await Promise.all(deletionPromises);
      
      logger.info(`Deleted ${files.length} files from GridFS with filename: ${filename}`);
      
      // Also try to delete any associated files (thumbnails, optimized versions)
      // Search for files with related metadata
      const relatedQuery = { 'metadata.originalName': filename };
      const relatedFiles = await gridfs.findFiles(relatedQuery);
      
      if (relatedFiles && relatedFiles.length > 0) {
        const relatedDeletionPromises = relatedFiles.map(file => gridfs.deleteFile(file._id));
        await Promise.all(relatedDeletionPromises);
        logger.info(`Deleted ${relatedFiles.length} related files from GridFS for: ${filename}`);
      }
      
      return res.status(200).json({
        success: true,
        message: 'Photo deleted successfully from GridFS',
      });
    }
    
    // Fallback to filesystem for backward compatibility
    logger.warn(`File not found in GridFS, checking filesystem: ${filename}`);
    
    // Check filesystem
    const filePath = path.join(config.tempUploadDir, filename);
    
    try {
      // Check if file exists in filesystem
      await fs.access(filePath);
      
      // Delete file
      await fs.unlink(filePath);
      
      // Also try to delete any derived files (thumbnails, optimized versions)
      const baseName = path.basename(filename, path.extname(filename));
      const ext = path.extname(filename);
      
      // Try to delete optimized version
      const optimizedPath = path.join(config.tempUploadDir, `${baseName}_optimized${ext}`);
      try {
        await fs.access(optimizedPath);
        await fs.unlink(optimizedPath);
        logger.info(`Deleted optimized version: ${optimizedPath}`);
      } catch (err) {
        // Ignore if file doesn't exist
      }
      
      // Try to delete thumbnail version
      const thumbnailPath = path.join(config.tempUploadDir, `${baseName}_thumb${ext}`);
      try {
        await fs.access(thumbnailPath);
        await fs.unlink(thumbnailPath);
        logger.info(`Deleted thumbnail version: ${thumbnailPath}`);
      } catch (err) {
        // Ignore if file doesn't exist
      }
      
      return res.status(200).json({
        success: true,
        message: 'Photo deleted successfully from filesystem',
      });
    } catch (error) {
      // File doesn't exist in filesystem either
      throw new ApiError(404, 'Photo not found in GridFS or filesystem');
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
    const isOptimizedRequest = filename.includes('_optimized');
    logger.info(`This appears to be a ${isThumbnailRequest ? 'thumbnail' : isOptimizedRequest ? 'optimized' : 'regular image'} request`);
    
    try {
      // Search for the file in GridFS by filename
      const query = { filename };
      
      // Find all files matching the query
      const files = await gridfs.findFiles(query);
      
      if (files && files.length > 0) {
        // Use the first matching file
        const fileId = files[0]._id;
        logger.info(`Found file in GridFS with ID: ${fileId}`);
        
        // Stream the file directly to the response
        await gridfs.streamToResponse(fileId, res);
        return; // Return early as response is handled by streamToResponse
      }
      
      // If not found by exact filename, try searching by similar filenames
      // For example, if requesting a thumbnail but stored with different naming convention
      let alternativeQuery = {};
      
      if (isThumbnailRequest) {
        // If requesting thumbnail, search for files with metadata type 'thumbnail'
        alternativeQuery = { 
          'metadata.type': 'thumbnail',
          // Try to match based on the original filename without the _thumb suffix
          'metadata.originalName': filename.replace('_thumb', '')
        };
      } else if (isOptimizedRequest) {
        // If requesting optimized, search for files with metadata type 'optimized'
        alternativeQuery = { 
          'metadata.type': 'optimized',
          // Try to match based on the original filename without the _optimized suffix
          'metadata.originalName': filename.replace('_optimized', '')
        };
      } else {
        // If requesting original, search for files with metadata type 'original'
        alternativeQuery = { 
          'metadata.type': 'original',
          'metadata.originalName': { $regex: new RegExp(filename, 'i') }
        };
      }
      
      logger.info(`Trying alternative query for GridFS:`, alternativeQuery);
      const alternativeFiles = await gridfs.findFiles(alternativeQuery);
      
      if (alternativeFiles && alternativeFiles.length > 0) {
        // Use the first matching file
        const fileId = alternativeFiles[0]._id;
        logger.info(`Found file in GridFS with alternative query, ID: ${fileId}`);
        
        // Stream the file directly to the response
        await gridfs.streamToResponse(fileId, res);
        return; // Return early as response is handled by streamToResponse
      }
      
      // If still not found, try fallback to filesystem for backward compatibility
      logger.warn(`File not found in GridFS, falling back to filesystem check for: ${filename}`);
      
      // Get the absolute paths to the directories from config
      const tempDir = config.tempUploadDir;
      const uploadsDir = config.uploadDir;
      const cwdPath = process.cwd();
      
      // Try multiple possible paths where the photo might be stored
      const possiblePaths = [
        // Main upload directories
        path.join(tempDir, filename),
        path.join(uploadsDir, filename),
        
        // Check other locations relative to cwd
        path.join(cwdPath, 'temp', filename),
        path.join(cwdPath, 'uploads', filename),
        path.join('./backend/temp', filename),
        path.join('./backend/uploads', filename),
        
        // Public directory fallback
        path.join(cwdPath, 'public', 'uploads', filename)
      ];
      
      // Find the first path that exists
      let foundPath = null;
      
      for (const testPath of possiblePaths) {
        try {
          if (fsSync.existsSync(testPath) && !fsSync.statSync(testPath).isDirectory()) {
            foundPath = testPath;
            logger.info(`Found photo in filesystem at: ${foundPath}`);
            break;
          }
        } catch (err) {
          logger.warn(`Error checking path ${testPath}: ${err.message}`);
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
        const stream = fsSync.createReadStream(foundPath);
        stream.on('error', (err) => {
          logger.error(`Error streaming photo from filesystem: ${err.message}`);
          if (!res.headersSent) {
            res.status(500).json({
              success: false,
              error: `Error serving image: ${err.message}`
            });
          }
        });
        
        stream.pipe(res);
        return;
      }
      
      // If we got here, the file wasn't found in GridFS or filesystem
      throw new ApiError(404, 'Photo not found');
    } catch (error) {
      logger.error(`Error retrieving photo from GridFS: ${error.message}`);
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