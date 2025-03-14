/**
 * Photo handling module for PDF generation
 * Handles photo path resolution and embedding photos in PDFs
 */
const logger = require('../../utils/logger');

/**
 * Find the file path for a photo, prioritizing GridFS paths (photo IDs)
 * @param {Object} photo - The photo object
 * @returns {String|null} Path to the photo or null if not found
 */
const findPhotoPath = (photo) => {
  // If photo is missing or has no identifiable information, return null
  if (!photo) {
    logger.warn('Received undefined or null photo object');
    return null;
  }
  
  // Use a consistent priority order for ID extraction
  let photoId = null;
  
  // Priority 1: GridFS ID (highest priority)
  if (photo.gridfsId) {
    photoId = photo.gridfsId;
  }
  // Priority 2: GridFS original ID
  else if (photo.gridfs && photo.gridfs.original) {
    photoId = photo.gridfs.original;
  }
  // Priority 3: GridFS optimized ID
  else if (photo.gridfs && photo.gridfs.optimized) {
    photoId = photo.gridfs.optimized;
  }
  // Priority 4: Direct _id field
  else if (photo._id) {
    // Validate it's a valid ObjectId
    try {
      const mongoose = require('mongoose');
      const isValidObjectId = mongoose.Types.ObjectId.isValid(photo._id);
      if (isValidObjectId) {
        photoId = photo._id;
      }
    } catch (err) {
      // Ignore errors, continue with other methods
    }
  }
  // Priority 5: id field (if it looks like a MongoDB ObjectId)
  else if (photo.id && typeof photo.id === 'string' && /^[0-9a-fA-F]{24}$/.test(photo.id)) {
    photoId = photo.id;
  }
  
  // If we found a valid photo ID, return it as a GridFS path
  if (photoId) {
    return `gridfs:${photoId}`;
  }
  
  // Fallback: Check if this is a blob URL with a filename
  if (photo.path && photo.path.startsWith('blob:') && photo.filename) {
    return `filename:${photo.filename}`;
  }
  
  // No valid path found
  logger.warn('Could not find a valid photo path', { photo });
  return null;
};

/**
 * Add a placeholder box for missing images
 * @param {Object} doc - The PDFKit document
 * @param {Number} x - X position
 * @param {Number} y - Y position
 * @param {Number} width - Width of the placeholder
 * @param {Number} height - Height of the placeholder
 * @param {String} caption - Optional caption
 */
const addMissingImagePlaceholder = (doc, x, y, width, height, caption) => {
  // Draw a placeholder rectangle with a light fill
  doc.rect(x, y, width, height)
     .fillAndStroke('#f3f4f6', '#cccccc');
  
  // Add an icon or symbol for missing image (a simple camera icon made with basic shapes)
  // Camera body
  const centerX = x + width/2;
  const centerY = y + height/2;
  
  // Draw camera body
  doc.rect(centerX - 30, centerY - 15, 60, 40)
     .lineWidth(2)
     .fillAndStroke('#e5e7eb', '#9ca3af');
  
  // Draw lens circle
  doc.circle(centerX, centerY, 12)
     .lineWidth(2)
     .fillAndStroke('#f9fafb', '#9ca3af');
  
  // Draw flash rectangle  
  doc.rect(centerX + 15, centerY - 20, 10, 5)
     .fill('#9ca3af');
  
  // Add text in the center of the placeholder
  doc.fontSize(12)
     .fillColor('#6b7280')
     .text('Photo Not Available', 
           centerX - 55, 
           centerY + 25, 
           { width: 110, align: 'center' });
  
  // Add caption if provided
  if (caption) {
    const captionY = y + height + 10;
    doc.fontSize(10)
       .fillColor('#111827')
       .text(caption, x, captionY, { 
         width: width, 
         align: 'center' 
       });
  }
};

/**
 * Add metadata to a photo
 * @param {Object} doc - The PDFKit document
 * @param {Object} photo - The photo object
 * @param {Number} x - X position
 * @param {Number} y - Y position
 * @param {Number} width - Width of the metadata area
 * @param {Object} colors - Color scheme
 * @param {Object} fonts - Font configuration
 */
const addPhotoMetadata = (doc, photo, x, y, width, colors, fonts) => {
  doc.fontSize(8).font(fonts.Body).fillColor(colors.secondary);
  
  const metadata = photo.metadata || (photo.uploadedData ? photo.uploadedData.metadata : null);
  if (!metadata && !photo.filename) return;
  
  const metadataLines = [];
  
  // First line: filename and dimensions
  let line1 = '';
  if (photo.filename) {
    line1 += `File: ${photo.filename}`;
  }
  if (metadata && metadata.width && metadata.height) {
    line1 += line1 
      ? ` • ${metadata.width}×${metadata.height}`
      : `${metadata.width}×${metadata.height}`;
  }
  if (line1) metadataLines.push(line1);
  
  // Second line: date, camera, exposure
  let line2 = '';
  
  // Date taken
  if (metadata && metadata.takenAt) {
    try {
      const date = new Date(metadata.takenAt);
      if (!isNaN(date.getTime())) {
        line2 += `Taken: ${date.toLocaleString()}`;
      }
    } catch (e) {
      line2 += `Taken: ${metadata.takenAt}`;
    }
  }
  
  // Camera
  if (metadata && metadata.camera) {
    line2 += line2 ? ` • Camera: ${metadata.camera}` : `Camera: ${metadata.camera}`;
  }
  
  // Exposure
  let exposureInfo = '';
  if (metadata) {
    if (metadata.fNumber) {
      let fNum = metadata.fNumber;
      if (Array.isArray(fNum) && fNum.length === 2) {
        fNum = `f/${(fNum[0] / fNum[1]).toFixed(1)}`;
      } else if (typeof fNum === 'number') {
        fNum = `f/${fNum.toFixed(1)}`;
      }
      exposureInfo += fNum;
    }
    
    if (metadata.exposureTime) {
      let eTime = metadata.exposureTime;
      if (Array.isArray(eTime) && eTime.length === 2) {
        exposureInfo += exposureInfo 
          ? `, 1/${Math.round(eTime[1] / eTime[0])}s`
          : `1/${Math.round(1 / eTime[0])}s`;
      } else if (typeof eTime === 'number' && eTime < 1) {
        exposureInfo += exposureInfo 
          ? `, 1/${Math.round(1 / eTime)}s`
          : `1/${Math.round(1 / eTime)}s`;
      } else {
        exposureInfo += exposureInfo ? `, ${eTime}s` : `${eTime}s`;
      }
    }
    
    if (metadata.iso) {
      exposureInfo += exposureInfo ? `, ISO ${metadata.iso}` : `ISO ${metadata.iso}`;
    }
  }
  
  if (exposureInfo) {
    line2 += line2 ? ` • ${exposureInfo}` : exposureInfo;
  }
  
  if (line2) metadataLines.push(line2);
  
  // Third line: GPS if available
  if (metadata && (metadata.latitude !== undefined && metadata.longitude !== undefined)) {
    const lat = metadata.latitude;
    const lon = metadata.longitude;
    const latStr = Math.abs(lat).toFixed(6) + (lat >= 0 ? '°N' : '°S');
    const lonStr = Math.abs(lon).toFixed(6) + (lon >= 0 ? '°E' : '°W');
    metadataLines.push(`Location: ${latStr}, ${lonStr}`);
  }
  
  // Output metadata lines
  metadataLines.forEach((line, index) => {
    doc.text(line, x, y + (index * 10), { width, align: 'left' });
  });
};

/**
 * Embed a photo in the PDF with a caption
 * @param {Object} doc - The PDFKit document
 * @param {Object} photo - The photo object
 * @param {Number} x - X position
 * @param {Number} y - Y position
 * @param {Number} width - Width of the photo
 * @param {Number} height - Height of the photo
 * @param {String} caption - Optional caption
 * @returns {Promise} Promise that resolves when the photo is embedded
 */
const embedPhoto = async (doc, photo, x, y, width, height, caption) => {
  try {
    // Log the photo object to help with debugging
    logger.info(`Attempting to embed photo: ${JSON.stringify({
      id: photo._id || photo.id, 
      gridfsId: photo.gridfsId,
      filename: photo.filename,
      path: photo.path
    })}`);
    
    // Get the photo path
    const photoPath = findPhotoPath(photo);
    
    if (!photoPath) {
      logger.warn(`No valid path found for photo: ${JSON.stringify({
        id: photo._id || photo.id,
        gridfsId: photo.gridfsId,
        filename: photo.filename,
        path: photo.path
      })}`);
      addMissingImagePlaceholder(doc, x, y, width, height, caption);
      return;
    }
    
    // Check if it's a GridFS path
    if (photoPath.startsWith('gridfs:')) {
      await embedGridFSPhoto(doc, photoPath, photo, x, y, width, height, caption);
    } 
    // Handle filename-based lookup
    else if (photoPath.startsWith('filename:')) {
      await embedPhotoByFilename(doc, photoPath, x, y, width, height, caption);
    }
    // Handle URL-based images
    else if (photoPath.startsWith('url:')) {
      logger.info(`Adding placeholder for URL-based image that can't be embedded directly`);
      // For now, add a placeholder - PDFKit can't load remote URLs directly
      addMissingImagePlaceholder(doc, x, y, width, height, caption || "Remote image cannot be embedded");
    }
    else {
      // Unrecognized path format - use placeholder
      logger.warn(`Unrecognized photo path format: ${photoPath}`);
      addMissingImagePlaceholder(doc, x, y, width, height, caption);
    }
  } catch (error) {
    logger.error(`Error embedding photo: ${error.message}`);
    addMissingImagePlaceholder(doc, x, y, width, height, caption);
  }
};

/**
 * Embed a photo from GridFS
 * @param {Object} doc - The PDFKit document
 * @param {String} photoPath - The GridFS path
 * @param {Object} photo - The photo object
 * @param {Number} x - X position
 * @param {Number} y - Y position
 * @param {Number} width - Width of the photo
 * @param {Number} height - Height of the photo
 * @param {String} caption - Optional caption
 * @returns {Promise} Promise that resolves when the photo is embedded
 */
const embedGridFSPhoto = async (doc, photoPath, photo, x, y, width, height, caption) => {
  const fileId = photoPath.replace('gridfs:', '');
  logger.info(`Loading photo from GridFS with ID: ${fileId}`);
  
  try {
    // Get GridFS module
    const gridfs = require('../../utils/gridfs');
    
    // Create a temporary buffer to store the image data
    const chunks = [];
    
    // Get a download stream from GridFS - this was the issue
    // We need to convert the string ID to a MongoDB ObjectId
    const mongoose = require('mongoose');
    let objId;
    
    try {
      objId = new mongoose.Types.ObjectId(fileId);
      logger.info(`Created ObjectId for GridFS: ${objId}`);
    } catch (idError) {
      logger.error(`Invalid ObjectId format: ${fileId}`, idError);
      addMissingImagePlaceholder(doc, x, y, width, height, caption || "Invalid photo ID");
      return;
    }
    
    // Get the download stream with the proper ObjectId
    let downloadStream;
    try {
      downloadStream = await gridfs.downloadFile(objId);
    } catch (downloadError) {
      logger.error(`Error downloading file with ID ${fileId}: ${downloadError.message}`);
      logger.info(`Attempting to find file by alternative methods...`);
      
      // If direct ID lookup fails, try to find the file by other means
      downloadStream = null;
    }
    
    // If direct lookup failed, try to find the file by other means
    if (!downloadStream) {
      try {
        // Try to find the file by searching for it in GridFS
        const files = await gridfs.findFiles({ 
          $or: [
            { 'metadata.originalFileId': objId },
            { 'metadata.reportId': photo.reportId }
          ]
        });
        
        if (files && files.length > 0) {
          // Use the first matching file
          logger.info(`Found alternative file in GridFS: ${files[0]._id}`);
          downloadStream = await gridfs.downloadFile(files[0]._id);
        } else {
          logger.error(`No alternative files found for photo ID: ${fileId}`);
        }
      } catch (searchError) {
        logger.error(`Error searching for alternative files: ${searchError.message}`);
      }
    }
    
    // If we still don't have a download stream, show a placeholder
    if (!downloadStream) {
      logger.error(`Failed to get download stream for photo ID: ${fileId}`);
      addMissingImagePlaceholder(doc, x, y, width, height, caption || "Photo not found");
      return;
    }
    
    // Set up promise to resolve when download is complete
    await new Promise((resolve, reject) => {
      downloadStream.on('data', (chunk) => {
        chunks.push(chunk);
        // Log the first chunk to confirm data is coming through
        if (chunks.length === 1) {
          logger.info(`Received first chunk of data for photo ID: ${fileId}, size: ${chunk.length} bytes`);
        }
      });
      
      downloadStream.on('error', (error) => {
        logger.error(`Error downloading photo from GridFS: ${error.message}`);
        reject(error);
      });
      
      downloadStream.on('end', () => {
        try {
          if (chunks.length === 0) {
            logger.error(`No data received for photo ID: ${fileId}`);
            addMissingImagePlaceholder(doc, x, y, width, height, caption || "Empty photo data");
            resolve();
            return;
          }
          
          const imageData = Buffer.concat(chunks);
          logger.info(`Received ${imageData.length} bytes for photo ID: ${fileId}`);
          
          // Check if we have valid image data
          if (imageData.length < 100) {
            logger.error(`Suspiciously small image data (${imageData.length} bytes) for photo ID: ${fileId}`);
            addMissingImagePlaceholder(doc, x, y, width, height, caption || "Invalid image data");
            resolve();
            return;
          }
          
          // Embed the image in the PDF from buffer
          try {
            doc.image(imageData, x, y, {
              width: width,
              height: height,
              align: 'center',
              valign: 'center'
            });
            logger.info(`Successfully embedded image for photo ID: ${fileId}`);
          } catch (imageError) {
            logger.error(`PDFKit error embedding image: ${imageError.message}`, imageError);
            addMissingImagePlaceholder(doc, x, y, width, height, caption || "Image format error");
            resolve();
            return;
          }
          
          // Add caption below photo if provided
          if (caption) {
            const captionY = y + height + 10;
            doc.fontSize(10).text(caption, x, captionY, { 
              width: width, 
              align: 'center' 
            });
          }
          
          resolve();
        } catch (err) {
          logger.error(`Error embedding photo from GridFS: ${err.message}`, err);
          addMissingImagePlaceholder(doc, x, y, width, height, caption);
          resolve(); // Still resolve to continue processing
        }
      });
    });
  } catch (error) {
    logger.error(`Failed to embed GridFS photo: ${error.message}`, error);
    addMissingImagePlaceholder(doc, x, y, width, height, caption);
  }
};

/**
 * Embed a photo by filename
 * @param {Object} doc - The PDFKit document
 * @param {String} photoPath - The filename path
 * @param {Number} x - X position
 * @param {Number} y - Y position
 * @param {Number} width - Width of the photo
 * @param {Number} height - Height of the photo
 * @param {String} caption - Optional caption
 * @returns {Promise} Promise that resolves when the photo is embedded
 */
const embedPhotoByFilename = async (doc, photoPath, x, y, width, height, caption) => {
  const filename = photoPath.replace('filename:', '');
  logger.info(`Searching for photo by filename: ${filename}`);
  
  try {
    // Get GridFS module
    const gridfs = require('../../utils/gridfs');
    
    // Try to find the file by filename - use more flexible matching
    let files = await gridfs.findFiles({ 
      $or: [
        { filename: filename },
        { 'metadata.originalName': filename },
        // Try with and without the timestamp prefix that might be added during upload
        { filename: { $regex: filename.replace(/^\d+-/, '') } },
        // Try matching just the base filename without the timestamp
        { filename: { $regex: filename.split('-').slice(1).join('-') } },
        // Try more aggressive partial matching of the filename
        { filename: { $regex: filename.replace(/[^a-zA-Z0-9]/g, '.*') } }
      ]
    });
    
    if (!files || files.length === 0) {
      logger.error(`No files found with filename: ${filename}`);
      
      // Try one more approach - extract just the core filename without timestamps
      const coreFilename = filename.replace(/^\d+-/, '').replace(/^.*?__/, '');
      logger.info(`Trying again with core filename: ${coreFilename}`);
      
      // Try to get all files and do some manual filtering
      const allFiles = await gridfs.findFiles({});
      logger.info(`Checking all ${allFiles.length} files for potential matches`);
      
      // Find files where at least part of the filename matches
      files = allFiles.filter(file => {
        // Convert both to lowercase and remove common prefixes for better matching
        const normalizedTarget = coreFilename.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
        const normalizedFilename = file.filename.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
        
        // Check if one contains the other
        return normalizedFilename.includes(normalizedTarget) || 
               normalizedTarget.includes(normalizedFilename);
      });
      
      if (files.length > 0) {
        logger.info(`Found ${files.length} potential matches using fuzzy filename matching`);
      } else {
        logger.error(`Still no files found with core filename: ${coreFilename}`);
        addMissingImagePlaceholder(doc, x, y, width, height, caption || "Photo not found");
        return;
      }
    }
    
    // Use the first matching file
    const fileId = files[0]._id;
    logger.info(`Found file in GridFS by filename, ID: ${fileId}`);
    
    // Now that we found the file, use the GridFS embed function
    await embedGridFSPhoto(doc, `gridfs:${fileId}`, { _id: fileId }, x, y, width, height, caption);
  } catch (error) {
    logger.error(`Failed to embed photo by filename: ${error.message}`, error);
    addMissingImagePlaceholder(doc, x, y, width, height, caption);
  }
};

module.exports = {
  findPhotoPath,
  embedPhoto,
  addMissingImagePlaceholder,
  addPhotoMetadata
}; 