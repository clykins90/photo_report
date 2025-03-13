const express = require('express');
const { check } = require('express-validator');
const { 
  createCompany, 
  getCompany, 
  updateCompany, 
  deleteCompany, 
  uploadLogo 
} = require('../controllers/companyController');
const { protect, authorize } = require('../middleware/auth');
const { uploadSingle } = require('../middleware/tempUpload');

const router = express.Router();

// All routes require authentication
router.use(protect);

// @route   POST /api/companies
// @desc    Create a new company
// @access  Private
router.post(
  '/',
  [
    check('name', 'Company name is required').notEmpty(),
  ],
  createCompany
);

// @route   GET /api/companies/:id
// @desc    Get company by ID
// @access  Private
router.get('/:id', getCompany);

// @route   PUT /api/companies/:id
// @desc    Update company
// @access  Private
router.put(
  '/:id',
  [
    check('name', 'Company name is required').optional().notEmpty(),
    check('email', 'Please include a valid email').optional().isEmail(),
  ],
  updateCompany
);

// @route   DELETE /api/companies/:id
// @desc    Delete company
// @access  Private (Admin only)
router.delete('/:id', authorize('admin'), deleteCompany);

// @route   POST /api/companies/:id/logo
// @desc    Upload company logo
// @access  Private
router.post('/:id/logo', uploadSingle('logo'), uploadLogo);

module.exports = router; 