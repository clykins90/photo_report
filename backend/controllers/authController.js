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
  const startTime = Date.now();
  try {
    logger.info(`API Request: POST /login`, {});
    
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;
    
    // Log timing for database operations
    const dbStartTime = Date.now();
    
    // Find user by email
    const user = await User.findOne({ email });
    
    const dbEndTime = Date.now();
    logger.debug(`Database query took ${dbEndTime - dbStartTime}ms`);
    
    if (!user) {
      throw new ApiError(401, 'Invalid credentials');
    }

    // Check if user is active
    if (!user.isActive) {
      throw new ApiError(401, 'Account is disabled. Please contact support.');
    }

    // Check if password matches
    const pwStartTime = Date.now();
    const isMatch = await user.comparePassword(password);
    const pwEndTime = Date.now();
    
    logger.debug(`Password comparison took ${pwEndTime - pwStartTime}ms`);
    
    if (!isMatch) {
      throw new ApiError(401, 'Invalid credentials');
    }

    // Update last login time in the database
    // Instead of saving immediately, use an update operation
    // This is more efficient than loading the full document and saving it
    User.updateOne(
      { _id: user._id },
      { $set: { lastLogin: Date.now() } }
    ).catch(err => {
      // Log error but don't fail the login if this update fails
      logger.error(`Failed to update last login time: ${err.message}`);
    });

    // Generate token
    const tokenStartTime = Date.now();
    const token = generateToken(user);
    const tokenEndTime = Date.now();
    
    logger.debug(`Token generation took ${tokenEndTime - tokenStartTime}ms`);

    // Return user data and token
    const endTime = Date.now();
    logger.info(`Login completed in ${endTime - startTime}ms`);
    
    res.status(200).json({
      success: true,
      data: {
        user: user.toJSON(),
        token,
      },
    });
  } catch (error) {
    const endTime = Date.now();
    logger.error(`Login failed in ${endTime - startTime}ms: ${error.message}`);
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