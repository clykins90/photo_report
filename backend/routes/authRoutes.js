const express = require('express');
const { check } = require('express-validator');
const { register, login, getProfile, changePassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post(
  '/register',
  [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password must be at least 6 characters').isLength({ min: 6 }),
    check('firstName', 'First name is required').notEmpty(),
    check('lastName', 'Last name is required').notEmpty(),
    // Company validation is optional
    check('company.name', 'Company name is required if company is provided')
      .if(check('company').exists())
      .notEmpty(),
    check('company.email', 'Company email must be valid if provided')
      .if(check('company.email').exists())
      .isEmail(),
  ],
  register
);

// @route   POST /api/auth/login
// @desc    Login user and get token
// @access  Public
router.post(
  '/login',
  [
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists(),
  ],
  login
);

// @route   GET /api/auth/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', protect, getProfile);

// @route   PUT /api/auth/password
// @desc    Change user password
// @access  Private
router.put(
  '/password',
  [
    check('currentPassword', 'Current password is required').exists(),
    check('newPassword', 'New password must be at least 6 characters').isLength({ min: 6 }),
  ],
  protect,
  changePassword
);

module.exports = router; 