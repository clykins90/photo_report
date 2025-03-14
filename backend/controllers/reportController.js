const { validationResult } = require('express-validator');
const path = require('path');
const fs = require('fs');
const Report = require('../models/Report');
const User = require('../models/User');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const pdfGenerationService = require('../services/pdfGenerationService');
const reportAIService = require('../services/reportAIService');
const crypto = require('crypto');
const gridfs = require('../utils/gridfs'); // Add GridFS utility for photo deletion
const mongoose = require('mongoose');

/**
 * Normalize severity value to match the schema's enum values
 * @param {string} severity - The severity value to normalize
 * @returns {string} - A normalized severity value
 */
const normalizeSeverity = (severity) => {
  if (!severity) return 'minor';
  
  // Convert to lowercase for case-insensitive comparison
  const lowerSeverity = String(severity).toLowerCase().trim();
  
  // Handle exact matches first
  if (lowerSeverity === 'minor') return 'minor';
  if (lowerSeverity === 'moderate') return 'moderate';
  if (lowerSeverity === 'severe') return 'severe';
  
  // Handle combination cases
  if (lowerSeverity.includes('moderate') && lowerSeverity.includes('severe')) {
    return 'severe'; // Handle "moderate to severe" case
  }
  if (lowerSeverity.includes('minor') && lowerSeverity.includes('moderate')) {
    return 'moderate'; // Handle "minor to moderate" case
  }
  
  // Handle partial matches
  if (lowerSeverity.includes('minor') || lowerSeverity.includes('low')) {
    return 'minor';
  } else if (lowerSeverity.includes('moderate') || lowerSeverity.includes('medium')) {
    return 'moderate';
  } else if (lowerSeverity.includes('major') || lowerSeverity.includes('high') || lowerSeverity.includes('severe')) {
    return 'severe';
  } else if (lowerSeverity.includes('critical')) {
    return 'severe'; // Map critical to the highest severity level
  }
  
  // Default to 'minor' if no match
  logger.warn(`Unrecognized severity value: "${severity}" - defaulting to "minor"`);
  return 'minor';
};

/**
 * Create a new report
 * @route POST /api/reports
 * @access Private
 */
const createReport = async (req, res, next) => {
  try {
    console.log('Report creation data:', req.body);
    console.log('Auth user info:', req.user);

    // Get user from DB to get company info
    const user = await User.findById(req.user.id);
    console.log('Found user from DB:', user);

    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    // Check if company info exists
    // Allow placeholder values for company name so users can still create reports
    if (!user.company && !req.body.company) {
      throw new ApiError(400, 'You must have company information in your profile to create reports');
    }
    
    // Accept placeholder company information from the request body
    let companyInfo = user.company;
    if (!companyInfo || !companyInfo.name) {
      if (req.body.company && (req.body.company.name || req.body.company === "[COMPANY NAME]")) {
        console.log('Using placeholder company information from request');
        companyInfo = req.body.company;
      } else {
        console.log('No valid company information found in user profile or request');
        // Still allow report creation with placeholder company name
        companyInfo = {
          name: "[COMPANY NAME]",
          address: {
            street: "[STREET ADDRESS]",
            city: "[CITY]",
            state: "[STATE]",
            zipCode: "[ZIP]"
          }
        };
      }
    }
    
    // Format photos to match the schema requirements
    let formattedPhotos = [];
    if (req.body.photos && Array.isArray(req.body.photos)) {
      console.log('Processing photos array:', req.body.photos);
      
      formattedPhotos = req.body.photos
        .filter(photo => photo) // Filter out null/undefined photos
        .map(photo => {
          console.log('Processing photo:', photo);
          
          // Try to extract required fields from various possible formats
          const path = photo.path || photo.url || photo.preview || '';
          
          // Use the original filename if available, don't generate a new one
          // This will preserve UUIDs from the upload process
          const filename = photo.filename || photo.displayName || photo.name || '';
          
          if (!filename) {
            console.log('Warning: Photo missing filename, this may cause retrieval issues');
          }
          
          // Handle _id field - ensure it's a valid ObjectId
          let photoId;
          try {
            photoId = photo._id ? new mongoose.Types.ObjectId(photo._id) : new mongoose.Types.ObjectId();
          } catch (err) {
            console.log('Invalid photo _id, generating new one');
            photoId = new mongoose.Types.ObjectId();
          }
          
          // Normalize aiAnalysis if present
          let aiAnalysis = null;
          if (photo.aiAnalysis || photo.analysis) {
            const analysis = photo.aiAnalysis || photo.analysis || {};
            aiAnalysis = {
              description: analysis.description || '',
              tags: Array.isArray(analysis.tags) ? analysis.tags : [],
              damageDetected: !!analysis.damageDetected,
              confidence: analysis.confidence || 0,
              severity: normalizeSeverity(analysis.severity)
            };
          }
          
          return {
            _id: photoId,
            path,
            filename,
            section: photo.section || 'Uncategorized',
            userDescription: photo.userDescription || photo.description || '',
            aiAnalysis
          };
        });
    }
    
    // Normalize damages severity values if present
    let normalizedDamages = [];
    if (req.body.damages && Array.isArray(req.body.damages)) {
      normalizedDamages = req.body.damages.map(damage => ({
        ...damage,
        severity: normalizeSeverity(damage.severity)
      }));
    }

    // Create report with user info (which now contains company details)
    const report = new Report({
      ...req.body,
      user: req.user.id,
      // Explicitly set company info from our prepared variable
      company: companyInfo.name,
      recommendations: req.body.recommendations 
        ? (Array.isArray(req.body.recommendations) 
            ? req.body.recommendations.join('\n\n') 
            : String(req.body.recommendations))
        : undefined,
      materials: req.body.materials || [],
      tags: req.body.tags || [],
      photos: formattedPhotos,
      damages: normalizedDamages
    });

    // Validate report
    const validationError = report.validateSync();
    if (validationError) {
      console.log('Validation error:', validationError);
      throw new ApiError(400, validationError.message);
    }

    // Save report
    await report.save();

    res.status(201).json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('Error in createReport:', {
      message: error.message,
      stack: error.stack
    });
    next(error);
  }
};

/**
 * Get all reports for the current user
 * @route GET /api/reports
 * @access Private
 */
const getReports = async (req, res, next) => {
  try {
    // Get query parameters
    const { status, limit = 10, page = 1 } = req.query;
    
    // Build query
    const query = { user: req.user.id };
    if (status) {
      query.status = status;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get reports
    const reports = await Report.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit))
      .skip(skip)
      .populate('user', 'firstName lastName email company');

    // Get total count
    const total = await Report.countDocuments(query);

    res.status(200).json({
      success: true,
      count: reports.length,
      total,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
      data: reports,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get report by ID
 * @route GET /api/reports/:id
 * @access Private
 */
const getReport = async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id)
      .populate('user', 'firstName lastName email company');

    if (!report) {
      throw new ApiError(404, 'Report not found');
    }

    // Check if user is authorized to access this report
    if (
      report.user._id.toString() !== req.user.id &&
      req.user.role !== 'admin'
    ) {
      throw new ApiError(403, 'Not authorized to access this report');
    }

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update a report
 * @route PUT /api/reports/:id
 * @access Private
 */
const updateReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new ApiError(400, 'Invalid report ID');
    }
    
    // Get the report
    const report = await Report.findById(id);
    
    if (!report) {
      throw new ApiError(404, 'Report not found');
    }
    
    // Check if user is authorized to update this report
    if (report.user.toString() !== req.user.id && req.user.role !== 'admin') {
      throw new ApiError(403, 'Not authorized to update this report');
    }
    
    // Format photos to match the schema requirements
    let updatedPhotos = [];
    
    // If photos are provided in the request, process them
    if (req.body.photos && Array.isArray(req.body.photos)) {
      console.log(`Processing ${req.body.photos.length} photos for update`);
      
      updatedPhotos = req.body.photos
        .filter(photo => photo) // Filter out null/undefined photos
        .map(photo => {
          // Try to extract required fields from various possible formats
          const path = photo.path || photo.url || photo.preview || '';
          
          // Use the original filename if available, don't generate a new one
          const filename = photo.filename || photo.displayName || photo.name || '';
          
          if (!path || !filename) {
            console.log('Warning: Photo missing required fields:', { path, filename });
          }
          
          // Handle _id field - ensure it's a valid ObjectId
          let photoId;
          try {
            photoId = photo._id ? new mongoose.Types.ObjectId(photo._id) : new mongoose.Types.ObjectId();
          } catch (err) {
            console.log('Invalid photo _id, generating new one');
            photoId = new mongoose.Types.ObjectId();
          }
          
          // Normalize aiAnalysis if present
          let aiAnalysis = null;
          if (photo.aiAnalysis || photo.analysis) {
            const analysis = photo.aiAnalysis || photo.analysis || {};
            aiAnalysis = {
              description: analysis.description || '',
              tags: Array.isArray(analysis.tags) ? analysis.tags : [],
              damageDetected: !!analysis.damageDetected,
              confidence: analysis.confidence || 0,
              severity: normalizeSeverity(analysis.severity)
            };
          }
          
          return {
            _id: photoId,
            path,
            filename,
            section: photo.section || 'Uncategorized',
            userDescription: photo.userDescription || photo.description || '',
            aiAnalysis
          };
        });
    } else {
      // If no photos in request, keep existing ones
      updatedPhotos = report.photos;
    }
    
    // Normalize damages severity values if present
    let normalizedDamages = report.damages;
    if (req.body.damages && Array.isArray(req.body.damages)) {
      normalizedDamages = req.body.damages.map(damage => ({
        ...damage,
        severity: normalizeSeverity(damage.severity)
      }));
    }

    // Create a new object with the original report as a base, then apply updates
    const updatedReport = {
      ...report.toObject(), // Convert Mongoose document to plain object
      // Update the fields that can be changed
      title: req.body.title !== undefined ? req.body.title : report.title,
      clientName: req.body.clientName !== undefined ? req.body.clientName : report.clientName,
      propertyAddress: req.body.propertyAddress || report.propertyAddress,
      inspectionDate: req.body.inspectionDate || report.inspectionDate,
      weather: req.body.weather || report.weather,
      summary: req.body.summary !== undefined ? req.body.summary : report.summary,
      damages: normalizedDamages,
      recommendations: req.body.recommendations !== undefined 
        ? (Array.isArray(req.body.recommendations) 
            ? req.body.recommendations.join('\n\n') 
            : String(req.body.recommendations)) 
        : report.recommendations,
      materials: req.body.materials !== undefined ? req.body.materials : report.materials,
      tags: req.body.tags || report.tags,
      photos: updatedPhotos,
      // Always preserve these fields
      user: report.user,
      createdAt: report.createdAt
    };

    // Remove _id from the updatedReport to avoid MongoDB errors
    delete updatedReport._id;
    
    console.log('Final report update data:', updatedReport);

    // Perform update
    const result = await Report.findByIdAndUpdate(
      id,
      updatedReport,
      { new: true, runValidators: true }
    );

    if (!result) {
      throw new ApiError(404, 'Report not found');
    }

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error in updateReport:', {
      message: error.message,
      stack: error.stack,
      path: req.path,
      method: req.method,
      body: req.body,
      headers: req.headers,
    });
    next(error);
  }
};

/**
 * Delete a report
 * @route DELETE /api/reports/:id
 * @access Private
 */
const deleteReport = async (req, res, next) => {
  try {
    const report = await Report.findById(req.params.id);

    if (!report) {
      throw new ApiError(404, 'Report not found');
    }

    // Check if user is authorized to delete this report
    if (report.user.toString() !== req.user.id && req.user.role !== 'admin') {
      throw new ApiError(403, 'Not authorized to delete this report');
    }

    // Explicitly delete all associated photos
    if (report.photos && report.photos.length > 0) {
      logger.info(`Deleting ${report.photos.length} photos associated with report ${report._id}`);
      
      for (const photo of report.photos) {
        if (!photo._id) continue;
        
        try {
          // Convert to ObjectId if needed
          const photoId = typeof photo._id === 'string' 
            ? new mongoose.Types.ObjectId(photo._id) 
            : photo._id;
          
          // Find all related files (original, optimized, thumbnail)
          const files = await gridfs.findFiles({
            $or: [
              { _id: photoId },
              { 'metadata.originalFileId': photoId.toString() },
              { 'metadata.reportId': report._id.toString() }
            ]
          });
          
          if (files && files.length > 0) {
            logger.info(`Found ${files.length} GridFS files related to photo ${photoId}`);
            
            // Delete each file
            for (const file of files) {
              await gridfs.deleteFile(file._id);
              logger.info(`Deleted GridFS file: ${file._id}`);
            }
          } else {
            logger.warn(`No GridFS files found for photo ${photoId}`);
          }
        } catch (err) {
          logger.error(`Error deleting photo ${photo._id}: ${err.message}`);
          // Continue with other photos even if one fails
        }
      }
    }

    // Now delete the report
    await Report.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      data: {},
      message: 'Report deleted successfully'
    });
  } catch (error) {
    logger.error(`Error deleting report: ${error.message}`, error);
    next(error);
  }
};

/**
 * Add photos to a report
 * @route POST /api/reports/:id/photos
 * @access Private
 */
const addPhotos = async (req, res, next) => {
  try {
    logger.info(`Received request to add photos to report ${req.params.id}`);
    
    // Check if any files were uploaded
    if (!req.files || req.files.length === 0) {
      throw new ApiError(400, 'No photos uploaded');
    }
    
    // Check user authorization for report modification
    const report = await Report.findById(req.params.id);
    if (!report) {
      throw new ApiError(404, 'Report not found');
    }
    
    // Ensure user has permission to modify this report
    if (report.user.toString() !== req.user.id && req.user.role !== 'admin') {
      throw new ApiError(403, 'Not authorized to modify this report');
    }
    
    // Add reportId to the request body so the photo upload can link photos to the report
    req.body.reportId = req.params.id;
    
    // Use our consolidated photo upload function
    const uploadPhotos = require('../controllers/photoController').uploadPhotos;
    await uploadPhotos(req, res, next);
    
    // The photo upload function will take care of everything including the response
    
  } catch (error) {
    next(error);
  }
};

/**
 * Generate a PDF for a report
 * @route GET /api/reports/:id/pdf
 * @access Private
 */
const generatePdf = async (req, res, next) => {
  try {
    logger.info(`Generating PDF for report ${req.params.id}`);
    
    // Find the report
    const report = await Report.findById(req.params.id)
      .populate('user', 'name email')
      .populate('company');
    
    if (!report) {
      throw new ApiError(404, 'Report not found');
    }
    
    // Check if user has permission to access this report
    if (report.user.toString() !== req.user.id && req.user.role !== 'admin') {
      throw new ApiError(403, 'Not authorized to access this report');
    }
    
    // Check if report has photos with blob URLs that need to be resolved
    if (report.photos && report.photos.length > 0) {
      const blobPhotos = report.photos.filter(p => p.path && p.path.startsWith('blob:'));
      
      if (blobPhotos.length > 0) {
        logger.info(`Report has ${blobPhotos.length} photos with blob URLs that need to be resolved`);
        
        // Try to find actual files in GridFS by filename
        const gridfs = require('../utils/gridfs');
        const allFiles = await gridfs.findFiles({});
        logger.info(`Found ${allFiles.length} files in GridFS to match against`);
        
        // Create a map of filenames to GridFS IDs
        const filenameMap = {};
        allFiles.forEach(file => {
          if (file.filename) {
            filenameMap[file.filename] = file._id;
          }
        });
        
        // Update any photos that have a filename but still have a blob URL
        let updatedPhotos = false;
        blobPhotos.forEach(photo => {
          if (photo.filename && filenameMap[photo.filename]) {
            logger.info(`Replacing blob URL with GridFS ID for photo ${photo.filename}`);
            photo.gridfsId = filenameMap[photo.filename].toString();
            // Set a flag to indicate updates were made
            updatedPhotos = true;
          }
        });
        
        // If we updated any photos, save the report back to the database
        if (updatedPhotos) {
          logger.info(`Saving updated report with GridFS IDs to database`);
          await report.save();
          logger.info(`Successfully saved report with updated GridFS IDs`);
        }
      }
    }
    
    // Generate the PDF using pdfGenerationService
    const pdfResult = await pdfGenerationService.generatePdf(report);
    
    // Check if the PDF was created successfully
    if (!pdfResult.buffer || pdfResult.buffer.length === 0) {
      logger.error('PDF generation failed - empty buffer returned');
      throw new ApiError(500, 'PDF generation failed');
    }
    
    logger.info(`PDF generated successfully, size: ${pdfResult.buffer.length} bytes`);
    
    // Create a filename for the PDF
    const timestamp = Date.now();
    const filename = `report_${report._id}_${timestamp}.pdf`;
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    
    // Send the PDF buffer
    res.send(pdfResult.buffer);
  } catch (error) {
    next(error);
  }
};

/**
 * Generate a comprehensive report summary from multiple photo analyses
 * @route   POST /api/reports/generate-summary
 * @access  Private
 */
const generateSummary = async (req, res, next) => {
  try {
    const { photos } = req.body;
    
    if (!photos || !Array.isArray(photos) || photos.length === 0) {
      throw new ApiError(400, 'No photo analyses provided');
    }
    
    // Log the request
    logger.info(`Generating summary for ${photos.length} photos`);
    
    // Validate that photos have analysis data
    const validPhotos = photos.filter(photo => photo.analysis && photo.analysis.description);
    
    if (validPhotos.length === 0) {
      throw new ApiError(400, 'None of the provided photos contain valid analysis data');
    }
    
    logger.info(`Found ${validPhotos.length} photos with valid analysis data`);
    
    // Extract analyses from photos
    const photoAnalyses = validPhotos.map(photo => ({
      analysis: photo.analysis,
      filename: photo.uploadedData?.filename || photo.displayName || photo.name || 'unknown'
    }));
    
    // Generate the summary
    const summary = await reportAIService.generateReportSummary(photoAnalyses);
    
    // Log success
    logger.info(`Successfully generated summary with ${summary.damages?.length || 0} damage items`);
    
    res.status(200).json({
      success: true,
      data: summary
    });
  } catch (error) {
    logger.error(`Error generating summary: ${error.message}`);
    next(error);
  }
};

module.exports = {
  createReport,
  getReports,
  getReport,
  updateReport,
  deleteReport,
  addPhotos,
  generatePdf,
  generateSummary
}; 