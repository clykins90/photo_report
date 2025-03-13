const sharp = require('sharp');
const path = require('path');
const { ApiError } = require('./errorHandler');
const logger = require('../utils/logger');
const config = require('../config/config');

/**
 * Validate image dimensions
 * @param {string} filePath - Path to the image file
 * @param {Object} options - Validation options
 * @returns {Promise<boolean>} - True if valid, throws error if invalid
 */
const validateImageDimensions = async (filePath, options = {}) => {
  try {
    const {
      minWidth = 0,
      maxWidth = 5000,
      minHeight = 0,
      maxHeight = 5000,
    } = options;

    // Get image metadata
    const metadata = await sharp(filePath).metadata();
    const { width, height } = metadata;

    // Check dimensions
    if (width < minWidth || width > maxWidth) {
      throw new ApiError(400, `Image width must be between ${minWidth} and ${maxWidth} pixels`);
    }

    if (height < minHeight || height > maxHeight) {
      throw new ApiError(400, `Image height must be between ${minHeight} and ${maxHeight} pixels`);
    }

    return true;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error(`Error validating image dimensions: ${filePath}`, error);
    throw new ApiError(400, 'Invalid image file');
  }
};

/**
 * Validate image format
 * @param {string} filePath - Path to the image file
 * @param {Array<string>} allowedFormats - Array of allowed formats
 * @returns {Promise<boolean>} - True if valid, throws error if invalid
 */
const validateImageFormat = async (filePath, allowedFormats = ['jpeg', 'jpg', 'png', 'heic']) => {
  try {
    // Get file extension from path
    const fileExt = path.extname(filePath).toLowerCase().replace('.', '');
    
    // For HEIC files, we'll accept them based on extension since Sharp might not support them fully
    if (fileExt === 'heic' && allowedFormats.includes('heic')) {
      return true;
    }
    
    // For other formats, use Sharp to validate
    try {
      // Get image metadata
      const metadata = await sharp(filePath).metadata();
      const { format } = metadata;
      
      // Check format
      if (!allowedFormats.includes(format.toLowerCase())) {
        throw new ApiError(400, `Invalid image format. Allowed formats: ${allowedFormats.join(', ')}`);
      }
      
      return true;
    } catch (sharpError) {
      // If Sharp fails but the file extension is allowed, we'll accept it
      if (allowedFormats.includes(fileExt)) {
        logger.warn(`Sharp validation failed for ${filePath}, but extension is allowed: ${fileExt}`);
        return true;
      }
      throw sharpError;
    }
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error(`Error validating image format: ${filePath}`, error);
    throw new ApiError(400, 'Invalid image file');
  }
};

/**
 * Middleware to validate uploaded image files
 * @param {Object} options - Validation options
 * @returns {Function} - Express middleware
 */
const validateImageFiles = (options = {}) => {
  return async (req, res, next) => {
    try {
      // Check if files exist
      if (!req.files || req.files.length === 0) {
        logger.error('No files found in request:', { 
          files: req.files, 
          body: req.body,
          headers: req.headers['content-type']
        });
        return next(new ApiError(400, 'No files uploaded'));
      }

      const files = req.files;
      const validationPromises = [];

      logger.info(`Validating ${files.length} files`);

      // Validate each file
      for (const file of files) {
        let filePath;
        
        // Handle both disk storage and memory storage
        if (file.destination && file.filename) {
          // For disk storage
          filePath = path.join(file.destination, file.filename);
          logger.info(`Validating disk-stored file: ${filePath}`);
          
          // Validate dimensions
          validationPromises.push(validateImageDimensions(filePath, options));
          
          // Validate format
          validationPromises.push(validateImageFormat(filePath, config.allowedFileTypes.map(type => {
            // Convert MIME types to formats
            return type.split('/')[1];
          })));
        } else if (file.buffer) {
          // For memory storage - validate the buffer directly
          logger.info(`Validating memory-stored file: ${file.originalname}`);
          
          try {
            // Validate dimensions using buffer
            const metadata = await sharp(file.buffer).metadata();
            const { width, height } = metadata;
            const { minWidth = 0, maxWidth = 5000, minHeight = 0, maxHeight = 5000 } = options;
            
            if (width < minWidth || width > maxWidth) {
              throw new ApiError(400, `Image width must be between ${minWidth} and ${maxWidth} pixels`);
            }
            
            if (height < minHeight || height > maxHeight) {
              throw new ApiError(400, `Image height must be between ${minHeight} and ${maxHeight} pixels`);
            }
            
            // Validate format using buffer
            const { format } = metadata;
            const allowedFormats = config.allowedFileTypes.map(type => type.split('/')[1]);
            
            if (!allowedFormats.includes(format.toLowerCase())) {
              throw new ApiError(400, `Invalid image format. Allowed formats: ${allowedFormats.join(', ')}`);
            }
          } catch (error) {
            if (error instanceof ApiError) {
              throw error;
            }
            logger.error(`Error validating buffer image: ${file.originalname}`, error);
            throw new ApiError(400, 'Invalid image file');
          }
        } else {
          logger.error(`Cannot validate file - neither path nor buffer available: ${JSON.stringify(file)}`);
          throw new ApiError(400, 'Invalid file format');
        }
      }

      // Wait for all validations to complete
      await Promise.all(validationPromises);
      
      logger.info('All files validated successfully');
      next();
    } catch (error) {
      logger.error('File validation error:', error);
      next(error);
    }
  };
};

/**
 * Middleware to validate a single image file
 * @param {Object} options - Validation options
 * @returns {Function} - Express middleware
 */
const validateSingleImage = (options = {}) => {
  return async (req, res, next) => {
    try {
      // Check if file exists
      if (!req.file) {
        return next(new ApiError(400, 'No file uploaded'));
      }

      const file = req.file;
      
      // Handle both disk storage and memory storage
      if (file.destination && file.filename) {
        // For disk storage
        const filePath = path.join(file.destination, file.filename);
        logger.info(`Validating disk-stored file: ${filePath}`);
        
        // Validate dimensions
        await validateImageDimensions(filePath, options);
        
        // Validate format
        await validateImageFormat(filePath, config.allowedFileTypes.map(type => {
          // Convert MIME types to formats
          return type.split('/')[1];
        }));
      } else if (file.buffer) {
        // For memory storage - validate the buffer directly
        logger.info(`Validating memory-stored file: ${file.originalname}`);
        
        try {
          // Validate dimensions using buffer
          const metadata = await sharp(file.buffer).metadata();
          const { width, height } = metadata;
          const { minWidth = 0, maxWidth = 5000, minHeight = 0, maxHeight = 5000 } = options;
          
          if (width < minWidth || width > maxWidth) {
            throw new ApiError(400, `Image width must be between ${minWidth} and ${maxWidth} pixels`);
          }
          
          if (height < minHeight || height > maxHeight) {
            throw new ApiError(400, `Image height must be between ${minHeight} and ${maxHeight} pixels`);
          }
          
          // Validate format using buffer
          const { format } = metadata;
          const allowedFormats = config.allowedFileTypes.map(type => type.split('/')[1]);
          
          if (!allowedFormats.includes(format.toLowerCase())) {
            throw new ApiError(400, `Invalid image format. Allowed formats: ${allowedFormats.join(', ')}`);
          }
        } catch (error) {
          if (error instanceof ApiError) {
            throw error;
          }
          logger.error(`Error validating buffer image: ${file.originalname}`, error);
          throw new ApiError(400, 'Invalid image file');
        }
      } else {
        logger.error(`Cannot validate file - neither path nor buffer available: ${JSON.stringify(file)}`);
        throw new ApiError(400, 'Invalid file format');
      }
      
      next();
    } catch (error) {
      next(error);
    }
  };
};

module.exports = {
  validateImageFiles,
  validateSingleImage,
  validateImageDimensions,
  validateImageFormat,
}; 