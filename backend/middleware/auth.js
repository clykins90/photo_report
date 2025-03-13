const jwt = require('jsonwebtoken');
const { ApiError } = require('./errorHandler');
const config = require('../config/config');

/**
 * Middleware to protect routes that require authentication
 */
const protect = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(401, 'Not authorized, no token provided');
    }
    
    // Get token from Bearer token
    const token = authHeader.split(' ')[1];
    
    if (!token) {
      throw new ApiError(401, 'Not authorized, no token provided');
    }
    
    try {
      // Verify token
      const decoded = jwt.verify(token, config.jwtSecret);
      
      // Add user from payload to request object
      req.user = decoded;
      next();
    } catch (error) {
      throw new ApiError(401, 'Not authorized, token invalid');
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware to restrict access to specific roles
 * @param {...string} roles - Roles allowed to access the route
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, 'Not authorized, please login'));
    }
    
    if (!roles.includes(req.user.role)) {
      return next(new ApiError(403, `User role ${req.user.role} is not authorized to access this resource`));
    }
    
    next();
  };
};

module.exports = {
  protect,
  authorize
}; 