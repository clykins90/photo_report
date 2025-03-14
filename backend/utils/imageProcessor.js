const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const logger = require('./logger');
const config = require('../config/config');

/**
 * Optimize an image using Sharp
 * @param {string} filePath - Path to the original image
 * @param {Object} options - Optimization options
 * @returns {Promise<string>} - Path to the optimized image
 */
const optimizeImage = async (filePath, options = {}) => {
  try {
    const {
      width = 1200, // Default max width
      quality = 80, // Default quality
      format = 'jpeg', // Default format
      outputDir = config.tempUploadDir,
      tempDir = null, // New parameter for Vercel compatibility
    } = options;

    // Use provided tempDir if available, otherwise use outputDir
    const finalOutputDir = tempDir || outputDir;
    
    // Get file info
    const fileInfo = path.parse(filePath);
    const outputFilename = `${fileInfo.name}_optimized.${format}`;
    const outputPath = path.join(finalOutputDir, outputFilename);

    // Ensure output directory exists (only in non-Vercel environments)
    const isVercel = process.env.VERCEL === '1';
    if (!isVercel && !fs.existsSync(finalOutputDir)) {
      fs.mkdirSync(finalOutputDir, { recursive: true });
      logger.info(`Created output directory: ${finalOutputDir}`);
    }

    // Process image with Sharp
    await sharp(filePath)
      .resize({ width, withoutEnlargement: true }) // Resize to max width while maintaining aspect ratio
      .toFormat(format, { quality }) // Convert to specified format with quality
      .toFile(outputPath);

    logger.info(`Image optimized: ${filePath} -> ${outputPath}`);
    return outputPath;
  } catch (error) {
    logger.error(`Error optimizing image: ${filePath}`, error);
    throw error;
  }
};

/**
 * Extract EXIF data from an image
 * @param {string} filePath - Path to the image
 * @returns {Promise<Object>} - EXIF data
 */
const extractExifData = async (filePath) => {
  try {
    const metadata = await sharp(filePath).metadata();
    
    // Extract relevant EXIF data
    const exifData = {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: metadata.size,
      exif: metadata.exif ? metadata.exif : null,
    };

    // Try to parse exif data if available
    if (metadata.exif) {
      try {
        // Use exif-reader for better exif parsing
        const ExifReader = require('exif-reader');
        const parsedExif = ExifReader(metadata.exif);
        
        // Extract common metadata fields
        if (parsedExif) {
          // Get date and time when photo was taken
          if (parsedExif.exif) {
            if (parsedExif.exif.DateTimeOriginal) {
              exifData.takenAt = parsedExif.exif.DateTimeOriginal;
            } else if (parsedExif.exif.DateTime) {
              exifData.takenAt = parsedExif.exif.DateTime;
            }
            
            // Camera info
            if (parsedExif.exif.Model) {
              exifData.camera = parsedExif.exif.Model;
            }
            
            // Exposure settings
            if (parsedExif.exif.ExposureTime) {
              exifData.exposureTime = parsedExif.exif.ExposureTime;
            }
            if (parsedExif.exif.FNumber) {
              exifData.fNumber = parsedExif.exif.FNumber;
            }
            if (parsedExif.exif.ISO) {
              exifData.iso = parsedExif.exif.ISO;
            }
          }
          
          // Get GPS data if available
          if (parsedExif.gps) {
            exifData.gps = parsedExif.gps;
            
            // Convert GPS coordinates to decimal format if present
            if (parsedExif.gps.GPSLatitude && parsedExif.gps.GPSLongitude) {
              // Format: [degrees, minutes, seconds]
              const lat = parsedExif.gps.GPSLatitude;
              const lon = parsedExif.gps.GPSLongitude;
              
              const latRef = parsedExif.gps.GPSLatitudeRef || 'N';
              const lonRef = parsedExif.gps.GPSLongitudeRef || 'E';
              
              // Convert to decimal degrees
              let latDecimal = 0;
              let lonDecimal = 0;
              
              if (Array.isArray(lat) && lat.length === 3) {
                latDecimal = lat[0] + (lat[1]/60) + (lat[2]/3600);
                if (latRef === 'S') latDecimal = -latDecimal;
              }
              
              if (Array.isArray(lon) && lon.length === 3) {
                lonDecimal = lon[0] + (lon[1]/60) + (lon[2]/3600);
                if (lonRef === 'W') lonDecimal = -lonDecimal;
              }
              
              exifData.latitude = latDecimal;
              exifData.longitude = lonDecimal;
            }
          }
          
          // Extract image description if available
          if (parsedExif.image && parsedExif.image.ImageDescription) {
            exifData.imageDescription = parsedExif.image.ImageDescription;
          }
        }
      } catch (exifParseError) {
        logger.warn(`Error parsing EXIF data: ${exifParseError.message}`);
        // Fallback to basic metadata
        exifData.takenAt = metadata.exif.DateTimeOriginal || null;
      }
    }

    logger.info(`EXIF data extracted from: ${filePath}`);
    return exifData;
  } catch (error) {
    logger.error(`Error extracting EXIF data: ${filePath}`, error);
    return null;
  }
};

/**
 * Generate a thumbnail for an image
 * @param {string} filePath - Path to the original image
 * @param {Object} options - Thumbnail options
 * @returns {Promise<string>} - Path to the thumbnail
 */
const generateThumbnail = async (filePath, options = {}) => {
  try {
    const {
      width = 300,
      height = 300,
      fit = 'cover',
      format = 'jpeg',
      outputDir = config.tempUploadDir,
      tempDir = null, // New parameter for Vercel compatibility
    } = options;

    // Use provided tempDir if available, otherwise use outputDir
    const finalOutputDir = tempDir || outputDir;

    // Get file info
    const fileInfo = path.parse(filePath);
    const outputFilename = `${fileInfo.name}_thumb.${format}`;
    const outputPath = path.join(finalOutputDir, outputFilename);

    // Ensure output directory exists (only in non-Vercel environments)
    const isVercel = process.env.VERCEL === '1';
    if (!isVercel && !fs.existsSync(finalOutputDir)) {
      fs.mkdirSync(finalOutputDir, { recursive: true });
      logger.info(`Created output directory: ${finalOutputDir}`);
    }

    logger.info(`Generating thumbnail for ${filePath} to ${outputPath} (${width}x${height})`);

    // Generate thumbnail with Sharp
    await sharp(filePath)
      .resize(width, height, { fit })
      .toFormat(format)
      .toFile(outputPath);

    // Verify thumbnail was created
    try {
      const exists = fs.existsSync(outputPath);
      const fileSize = exists ? fs.statSync(outputPath).size : 0;
      logger.info(`Thumbnail generated: ${filePath} -> ${outputPath} (exists: ${exists}, size: ${fileSize} bytes)`);
      
      if (!exists || fileSize === 0) {
        throw new Error(`Failed to create thumbnail or thumbnail is empty: ${outputPath}`);
      }
    } catch (verifyError) {
      logger.error(`Error verifying thumbnail: ${verifyError.message}`);
      throw verifyError;
    }

    return outputPath;
  } catch (error) {
    logger.error(`Error generating thumbnail: ${filePath}`, error);
    throw error;
  }
};

/**
 * Process multiple images in batch
 * @param {Array<string>} filePaths - Array of file paths
 * @param {Object} options - Processing options
 * @returns {Promise<Array<Object>>} - Array of processed image data
 */
const processBatchImages = async (filePaths, options = {}) => {
  try {
    const results = [];

    for (const filePath of filePaths) {
      // Process each image
      const optimizedPath = await optimizeImage(filePath, options);
      const thumbnailPath = await generateThumbnail(filePath, options);
      const exifData = await extractExifData(filePath);

      results.push({
        original: filePath,
        optimized: optimizedPath,
        thumbnail: thumbnailPath,
        metadata: exifData,
      });
    }

    logger.info(`Batch processed ${filePaths.length} images`);
    return results;
  } catch (error) {
    logger.error('Error processing batch images', error);
    throw error;
  }
};

module.exports = {
  optimizeImage,
  extractExifData,
  generateThumbnail,
  processBatchImages,
}; 