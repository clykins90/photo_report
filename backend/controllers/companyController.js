const { validationResult } = require('express-validator');
const Company = require('../models/Company');
const User = require('../models/User');
const { ApiError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Create a new company
 * @route POST /api/companies
 * @access Private
 */
const createCompany = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, address, phone, email, website, licenseNumber, insuranceInfo, branding } = req.body;

    // Create new company
    const company = new Company({
      name,
      address,
      phone,
      email,
      website,
      licenseNumber,
      insuranceInfo,
      branding,
    });

    // Save company to database
    await company.save();

    // Update user with company ID
    await User.findByIdAndUpdate(req.user.id, { companyId: company._id });

    res.status(201).json({
      success: true,
      data: company,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get company by ID
 * @route GET /api/companies/:id
 * @access Private
 */
const getCompany = async (req, res, next) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      throw new ApiError(404, 'Company not found');
    }

    // Check if user belongs to this company or is admin
    const user = await User.findById(req.user.id);
    if (user.role !== 'admin' && user.companyId.toString() !== company._id.toString()) {
      throw new ApiError(403, 'Not authorized to access this company');
    }

    res.status(200).json({
      success: true,
      data: company,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update company
 * @route PUT /api/companies/:id
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

    // Find company
    let company = await Company.findById(req.params.id);

    if (!company) {
      throw new ApiError(404, 'Company not found');
    }

    // Check if user belongs to this company or is admin
    const user = await User.findById(req.user.id);
    if (user.role !== 'admin' && user.companyId.toString() !== company._id.toString()) {
      throw new ApiError(403, 'Not authorized to update this company');
    }

    // Update company fields
    company.name = name || company.name;
    company.address = address || company.address;
    company.phone = phone || company.phone;
    company.email = email || company.email;
    company.website = website || company.website;
    company.licenseNumber = licenseNumber || company.licenseNumber;
    company.insuranceInfo = insuranceInfo || company.insuranceInfo;
    company.branding = branding || company.branding;

    // Save updated company
    await company.save();

    res.status(200).json({
      success: true,
      data: company,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete company
 * @route DELETE /api/companies/:id
 * @access Private (Admin only)
 */
const deleteCompany = async (req, res, next) => {
  try {
    const company = await Company.findById(req.params.id);

    if (!company) {
      throw new ApiError(404, 'Company not found');
    }

    // Only admin can delete companies
    if (req.user.role !== 'admin') {
      throw new ApiError(403, 'Not authorized to delete companies');
    }

    // Delete company
    await company.remove();

    // Update users that belonged to this company
    await User.updateMany({ companyId: req.params.id }, { companyId: null });

    res.status(200).json({
      success: true,
      data: {},
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Upload company logo
 * @route POST /api/companies/:id/logo
 * @access Private
 */
const uploadLogo = async (req, res, next) => {
  try {
    // Check if file exists
    if (!req.file) {
      throw new ApiError(400, 'Please upload a file');
    }

    const company = await Company.findById(req.params.id);

    if (!company) {
      throw new ApiError(404, 'Company not found');
    }

    // Check if user belongs to this company or is admin
    const user = await User.findById(req.user.id);
    if (user.role !== 'admin' && user.companyId.toString() !== company._id.toString()) {
      throw new ApiError(403, 'Not authorized to update this company');
    }

    // Create public/logos directory if it doesn't exist
    const logosDir = path.join(process.cwd(), 'public', 'logos');
    if (!fs.existsSync(logosDir)) {
      fs.mkdirSync(logosDir, { recursive: true });
      logger.info(`Created logos directory: ${logosDir}`);
    }

    // Move file from temp to logos directory
    const logoFilename = `${company._id}_${req.file.filename}`;
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
    company.logo = `/logos/${logoFilename}`; // URL for frontend
    company.logoPath = relativePath; // Path for PDF generation
    await company.save();

    res.status(200).json({
      success: true,
      data: {
        logo: company.logo,
        logoPath: company.logoPath
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createCompany,
  getCompany,
  updateCompany,
  deleteCompany,
  uploadLogo,
}; 