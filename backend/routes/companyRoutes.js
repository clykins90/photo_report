const express = require('express');
const { check } = require('express-validator');
const { updateCompany, getCompany, uploadLogo } = require('../controllers/companyController');
const { protect } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/tempUpload');

const router = express.Router();

// Protect all routes
router.use(protect);

// @route   GET /api/company
// @desc    Get current user's company information
// @access  Private
router.get('/', getCompany);

// @route   PUT /api/company
// @desc    Update current user's company information
// @access  Private
router.put(
  '/',
  [
    check('name', 'Company name is required').optional().notEmpty(),
    check('email', 'Please include a valid email').optional().isEmail(),
    check('phone', 'Phone number is invalid').optional().isMobilePhone(),
    check('website', 'Website URL is invalid').optional().isURL(),
  ],
  updateCompany
);

// @route   POST /api/company/logo
// @desc    Upload logo for current user's company
// @access  Private
router.post('/logo', uploadSingle('logo'), uploadLogo);

module.exports = router; 