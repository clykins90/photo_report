const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs'); // Add regular fs module for sync operations
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const imageProcessor = require('../utils/imageProcessor');
const config = require('../config/config');
const photoAnalysisService = require('../services/photoAnalysisService');
const gridfs = require('../utils/gridfs'); // Add GridFS utility
const mongoose = require('mongoose');

/**
 * Upload and process photos (batch or single)
 * @route POST /api/photos/upload
 * @access Private
 */
const uploadPhotos = async (req, res, next) => {
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

    const reportId = req.body.reportId;
    if (reportId) {
      logger.info(`Photos will be associated with report: ${reportId}`);
    }

    logger.info(`Processing ${req.files.length} uploaded files`);

    // Process all files
    const processedFiles = await Promise.all(req.files.map(async (file) => {
      try {
        // Process image for web display (generate optimized and thumbnail versions)
        const processedImage = await processImageForWebDisplay(file);
        const originalPath = processedImage.originalPath;
        const optimizedPath = processedImage.optimizedPath;
        const thumbnailPath = processedImage.thumbnailPath;
        
        // Extract EXIF data if available
        let metadata = {};
        try {
          metadata = await extractExifData(originalPath);
        } catch (exifError) {
          logger.warn(`Could not extract EXIF data for ${file.originalname}: ${exifError.message}`);
        }
        
        // Create unique IDs for files
        const uniqueId = new mongoose.Types.ObjectId();
        const thumbnailId = new mongoose.Types.ObjectId();
        const optimizedId = new mongoose.Types.ObjectId();
        
        // Create base metadata object
        const fileMetadata = {
          originalName: file.originalname, 
          type: 'original',
          exif: metadata,
          userId: req.user?._id?.toString(),
          uploadDate: new Date()
        };
        
        // Add reportId to metadata if provided
        if (reportId) {
          fileMetadata.reportId = reportId;
        }
        
        // Determine if we should use GridFS or standard file storage
        // Force enable GridFS for testing
        let useGridFS = true;
        logger.info(`GridFS usage setting: ${useGridFS} (forced to true for testing)`);
        let gridfsInfo = {};
        
        if (useGridFS) {
          // Store files in GridFS
          try {
            logger.info(`Uploading file to GridFS: ${file.originalname}`);
            
            // Store files in GridFS
            const originalGridFS = await gridfs.uploadFile(originalPath, {
              filename: file.filename || path.basename(originalPath),
              contentType: file.mimetype,
              metadata: {
                ...fileMetadata,
                _id: uniqueId.toString() // Store the ID we'll use for the response
              }
            });
            
            const optimizedGridFS = await gridfs.uploadFile(optimizedPath, {
              filename: path.basename(optimizedPath),
              contentType: 'image/jpeg',
              metadata: {
                ...fileMetadata,
                type: 'optimized',
                originalFileId: originalGridFS.id
              }
            });
            
            const thumbnailGridFS = await gridfs.uploadFile(thumbnailPath, {
              filename: path.basename(thumbnailPath),
              contentType: 'image/jpeg',
              metadata: {
                ...fileMetadata,
                type: 'thumbnail',
                originalFileId: originalGridFS.id
              }
            });
            
            gridfsInfo = {
              original: originalGridFS.id,
              optimized: optimizedGridFS.id,
              thumbnail: thumbnailGridFS.id
            };
            
            logger.info(`Successfully uploaded file to GridFS: ${file.originalname}`, {
              originalId: originalGridFS.id,
              optimizedId: optimizedGridFS.id,
              thumbnailId: thumbnailGridFS.id
            });
            
            // Clean up temporary files after uploading to GridFS
            try {
              await fs.unlink(originalPath);
              await fs.unlink(optimizedPath);
              await fs.unlink(thumbnailPath);
              logger.info(`Deleted temporary files for ${file.originalname}`);
            } catch (deleteError) {
              logger.warn(`Could not delete temporary files: ${deleteError.message}`);
            }
          } catch (gridfsError) {
            logger.error(`Error uploading to GridFS: ${gridfsError.message}`, gridfsError);
            // Fall back to file system storage if GridFS fails
            useGridFS = false;
          }
        } else {
          logger.info(`Using filesystem storage for ${file.originalname} (GridFS is disabled)`);
        }
        
        // Create URL paths for client
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const optimizedFilename = path.basename(optimizedPath);
        const thumbnailFilename = path.basename(thumbnailPath);
        
        // Prepare response object
        const fileInfo = {
          _id: uniqueId,
          originalname: file.originalname,
          filename: file.filename || path.basename(originalPath),
          optimizedFilename,
          thumbnailFilename,
          size: file.size,
          mimetype: file.mimetype,
          contentType: file.mimetype,
          uploadDate: new Date(),
          user: req.user._id,
          reportId: reportId || null,
          metadata,
          path: useGridFS ? null : originalPath,
          thumbnailPath: useGridFS ? null : thumbnailPath,
          optimizedPath: useGridFS ? null : optimizedPath,
          originalUrl: useGridFS 
            ? `${baseUrl}/api/files/${gridfsInfo.original}` 
            : `${baseUrl}/api/photos/${file.filename || path.basename(originalPath)}`,
          optimizedUrl: useGridFS 
            ? `${baseUrl}/api/files/${gridfsInfo.optimized}` 
            : `${baseUrl}/api/photos/${optimizedFilename}`,
          thumbnailUrl: useGridFS 
            ? `${baseUrl}/api/files/${gridfsInfo.thumbnail}` 
            : `${baseUrl}/api/photos/${thumbnailFilename}`,
        };
        
        // If using GridFS, add GridFS IDs
        if (useGridFS) {
          fileInfo.gridfsId = uniqueId.toString();
          fileInfo.gridfs = gridfsInfo;
        }
        
        // If a report ID was provided, add this photo to the report
        if (reportId) {
          try {
            const Report = mongoose.model('Report');
            const report = await Report.findById(reportId);
            
            if (report) {
              // Create photo object in the format expected by the Report model
              const photoForReport = {
                _id: uniqueId, // Use the same ID to maintain relationship
                path: fileInfo.originalUrl, // Store URL instead of file path
                filename: fileInfo.filename,
                section: req.body.section || 'Uncategorized',
                userDescription: req.body.description || '',
                aiAnalysis: null,
                thumbnailUrl: fileInfo.thumbnailUrl,
                optimizedUrl: fileInfo.optimizedUrl
              };
              
              // Add photo to report
              report.photos.push(photoForReport);
              await report.save();
              logger.info(`Added photo ${uniqueId} to report ${reportId}`);
            } else {
              logger.warn(`Could not find report with ID ${reportId} to add photo`);
            }
          } catch (err) {
            logger.error(`Failed to associate photo with report: ${err.message}`);
          }
        }
        
        return fileInfo;
      } catch (error) {
        logger.error(`Error processing file ${file.originalname}: ${error.message}`);
        return {
          originalname: file.originalname,
          filename: file.filename,
          error: error.message
        };
      }
    }));

    // Log results
    const successCount = processedFiles.filter(f => !f.error).length;
    const errorCount = processedFiles.filter(f => f.error).length;
    logger.info(`Photo upload complete: ${successCount} files processed successfully, ${errorCount} errors`);

    res.status(200).json({
      success: true,
      count: processedFiles.length,
      files: processedFiles,
    });
  } catch (error) {
    logger.error(`Error in uploadPhotos: ${error.message}`);
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
    
    const file = req.file;
    let filePath;
    let originalBuffer;
    
    // Handle both disk storage and memory storage
    if (file.destination && file.filename) {
      // For disk storage
      filePath = path.join(file.destination, file.filename);
      logger.info(`Processing disk-stored file: ${file.originalname}, saved as: ${file.filename}`);
    } else if (file.buffer) {
      // For memory storage, save buffer to temporary file
      const tempFileName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      filePath = path.join(config.tempUploadDir, tempFileName);
      
      // Ensure temp directory exists
      if (!fsSync.existsSync(config.tempUploadDir)) {
        fsSync.mkdirSync(config.tempUploadDir, { recursive: true });
      }
      
      // Write buffer to temp file
      await fs.writeFile(filePath, file.buffer);
      originalBuffer = file.buffer;
      logger.info(`Processing memory-stored file: ${file.originalname}, saved to temp file: ${tempFileName}`);
    } else {
      throw new ApiError(400, 'Invalid file format');
    }
    
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
    
    // Extract EXIF data
    let exifData = {};
    try {
      exifData = await imageProcessor.extractExifData(filePath);
    } catch (exifError) {
      logger.warn(`Could not extract EXIF data for ${filePath}: ${exifError.message}`);
    }
    
    // Create metadata with reportId if provided
    const fileMetadata = {
      originalName: file.originalname,
      type: 'original',
      exif: exifData,
      userId: req.user?._id?.toString(),
    };
    
    // Add reportId to metadata if provided in the request
    if (req.body.reportId) {
      fileMetadata.reportId = req.body.reportId;
      logger.info(`Associating file with report: ${req.body.reportId}`);
    }
    
    // Upload original file to GridFS
    const originalGridFS = await gridfs.uploadFile(filePath, {
      filename: file.filename,
      contentType: file.mimetype,
      metadata: fileMetadata
    });
    
    // Upload optimized file to GridFS
    const optimizedGridFS = await gridfs.uploadFile(optimizedPath, {
      filename: path.basename(optimizedPath),
      contentType: 'image/jpeg',
      metadata: {
        ...fileMetadata,
        type: 'optimized',
      }
    });
    
    // Upload thumbnail to GridFS
    const thumbnailGridFS = await gridfs.uploadFile(thumbnailPath, {
      filename: path.basename(thumbnailPath),
      contentType: 'image/jpeg',
      metadata: {
        ...fileMetadata,
        type: 'thumbnail',
      }
    });
    
    // Create URL paths
    const baseUrl = `${req.protocol}://${req.get('host')}`;
    
    // Clean up temporary files after uploading to GridFS
    try {
      await fs.unlink(filePath);
      await fs.unlink(optimizedPath);
      await fs.unlink(thumbnailPath);
      logger.info(`Deleted temporary files for ${file.originalname}`);
    } catch (deleteError) {
      logger.warn(`Could not delete temporary files: ${deleteError.message}`);
    }

    res.status(200).json({
      success: true,
      data: {
        originalName: file.originalname,
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
 * Analyze a photo using AI
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const analyzePhoto = async (req, res, next) => {
  try {
    const { filename, id } = req.params;
    let fileId = id;
    let query;
    
    // Determine if we're looking up by ID or filename (legacy)
    if (req.path.includes('/analyze-by-id/')) {
      logger.info(`Looking up file by ID: ${fileId}`);
      
      // Validate ID
      if (!fileId || fileId === 'undefined') {
        logger.error(`Invalid file ID for analysis: "${fileId}"`);
        throw new ApiError(400, 'Invalid or missing file ID. Please provide a valid file ID for analysis.');
      }
      
      // Try to find file directly by ID
      try {
        fileId = new mongoose.Types.ObjectId(fileId);
        query = { _id: fileId };
      } catch (error) {
        logger.error(`Invalid ObjectId format: ${fileId}`);
        throw new ApiError(400, 'Invalid file ID format.');
      }
    } else {
      // Legacy code path for filename lookup
      logger.warn(`Using legacy filename lookup for: ${filename}. Consider updating to ID-based lookup.`);
      
      // Validate filename to prevent directory traversal
      if (!filename || filename === 'undefined' || filename.includes('..') || filename.includes('/')) {
        logger.error(`Invalid filename for analysis: "${filename}"`);
        throw new ApiError(400, 'Invalid or missing filename. Please provide a valid filename for analysis.');
      }
      
      query = { filename };
    }

    // Try to find the file in GridFS using the query
    const files = await gridfs.findFiles(query);
    
    if (files && files.length > 0) {
      const foundFile = files[0];
      logger.info(`Found file in GridFS with ID: ${foundFile._id} for analysis`);
      
      // Create a temporary file for analysis
      const tempFilePath = path.join(config.tempUploadDir, `temp_analysis_${foundFile._id}`);
      
      try {
        // Download the file from GridFS to a temporary location
        await gridfs.downloadFile(foundFile._id, { destination: tempFilePath });
        
        logger.info(`Starting AI analysis for photo from GridFS: ${foundFile._id}`);
        
        // Analyze the photo using the specialized roofing inspection system prompt
        const analysis = await photoAnalysisService.analyzePhoto(tempFilePath);
        
        // Clean up the temporary file
        try {
          await fs.unlink(tempFilePath);
          logger.debug(`Deleted temporary file: ${tempFilePath}`);
        } catch (e) {
          logger.warn(`Could not delete temporary file ${tempFilePath}: ${e.message}`);
        }
        
        return res.status(200).json({
          success: true,
          message: 'Photo analysis completed successfully',
          data: analysis
        });
      } catch (error) {
        // Clean up the temporary file in case of error
        try {
          if (fsSync.existsSync(tempFilePath)) {
            await fs.unlink(tempFilePath);
            logger.debug(`Deleted temporary file due to error: ${tempFilePath}`);
          }
        } catch (e) {
          logger.warn(`Could not delete temporary file ${tempFilePath}: ${e.message}`);
        }
        
        throw error;
      }
    } else {
      const identifier = id || filename;
      logger.error(`File not found for analysis: ${identifier}`);
      throw new ApiError(404, `File not found: ${identifier}`);
    }
  } catch (error) {
    return next(error);
  }
};

/**
 * Analyze a batch of photos using AI (up to 20 at a time)
 * @route POST /api/photos/analyze-batch
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 * @returns {Promise<void>}
 */
const analyzeBatchPhotos = async (req, res, next) => {
  try {
    const { fileIds } = req.body;
    const photoTempPaths = [];
    const photoDetails = [];

    if (!fileIds || !Array.isArray(fileIds) || fileIds.length === 0) {
      throw new ApiError(400, 'Please provide an array of file IDs to analyze');
    }

    // Limit batch size to 20 photos at once
    const MAX_BATCH_SIZE = 20;
    if (fileIds.length > MAX_BATCH_SIZE) {
      throw new ApiError(400, `Batch size exceeds maximum of ${MAX_BATCH_SIZE} photos. Please split into smaller batches.`);
    }

    logger.info(`Received batch of ${fileIds.length} photos from frontend for analysis`);
    
    // Process each file ID
    for (const fileId of fileIds) {
      try {
        // Validate that fileId is a valid MongoDB ObjectId string
        if (!fileId || typeof fileId !== 'string' || !(/^[0-9a-fA-F]{24}$/.test(fileId))) {
          logger.error(`Invalid file ID format: ${fileId} - not a valid MongoDB ObjectId string`);
          photoDetails.push({
            fileId,
            success: false,
            error: 'Invalid file ID format - must be a 24 character hex string'
          });
          continue;
        }
        
        // Convert to ObjectId once and use it directly
        const objId = new mongoose.Types.ObjectId(fileId);
        
        // Find the file directly by ID - simple and direct approach
        const file = await gridfs.getFileInfo(objId).catch(() => null);
        
        if (!file) {
          logger.error(`File not found with ID: ${fileId}`);
          photoDetails.push({
            fileId,
            success: false,
            error: `File not found: ${fileId}`
          });
          continue;
        }
        
        // Create a temporary file for analysis
        const tempFilePath = path.join(config.tempUploadDir, `temp_batch_analysis_${file._id}`);
        photoTempPaths.push(tempFilePath);

        try {
          // Download the file from GridFS to a temporary location
          await gridfs.downloadFile(file._id, { destination: tempFilePath });
          photoDetails.push({
            fileId,
            tempFilePath,
            success: true,
            originalFile: file
          });
        } catch (downloadError) {
          logger.error(`Failed to download file ${fileId} for analysis: ${downloadError.message}`);
          photoDetails.push({
            fileId,
            success: false,
            error: `Download failed: ${downloadError.message}`
          });
        }
      } catch (idError) {
        logger.error(`Error processing file ID: ${fileId} - ${idError.message}`);
        photoDetails.push({
          fileId,
          success: false,
          error: 'Invalid file ID or processing error'
        });
      }
    }

    // Get the paths of successfully downloaded photos
    const validPhotoTempPaths = photoDetails
      .filter(detail => detail.success && detail.tempFilePath)
      .map(detail => detail.tempFilePath);

    if (validPhotoTempPaths.length === 0) {
      throw new ApiError(400, 'No valid photos found for analysis');
    }

    // Send the batch to the analysis service
    logger.info(`Sending batch of ${validPhotoTempPaths.length} photos to analysis service`);
    const analysisResults = await photoAnalysisService.analyzeBatchPhotos(validPhotoTempPaths);

    // Match results with original photo details
    const completeResults = photoDetails.map(detail => {
      if (!detail.success) {
        return {
          fileId: detail.fileId,
          success: false,
          error: detail.error
        };
      }

      // Find the matching analysis result
      const resultMatch = analysisResults.find(result => 
        result.imagePath === detail.tempFilePath
      );

      if (!resultMatch || !resultMatch.success) {
        return {
          fileId: detail.fileId,
          success: false,
          error: resultMatch ? resultMatch.error : 'Analysis failed'
        };
      }

      return {
        fileId: detail.fileId,
        success: true,
        data: resultMatch.data
      };
    });

    // Clean up temporary files
    for (const tempPath of photoTempPaths) {
      try {
        if (fsSync.existsSync(tempPath)) {
          await fs.unlink(tempPath);
        }
      } catch (cleanupError) {
        logger.warn(`Could not delete temporary file ${tempPath}: ${cleanupError.message}`);
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Batch photo analysis completed',
      count: completeResults.length,
      data: completeResults
    });
  } catch (error) {
    // Clean up any remaining temporary files in case of an error
    if (req.tempPaths && Array.isArray(req.tempPaths)) {
      for (const tempPath of req.tempPaths) {
        try {
          if (fsSync.existsSync(tempPath)) {
            await fs.unlink(tempPath);
          }
        } catch (e) {
          logger.warn(`Could not delete temporary file ${tempPath}: ${e.message}`);
        }
      }
    }
    return next(error);
  }
};

/**
 * Delete a photo
 * @route DELETE /api/photos/delete-by-id/:id or /api/photos/:filename (legacy)
 * @access Private
 */
const deletePhoto = async (req, res, next) => {
  try {
    const { filename, id } = req.params;
    let fileId = id;
    let query;
    
    // Determine if we're looking up by ID or filename (legacy)
    if (req.path.includes('/delete-by-id/')) {
      logger.info(`Deleting file by ID: ${fileId}`);
      
      // Validate ID
      if (!fileId || fileId === 'undefined') {
        logger.error(`Invalid file ID for deletion: "${fileId}"`);
        throw new ApiError(400, 'Invalid or missing file ID. Please provide a valid file ID for deletion.');
      }
      
      // Try to find file directly by ID
      try {
        fileId = new mongoose.Types.ObjectId(fileId);
        query = { _id: fileId };
      } catch (error) {
        logger.error(`Invalid ObjectId format: ${fileId}`);
        throw new ApiError(400, 'Invalid file ID format.');
      }
    } else {
      // Legacy code path for filename lookup
      logger.warn(`Using legacy filename lookup for deletion: ${filename}. Consider updating to ID-based lookup.`);
      
      // Validate filename to prevent directory traversal
      if (!filename || filename.includes('..') || filename.includes('/')) {
        throw new ApiError(400, 'Invalid filename');
      }
      
      query = { filename };
    }

    // Try to find the file in GridFS
    const files = await gridfs.findFiles(query);
    
    if (files && files.length > 0) {
      // Delete the main file in GridFS
      const targetFile = files[0];
      await gridfs.deleteFile(targetFile._id);
      logger.info(`Deleted file from GridFS with ID: ${targetFile._id}`);
      
      // Try to find and delete related files (thumbnails, optimized versions)
      try {
        // Look for files that share the same original upload
        let relatedFiles = [];
        
        if (targetFile.metadata && targetFile.metadata.originalName) {
          // If this is the original file, find its derivatives
          const relatedQuery = { 'metadata.originalName': targetFile.metadata.originalName };
          relatedFiles = await gridfs.findFiles(relatedQuery);
        }
        // Also check for files that are related based on metadata grouping
        if (targetFile.metadata && targetFile.metadata.groupId) {
          const groupQuery = { 'metadata.groupId': targetFile.metadata.groupId };
          const groupFiles = await gridfs.findFiles(groupQuery);
          relatedFiles = [...relatedFiles, ...groupFiles];
        }
        
        // Remove duplicates
        const uniqueFileIds = new Set();
        const uniqueRelatedFiles = relatedFiles.filter(file => {
          // Skip the file we already deleted
          if (file._id.toString() === targetFile._id.toString()) {
            return false;
          }
          // Check if we've seen this ID before
          const fileIdStr = file._id.toString();
          if (uniqueFileIds.has(fileIdStr)) {
            return false;
          }
          uniqueFileIds.add(fileIdStr);
          return true;
        });
        
        if (uniqueRelatedFiles.length > 0) {
          // Delete all related files
          const deletionPromises = uniqueRelatedFiles.map(file => gridfs.deleteFile(file._id));
          await Promise.all(deletionPromises);
          logger.info(`Deleted ${uniqueRelatedFiles.length} related files from GridFS`);
        }
      } catch (relatedError) {
        logger.warn(`Error while trying to delete related files: ${relatedError.message}`);
        // Continue with the success response even if related file deletion failed
      }
      
      return res.status(200).json({
        success: true,
        message: 'Photo deleted successfully',
      });
    }
    
    // If we reach here, no file was found with the given ID/filename
    const identifier = id || filename;
    logger.error(`File not found for deletion: ${identifier}`);
    throw new ApiError(404, `File not found: ${identifier}`);
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
    const filename = req.params.filename;
    
    // Validate filename to prevent directory traversal
    if (!filename || filename.includes('..') || filename.includes('/')) {
      throw new ApiError(400, 'Invalid filename');
    }
    
    logger.info(`Retrieving photo: ${filename}`);
    
    // First try to find the file in GridFS by filename
    try {
      // Check if USE_GRIDFS is enabled
      const useGridFS = (process.env.USE_GRIDFS === 'true');
      
      if (useGridFS) {
        logger.info(`Searching for file in GridFS: ${filename}`);
        
        // Try to find by exact filename first
        let files = await gridfs.findFiles({ filename });
        
        if (files && files.length > 0) {
          const fileId = files[0]._id;
          logger.info(`Found file in GridFS, ID: ${fileId}`);
          
          // Stream the file directly to the response
          await gridfs.streamToResponse(fileId, res);
          return; // Return early as response is handled by streamToResponse
        }
        
        // If not found by exact filename, try alternative queries
        // This handles optimized and thumbnail versions
        const alternativeFiles = await gridfs.findFiles({
          $or: [
            { filename: { $regex: filename } },
            { 'metadata.originalName': filename }
          ]
        });
        
        if (alternativeFiles && alternativeFiles.length > 0) {
          // Use the first matching file
          const fileId = alternativeFiles[0]._id;
          logger.info(`Found file in GridFS with alternative query, ID: ${fileId}`);
          
          // Stream the file directly to the response
          await gridfs.streamToResponse(fileId, res);
          return; // Return early as response is handled by streamToResponse
        }
        
        // Try one more approach - check if the filename is actually a MongoDB ObjectId
        if (mongoose.Types.ObjectId.isValid(filename)) {
          try {
            const objectId = new mongoose.Types.ObjectId(filename);
            const fileById = await gridfs.findFiles({ _id: objectId });
            
            if (fileById && fileById.length > 0) {
              logger.info(`Found file in GridFS by treating filename as ObjectId: ${filename}`);
              await gridfs.streamToResponse(objectId, res);
              return;
            }
          } catch (objectIdError) {
            logger.warn(`Error treating filename as ObjectId: ${objectIdError.message}`);
          }
        }
        
        logger.warn(`File not found in GridFS: ${filename}`);
      }
    } catch (gridfsError) {
      logger.error(`Error retrieving photo from GridFS: ${gridfsError.message}`);
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
    next(error);
  }
};

/**
 * Process an image file for web display (generate optimized and thumbnail versions)
 * @param {Object} file - The uploaded file object
 * @returns {Promise<Object>} - Object with paths to processed images
 */
const processImageForWebDisplay = async (file) => {
  try {
    let filePath;
    
    // Handle both disk storage and memory storage
    if (file.destination && file.filename) {
      // For disk storage
      filePath = path.join(file.destination, file.filename);
      logger.info(`Processing disk-stored file: ${file.originalname}, saved as: ${file.filename}`);
    } else if (file.buffer) {
      // For memory storage, save buffer to temporary file
      const tempFileName = `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
      filePath = path.join(config.tempUploadDir, tempFileName);
      
      // Ensure temp directory exists
      if (!fsSync.existsSync(config.tempUploadDir)) {
        fsSync.mkdirSync(config.tempUploadDir, { recursive: true });
      }
      
      // Write buffer to temp file
      await fs.writeFile(filePath, file.buffer);
      logger.info(`Processing memory-stored file: ${file.originalname}, saved to temp file: ${tempFileName}`);
    } else {
      throw new Error('Invalid file format');
    }
    
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
    
    return { 
      originalPath: filePath,
      optimizedPath,
      thumbnailPath
    };
  } catch (error) {
    logger.error(`Error processing image for web display: ${error.message}`);
    throw error;
  }
};

/**
 * Extract EXIF data from an image file
 * @param {string} filePath - Path to the image file
 * @returns {Promise<Object>} - EXIF data
 */
const extractExifData = async (filePath) => {
  try {
    // Use the existing imageProcessor utility
    return await imageProcessor.extractExifData(filePath);
  } catch (error) {
    logger.warn(`Could not extract EXIF data for ${filePath}: ${error.message}`);
    return {};
  }
};

// Export all the controllers
module.exports = {
  uploadPhotos,
  uploadSinglePhoto,
  analyzePhoto,
  analyzeBatchPhotos,
  deletePhoto,
  getPhoto,
}; 