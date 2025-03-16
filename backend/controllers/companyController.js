const { validationResult } = require('express-validator');
const User = require('../models/User');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Update user's company information
 * @route PUT /api/company
 * @access Private
 */
const updateCompany = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, address, phone, email, website, licenseNumber, insuranceInfo, branding } = req.body;

    // Find user
    const user = await User.findById(req.user.id);

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Initialize company object if it doesn't exist
    if (!user.company) {
      user.company = {};
    }

    // Update company fields
    user.company.name = name || user.company.name;
    user.company.address = address || user.company.address;
    user.company.phone = phone || user.company.phone;
    user.company.email = email || user.company.email;
    user.company.website = website || user.company.website;
    user.company.licenseNumber = licenseNumber || user.company.licenseNumber;
    user.company.insuranceInfo = insuranceInfo || user.company.insuranceInfo;
    user.company.branding = branding || user.company.branding;

    // Save updated user
    await user.save();

    res.status(200).json({
      success: true,
      data: user.company,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user's company information
 * @route GET /api/company
 * @access Private
 */
const getCompany = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    if (!user.company) {
      throw new ApiError(404, 'Company information not found');
    }

    res.status(200).json({
      success: true,
      data: user.company,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload company logo
 * @route POST /api/company/logo
 * @access Private
 */
const uploadLogo = async (req, res, next) => {
  try {
    // Check if file exists
    if (!req.file && !req.gridfsFile) {
      throw new ApiError(400, 'Please upload a file');
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Initialize company object if it doesn't exist
    if (!user.company) {
      user.company = {};
    }

    // If using GridFS, use the gridfsFile info
    if (req.gridfsFile) {
      // Store the GridFS file ID in the company
      user.company.logo = `/photos/${req.gridfsFile.id}`; // URL for frontend
      user.company.logoId = req.gridfsFile.id; // ID for retrieval
      await user.save();

      res.status(200).json({
        success: true,
        data: {
          logo: user.company.logo,
          logoId: user.company.logoId
        },
      });
      return;
    }

    // Legacy file system code (kept for backward compatibility)
    // Create public/logos directory if it doesn't exist
    const logosDir = path.join(process.cwd(), 'public', 'logos');
    if (!fs.existsSync(logosDir)) {
      fs.mkdirSync(logosDir, { recursive: true });
      logger.info(`Created logos directory: ${logosDir}`);
    }

    // Move file from temp to logos directory
    const logoFilename = `${user._id}_${req.file.filename}`;
    const logoPath = path.join(logosDir, logoFilename);
    
    fs.copyFileSync(req.file.path, logoPath);
    logger.info(`Copied logo from ${req.file.path} to ${logoPath}`);
    
    // Delete temp file
    try {
      fs.unlinkSync(req.file.path);
      logger.info(`Deleted temp file: ${req.file.path}`);
    } catch (err) {
      logger.warn(`Failed to delete temp file: ${req.file.path}`, err);
    }

    // Store relative path in database for PDF generation
    const relativePath = path.join('public', 'logos', logoFilename).replace(/\\/g, '/');
    
    // Update company with logo path
    user.company.logo = `/logos/${logoFilename}`; // URL for frontend
    user.company.logoPath = relativePath; // Path for PDF generation
    await user.save();

    res.status(200).json({
      success: true,
      data: {
        logo: user.company.logo,
        logoPath: user.company.logoPath
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateCompany,
  getCompany,
  uploadLogo,
}; 