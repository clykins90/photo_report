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
          const filename = photo.filename || photo.name || '';
          
          if (!filename) {
            console.log('Warning: Photo missing filename, this may cause retrieval issues');
          }
          
          // Create properly formatted photo object
          return {
            path: path,
            filename: filename,
            section: photo.section || 'Uncategorized',
            aiAnalysis: photo.aiAnalysis || photo.analysis || null,
            userDescription: photo.description || photo.userDescription || ''
          };
        })
        .filter(photo => photo.path && photo.filename); // Only include photos with required fields
      
      console.log('Formatted photos:', formattedPhotos);
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
      photos: formattedPhotos
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
    console.log('Report update data:', req.body);
    console.log('Auth user info:', req.user);

    const { id } = req.params;
    
    // Find report
    const report = await Report.findById(id);
    if (!report) {
      throw new ApiError(404, 'Report not found');
    }

    // Check if user has permission
    if (report.user.toString() !== req.user.id && req.user.role !== 'admin') {
      throw new ApiError(403, 'Not authorized to update this report');
    }

    // Get user's company information
    const user = await User.findById(req.user.id);
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Format photos to match the schema requirements if photos are being updated
    let updatedPhotos = report.photos; // Default to existing photos
    if (req.body.photos && Array.isArray(req.body.photos)) {
      console.log('Processing photos array for update:', req.body.photos);
      
      updatedPhotos = req.body.photos
        .filter(photo => photo) // Filter out null/undefined photos
        .map(photo => {
          console.log('Processing photo for update:', photo);
          
          // Try to extract required fields from various possible formats
          const path = photo.path || photo.url || photo.preview || '';
          
          // Use the original filename if available, don't generate a new one
          // This will preserve UUIDs from the upload process
          const filename = photo.filename || photo.name || '';
          
          if (!filename) {
            console.log('Warning: Photo missing filename, this may cause retrieval issues');
          }
          
          // Create properly formatted photo object
          return {
            path: path,
            filename: filename,
            section: photo.section || 'Uncategorized',
            aiAnalysis: photo.aiAnalysis || photo.analysis || null,
            userDescription: photo.description || photo.userDescription || ''
          };
        })
        .filter(photo => photo.path && photo.filename); // Only include photos with required fields
      
      console.log('Formatted photos for update:', updatedPhotos);
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
      damages: req.body.damages || report.damages,
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
 * Delete report
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
    if (
      report.user.toString() !== req.user.id &&
      req.user.role !== 'admin'
    ) {
      throw new ApiError(403, 'Not authorized to delete this report');
    }

    // Delete report
    await Report.deleteOne({ _id: report._id });

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Add photos to report
 * @route POST /api/reports/:id/photos
 * @access Private
 */
const addPhotos = async (req, res, next) => {
  try {
    // Check if files exist
    if (!req.files || req.files.length === 0) {
      throw new ApiError(400, 'Please upload at least one photo');
    }

    const report = await Report.findById(req.params.id);

    if (!report) {
      throw new ApiError(404, 'Report not found');
    }

    // Check if user is authorized to update this report
    if (
      report.user.toString() !== req.user.id &&
      req.user.role !== 'admin'
    ) {
      throw new ApiError(403, 'Not authorized to update this report');
    }

    // Process uploaded files
    const newPhotos = req.files.map((file, index) => ({
      path: `/uploads/${file.filename}`,
      filename: file.originalname,
      order: report.photos.length + index + 1,
      section: req.body.section || 'Uncategorized',
      userDescription: req.body.description || '',
    }));

    // Add new photos to report
    report.photos = [...report.photos, ...newPhotos];
    await report.save();

    res.status(200).json({
      success: true,
      data: {
        photos: newPhotos,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Generate a PDF report
 * @route GET /api/reports/:reportId/pdf
 * @route POST /api/reports/:id/generate-pdf
 * @access Private
 */
const generatePdf = async (req, res, next) => {
  try {
    // Support both parameter naming conventions
    const reportId = req.params.reportId || req.params.id;
    logger.info(`Generating PDF for report ID: ${reportId}`);
    
    // Find report by ID with photos included
    const report = await Report.findById(reportId)
      .populate('user');
      
    if (!report) {
      logger.error(`Report not found for ID: ${reportId}`);
      throw new ApiError(404, 'Report not found');
    }

    logger.info(`Found report with ${report.photos?.length || 0} photos`);
    
    // Generate the PDF using pdfGenerationService
    const pdfBuffer = await pdfGenerationService.generatePdf(report);
    
    // Check if the PDF was created successfully
    if (!pdfBuffer || pdfBuffer.length === 0) {
      logger.error('PDF generation failed - empty buffer returned');
      throw new ApiError(500, 'PDF generation failed');
    }
    
    logger.info(`PDF generated successfully, size: ${pdfBuffer.length} bytes`);
    
    // Set headers and send PDF
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="report_${reportId}.pdf"`,
      'Content-Length': pdfBuffer.length
    });
    
    res.send(pdfBuffer);
    
  } catch (error) {
    logger.error(`Error generating PDF: ${error.message}`);
    next(error);
  }
};

/**
 * Generate a unique sharing link for a report
 * @route POST /api/reports/:id/share
 * @access Private
 */
const generateShareLink = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Find the report
    const report = await Report.findById(id);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found',
      });
    }
    
    // Check if user is authorized to share this report
    if (report.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to share this report',
      });
    }
    
    // Generate a unique sharing token if one doesn't exist
    if (!report.shareToken) {
      const shareToken = crypto.randomBytes(20).toString('hex');
      report.shareToken = shareToken;
      report.shareExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
      await report.save();
    } else if (report.shareExpiry < new Date()) {
      // If token is expired, generate a new one
      const shareToken = crypto.randomBytes(20).toString('hex');
      report.shareToken = shareToken;
      report.shareExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
      await report.save();
    }
    
    // Construct the sharing URL
    const shareUrl = `${req.protocol}://${req.get('host')}/shared-report/${report.shareToken}`;
    
    res.status(200).json({
      success: true,
      data: {
        shareUrl,
        shareToken: report.shareToken,
        shareExpiry: report.shareExpiry,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get a shared report using a share token
 * @route GET /api/reports/shared/:token
 * @access Public
 */
const getSharedReport = async (req, res, next) => {
  try {
    const { token } = req.params;
    
    // Find the report by share token
    const report = await Report.findOne({
      shareToken: token,
      shareExpiry: { $gt: new Date() }, // Ensure token is not expired
    }).populate('user', 'firstName lastName email company');
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Shared report not found or link has expired',
      });
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
 * Revoke a sharing link for a report
 * @route DELETE /api/reports/:id/share
 * @access Private
 */
const revokeShareLink = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Find the report
    const report = await Report.findById(id);
    
    if (!report) {
      return res.status(404).json({
        success: false,
        message: 'Report not found',
      });
    }
    
    // Check if user is authorized to modify this report
    if (report.user.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to modify this report',
      });
    }
    
    // Remove sharing token
    report.shareToken = null;
    report.shareExpiry = null;
    await report.save();
    
    res.status(200).json({
      success: true,
      message: 'Sharing link revoked successfully',
    });
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
    
    // Extract analyses from photos
    const photoAnalyses = photos.map(photo => ({
      analysis: photo.analysis,
      filename: photo.uploadedData?.filename || 'unknown'
    }));
    
    // Generate the summary
    const summary = await reportAIService.generateReportSummary(photoAnalyses);
    
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
  generateShareLink,
  getSharedReport,
  revokeShareLink,
  generateSummary
}; 