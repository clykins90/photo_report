const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const User = require('../models/User');
const { ApiError } = require('../middleware/errorHandler');
const config = require('../config/config');
const logger = require('../utils/logger');

/**
 * Generate JWT token for a user
 * @param {Object} user - User object
 * @returns {string} JWT token
 */
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
    },
    config.jwtSecret,
    {
      expiresIn: config.jwtExpiration,
    }
  );
};

/**
 * Register a new user
 * @route POST /api/auth/register
 * @access Public
 */
const register = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, firstName, lastName, company } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new ApiError(400, 'User already exists with this email');
    }

    // Create new user with company info if provided
    const userData = {
      email,
      password,
      firstName,
      lastName,
    };
    
    // Add company data if provided
    if (company) {
      userData.company = company;
    }

    const user = new User(userData);

    // Save user to database
    await user.save();

    // Generate token
    const token = generateToken(user);

    // Return user data and token
    res.status(201).json({
      success: true,
      data: {
        user: user.toJSON(),
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Login user
 * @route POST /api/auth/login
 * @access Public
 */
const login = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
      throw new ApiError(401, 'Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new ApiError(401, 'Account is disabled. Please contact support.');
    }

    // Check if password matches
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new ApiError(401, 'Invalid credentials');
    }

    // Update last login
    user.lastLogin = Date.now();
    await user.save();

    // Generate token
    const token = generateToken(user);

    // Return user data and token
    res.status(200).json({
      success: true,
      data: {
        user: user.toJSON(),
        token,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get user profile
 * @route GET /api/auth/profile
 * @access Private
 */
const getProfile = async (req, res, next) => {
  try {
    // Get user from database
    const user = await User.findById(req.user.id);
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Send the response with user data (which now includes company information)
    res.status(200).json({
      success: true,
      data: user.toJSON()
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Change user password
 * @route PUT /api/auth/password
 * @access Private
 */
const changePassword = async (req, res, next) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { currentPassword, newPassword } = req.body;

    // Get user from database
    const user = await User.findById(req.user.id);
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    // Check if current password matches
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      throw new ApiError(401, 'Current password is incorrect');
    }

    // Update password
    user.password = newPassword;
    
    // Save user (password will be hashed by pre-save hook)
    await user.save();

    res.status(200).json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  getProfile,
  changePassword
}; 