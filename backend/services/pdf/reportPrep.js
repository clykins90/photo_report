/**
 * Report preparation module for PDF generation
 * Handles data normalization and page structure creation
 */
const logger = require('../../utils/logger');

/**
 * Create dummy photo data based on descriptive text to display placeholders
 * @param {Object} report - The report data
 * @returns {Array} Array of photo placeholder objects
 */
const createPhotoPlaceholdersFromText = (report) => {
  // Add detailed debugging information
  logger.info(`Report photos structure check: report.photos exists: ${!!report.photos}, length: ${report.photos?.length || 0}`);
  
  if (report.photos && report.photos.length > 0) {
    // Log the first photo to see its structure
    logger.info(`First photo structure: ${JSON.stringify(report.photos[0])}`);
    
    // Count photos with specific properties
    const photosWithGridfsId = report.photos.filter(p => p.gridfsId).length;
    const photosWithPath = report.photos.filter(p => p.path).length;
    const photosWithBlobPath = report.photos.filter(p => p.path && p.path.startsWith('blob:')).length;
    
    logger.info(`Photos with gridfsId: ${photosWithGridfsId}, with path: ${photosWithPath}, with blob path: ${photosWithBlobPath}`);
  }
  
  // If report already has photos, don't add placeholders
  // Check specifically for valid photos with gridfsId
  const validPhotos = report.photos && report.photos.filter(p => {
    const hasGridfsId = !!p.gridfsId;
    const hasValidPath = p._id && (!p.path || !p.path.startsWith('blob:'));
    const hasValidFilename = p.filename && (!p.path || !p.path.startsWith('blob:'));
    
    // Log each photo's validation status for the first few photos
    if (report.photos.indexOf(p) < 5) {
      logger.info(`Photo validation: _id: ${p._id}, gridfsId: ${p.gridfsId}, path: ${p.path}, isValid: ${hasGridfsId || hasValidPath || hasValidFilename}`);
    }
    
    return hasGridfsId || hasValidPath || hasValidFilename;
  });
  
  if (validPhotos && validPhotos.length > 0) {
    logger.info(`Found ${validPhotos.length} valid photos with GridFS IDs or valid paths`);
    return report.photos;
  }
  
  logger.info('No actual photos found in report, generating placeholders from text');
  
  const photoPlaceholders = [];
  
  // Try to extract photo mentions from summary
  if (report.summary) {
    // Look for mentions of "photo", "image", "picture" followed by numbers or descriptions
    const summaryMatches = report.summary.match(/(\d+)\s+(photos|images|pictures)/gi);
    if (summaryMatches && summaryMatches.length > 0) {
      // Extract the number of photos mentioned
      const photoCountMatch = summaryMatches[0].match(/(\d+)/);
      if (photoCountMatch && photoCountMatch[1]) {
        const photoCount = parseInt(photoCountMatch[1], 10);
        logger.info(`Found mention of ${photoCount} photos in summary`);
        
        // Create placeholder photos based on the mentioned count
        for (let i = 0; i < Math.min(photoCount, 40); i++) {
          photoPlaceholders.push({
            id: `placeholder-${i}`,
            caption: `Placeholder for photo ${i+1}`,
            description: `This is a placeholder for a photo mentioned in the report but not available in the data`,
          });
        }
      }
    }
  }
  
  // Add placeholders from damages if available
  if (report.damages && report.damages.length > 0) {
    report.damages.forEach((damage, index) => {
      if (typeof damage === 'object' && damage.description) {
        photoPlaceholders.push({
          id: `damage-placeholder-${index}`,
          caption: `${damage.type || 'Damage'} (${damage.severity || 'unknown severity'})`,
          description: damage.description,
        });
      }
    });
  }
  
  return photoPlaceholders;
};

/**
 * Prepare report data for PDF generation
 * @param {Object} report - The original report data
 * @returns {Object} Prepared report data
 */
const prepareReportData = async (report) => {
  // Log the report structure to debug
  logger.info(`Report in prepareReportData: ${JSON.stringify({
    hasId: !!report._id,
    hasTitle: !!report.title,
    hasPhotos: !!report.photos,
    photoCount: report.photos?.length || 0
  })}`);
  
  // CRITICAL FIX: Ensure we're not losing data when creating the preparedReport
  // Handle Mongoose documents or regular objects properly
  let preparedReport;
  
  try {
    // If it's a Mongoose document with toObject method
    if (report.toObject) {
      preparedReport = report.toObject();
      logger.info('Using toObject() to convert Mongoose document');
    } else if (report.toJSON) {
      // Some objects have toJSON instead
      preparedReport = report.toJSON();
      logger.info('Using toJSON() to convert document');
    } else {
      // Otherwise use manual deep copy with JSON
      preparedReport = JSON.parse(JSON.stringify(report));
      logger.info('Using JSON parse/stringify for deep copy');
    }
  } catch (err) {
    // If any error in conversion, fall back to simple object copy
    logger.error(`Error in report conversion: ${err.message}`);
    preparedReport = { ...report };
    
    // Make sure we preserve the photos array specifically
    if (report.photos && Array.isArray(report.photos)) {
      preparedReport.photos = [...report.photos];
    }
  }
  
  // Log again to verify the photos were copied correctly
  logger.info(`PreparedReport after copy: ${JSON.stringify({
    hasId: !!preparedReport._id,
    hasTitle: !!preparedReport.title,
    hasPhotos: !!preparedReport.photos,
    photoCount: preparedReport.photos?.length || 0
  })}`);
  
  // If report mentions photos but doesn't have actual photo data, create placeholders
  if (!preparedReport.photos || preparedReport.photos.length === 0) {
    preparedReport.photos = createPhotoPlaceholdersFromText(preparedReport);
    logger.info(`Added ${preparedReport.photos.length} photo placeholders`);
  }
  
  // Process photos to ensure they have GridFS IDs
  if (preparedReport.photos && preparedReport.photos.length > 0) {
    try {
      const gridfs = require('../../utils/gridfs');
      const mongoose = require('mongoose');
      
      // Get all files in GridFS - this is the simplest approach
      logger.info(`Getting all files in GridFS to match with photos`);
      const allFiles = await gridfs.findFiles({});
      logger.info(`Found ${allFiles.length} total files in GridFS`);
      
      // Create maps for quick lookup
      const idMap = {};
      const filenameMap = {};
      
      // Map files by ID and filename for quick lookup
      allFiles.forEach(file => {
        idMap[file._id.toString()] = file;
        if (file.filename) {
          filenameMap[file.filename] = file;
          // Also store without timestamp prefix
          const withoutPrefix = file.filename.replace(/^\d+-/, '');
          if (withoutPrefix !== file.filename) {
            filenameMap[withoutPrefix] = file;
          }
        }
      });
      
      // Process each photo to ensure it has a valid GridFS ID
      preparedReport.photos = await Promise.all(preparedReport.photos.map(async (photo) => {
        // Clone to avoid modifying the original
        const newPhoto = { ...photo };
        
        // Skip if it already has a GridFS ID
        if (photo.gridfsId) {
          logger.info(`Photo already has gridfsId: ${photo.gridfsId}`);
          return newPhoto;
        }
        
        // Try to look up by _id field
        const photoId = (photo._id || photo.id)?.toString();
        if (photoId && idMap[photoId]) {
          logger.info(`Found GridFS file by photo ID: ${photoId}`);
          newPhoto.gridfsId = photoId;
          return newPhoto;
        }
        
        // Try to look up by filename
        if (photo.filename && filenameMap[photo.filename]) {
          const gridFSFile = filenameMap[photo.filename];
          logger.info(`Found GridFS file by filename: ${photo.filename} -> ${gridFSFile._id}`);
          newPhoto.gridfsId = gridFSFile._id.toString();
          return newPhoto;
        }
        
        // Try to look up by filename without timestamp prefix
        if (photo.filename) {
          const withoutPrefix = photo.filename.replace(/^\d+-/, '');
          if (withoutPrefix !== photo.filename && filenameMap[withoutPrefix]) {
            const gridFSFile = filenameMap[withoutPrefix];
            logger.info(`Found GridFS file by stripped filename: ${withoutPrefix} -> ${gridFSFile._id}`);
            newPhoto.gridfsId = gridFSFile._id.toString();
            return newPhoto;
          }
          
          // If we still don't have a match, try a more advanced lookup by comparing filenames
          for (const file of allFiles) {
            // Normalize both filenames for comparison (remove timestamps, special chars)
            const normalizedPhotoName = photo.filename.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
            const normalizedFileName = file.filename.toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
            
            // If filenames are similar enough
            if (normalizedFileName.includes(normalizedPhotoName) || 
                normalizedPhotoName.includes(normalizedFileName)) {
              logger.info(`Found GridFS file with similar filename: ${photo.filename} ~ ${file.filename}`);
              newPhoto.gridfsId = file._id.toString();
              return newPhoto;
            }
          }
        }
        
        // Log if we couldn't match
        logger.warn(`Couldn't match photo to GridFS file: ${JSON.stringify({
          id: photo._id || photo.id,
          filename: photo.filename,
          path: photo.path
        })}`);
        
        return newPhoto;
      }));
    } catch (err) {
      logger.error(`Error processing photos for GridFS IDs: ${err.message}`);
    }
  }
  
  return preparedReport;
};

/**
 * Create the page structure for the PDF
 * @param {Object} report - The prepared report data
 * @returns {Array} Array of page objects
 */
const createPageStructure = async (report) => {
  // Debug logging
  logger.info(`Report in createPageStructure: ${JSON.stringify({
    hasId: !!report._id,
    hasTitle: !!report.title,
    hasPhotos: !!report.photos,
    photoCount: report.photos?.length || 0
  })}`);

  const pages = [];
  
  // ===== Cover Page =====
  pages.push({ type: 'cover', content: { report } });
  
  // ===== Summary Page =====
  if (report.summary) {
    pages.push({ type: 'summary', content: { report } });
  }
  
  // ===== Damages Section =====
  if (report.damages && report.damages.length > 0) {
    let damages = report.damages;
    if (!Array.isArray(damages)) {
      damages = typeof damages === 'string' ? [{ description: damages }] : [];
    }
    
    if (damages.length > 0) {
      // First damages page
      pages.push({ 
        type: 'damages', 
        content: { 
          title: 'Damage Assessment',
          damages: damages.slice(0, 3)
        }
      });
      
      // Additional damages pages if needed
      for (let i = 3; i < damages.length; i += 3) {
        pages.push({ 
          type: 'damages', 
          content: { 
            title: 'Damage Assessment (Continued)',
            damages: damages.slice(i, i + 3)
          }
        });
      }
    }
  }
  
  // ===== Recommendations =====
  if (report.recommendations && report.recommendations.length > 0) {
    let recommendations = report.recommendations;
    if (typeof recommendations === 'string') {
      recommendations = [{ description: recommendations }];
    }
    
    if (Array.isArray(recommendations) && recommendations.length > 0) {
      // First recommendations page
      pages.push({ 
        type: 'recommendations', 
        content: { 
          title: 'Recommendations',
          recommendations: recommendations.slice(0, 3)
        }
      });
      
      // Additional recommendations pages if needed
      for (let i = 3; i < recommendations.length; i += 3) {
        pages.push({ 
          type: 'recommendations', 
          content: { 
            title: 'Recommendations (Continued)',
            recommendations: recommendations.slice(i, i + 3)
          }
        });
      }
    }
  }
  
  // ===== Materials =====
  if (report.materials && report.materials.length > 0) {
    let materials = report.materials;
    if (typeof materials === 'string') {
      materials = [{ description: materials }];
    }
    
    if (Array.isArray(materials) && materials.length > 0) {
      // First materials page
      pages.push({ 
        type: 'materials', 
        content: { 
          title: 'Building Materials',
          materials: materials.slice(0, 3)
        }
      });
      
      // Additional materials pages if needed
      for (let i = 3; i < materials.length; i += 3) {
        pages.push({ 
          type: 'materials', 
          content: { 
            title: 'Building Materials (Continued)',
            materials: materials.slice(i, i + 3)
          }
        });
      }
    }
  }
  
  // ===== Photo Gallery =====
  if (report.photos && report.photos.length > 0) {
    const photoHandler = require('./photoHandler');
    
    // Debug logging of photos array
    logger.info(`Processing ${report.photos.length} photos for gallery pages`);
    if (report.photos.length > 0) {
      logger.info(`Sample photo structure: ${JSON.stringify(report.photos[0])}`);
    }
    
    // First, attempt to find GridFS files for blob URLs by filename
    const gridfs = require('../../utils/gridfs');
    const mongoose = require('mongoose');
    
    // Get all files in GridFS to match against photo filenames
    logger.info(`Fetching all files from GridFS to match with photos`);
    const allGridFSFiles = await gridfs.findFiles({});
    logger.info(`Found ${allGridFSFiles.length} total files in GridFS`);
    
    // Create a map of filenames to GridFS IDs for quick lookup
    const filenameToGridFSMap = {};
    allGridFSFiles.forEach(file => {
      if (file.filename) {
        filenameToGridFSMap[file.filename] = file._id;
        // Also map variations of the filename without timestamp prefixes
        const withoutTimestamp = file.filename.replace(/^\d+-/, '');
        filenameToGridFSMap[withoutTimestamp] = file._id;
      }
    });
    
    // Update each photo with a gridfsId if we can match it by filename
    report.photos.forEach(photo => {
      // If already has gridfsId, don't modify
      if (photo.gridfsId) return;
      
      // If has filename but no gridfsId, try to find it
      if (photo.filename) {
        const gridFSId = filenameToGridFSMap[photo.filename];
        if (gridFSId) {
          logger.info(`Found GridFS ID ${gridFSId} for photo with filename ${photo.filename}`);
          photo.gridfsId = gridFSId.toString();
        } else {
          // Try with variations of the filename
          const withoutTimestamp = photo.filename.replace(/^\d+-/, '');
          const secondTry = filenameToGridFSMap[withoutTimestamp];
          if (secondTry) {
            logger.info(`Found GridFS ID ${secondTry} using filename without timestamp: ${withoutTimestamp}`);
            photo.gridfsId = secondTry.toString();
          } else {
            logger.warn(`Could not find GridFS ID for photo with filename ${photo.filename}`);
          }
        }
      }
    });
    
    // Filter to only include photos with valid paths
    const availablePhotos = report.photos.filter(photo => {
      // Log each photo's details to help with debugging
      logger.info(`Processing photo: ${JSON.stringify({
        id: photo.id || photo._id,
        gridfsId: photo.gridfsId,
        filename: photo.filename,
        url: photo.url,
        path: photo.path,
        hasAnalysis: !!photo.aiAnalysis
      })}`);
      
      // If photo has a gridfsId, it's valid - this is the highest priority check
      if (photo.gridfsId) {
        logger.info(`Photo has gridfsId: ${photo.gridfsId}`);
        return true;
      }
      
      // If photo has a valid MongoDB ObjectId as _id and no blob URL, consider it valid
      if (photo._id && (!photo.path || !photo.path.startsWith('blob:'))) {
        try {
          const mongoose = require('mongoose');
          const isValidObjectId = mongoose.Types.ObjectId.isValid(photo._id);
          if (isValidObjectId) {
            logger.info(`Photo has valid ObjectId (_id: ${photo._id}) and no blob URL`);
            return true;
          }
        } catch (err) {
          // Ignore errors, continue with other checks
        }
      }
      
      // Check if the photo has a blob URL that needs to be replaced with a GridFS ID
      if (photo.path && photo.path.startsWith('blob:') && photo.filename) {
        logger.info(`Found blob URL in photo path, will use filename instead: ${photo.filename}`);
        // We'll use the filename to look up in GridFS, so this is a valid photo
        return true;
      }
      
      // Try to get a valid path for the photo
      const photoPath = photoHandler.findPhotoPath(photo);
      
      // Log the result
      logger.info(`Photo path found: ${!!photoPath} for photo ID: ${photo.id || photo._id || 'unknown'}`);
      
      // Only include photos with valid paths (should be GridFS paths)
      return photoPath !== null;
    });
    
    logger.info(`Available photos with valid paths: ${availablePhotos.length} of ${report.photos.length}`);
    
    if (availablePhotos.length > 0) {
      // Sort photos with analyses first - using aiAnalysis instead of analysis
      const analysisPhotos = availablePhotos.filter(photo => 
        photo.aiAnalysis && (photo.aiAnalysis.description || photo.aiAnalysis.damageDetected)
      );
      const regularPhotos = availablePhotos.filter(photo => 
        !(photo.aiAnalysis && (photo.aiAnalysis.description || photo.aiAnalysis.damageDetected))
      );
      
      // Add large photo analysis pages
      for (let i = 0; i < analysisPhotos.length; i++) {
        pages.push({ 
          type: 'photo_large', 
          content: {
            title: i === 0 ? 'Property Photos - Analysis' : 'Property Photos - Analysis (Continued)',
            photo: analysisPhotos[i]
          }
        });
      }
      
      // Add grid photo pages
      for (let i = 0; i < regularPhotos.length; i += 4) {
        const pagePhotos = regularPhotos.slice(i, i + 4);
        if (pagePhotos.length > 0) {
          pages.push({ 
            type: 'photo_grid', 
            content: {
              title: analysisPhotos.length === 0 && i === 0 ? 
                'Property Photos' : 'Property Photos (Continued)',
              photos: pagePhotos
            }
          });
        }
      }
    }
  }
  
  return pages;
};

module.exports = {
  prepareReportData,
  createPageStructure
}; 