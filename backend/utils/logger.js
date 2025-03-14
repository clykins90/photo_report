const config = require('../config/config');

// Define log levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Default to INFO in production, DEBUG in development
const getLogLevel = () => {
  // Allow override via environment variable
  if (process.env.LOG_LEVEL) {
    const level = process.env.LOG_LEVEL.toUpperCase();
    if (LOG_LEVELS[level] !== undefined) {
      return LOG_LEVELS[level];
    }
  }
  
  // Default based on environment
  return config.nodeEnv === 'development' ? LOG_LEVELS.DEBUG : LOG_LEVELS.INFO;
};

// Get current log level
const currentLogLevel = getLogLevel();

const logger = {
  info: (message, meta = {}) => {
    if (config.nodeEnv !== 'test' && currentLogLevel >= LOG_LEVELS.INFO) {
      // For upload progress, only log at start and completion to reduce noise
      if (message.includes('upload') && message.includes('%')) {
        const progressMatch = message.match(/(\d+)%/);
        if (progressMatch) {
          const progress = parseInt(progressMatch[1], 10);
          // Only log at 0%, 100%, or if there's an error
          if (progress !== 0 && progress !== 100 && !message.includes('error')) {
            return; // Skip intermediate progress logs
          }
        }
      }
      console.log(`[INFO] ${message}`, meta);
    }
  },
  
  error: (message, error = null) => {
    if (config.nodeEnv !== 'test' && currentLogLevel >= LOG_LEVELS.ERROR) {
      console.error(`[ERROR] ${message}`, error ? error : '');
    }
  },
  
  warn: (message, meta = {}) => {
    if (config.nodeEnv !== 'test' && currentLogLevel >= LOG_LEVELS.WARN) {
      console.warn(`[WARN] ${message}`, meta);
    }
  },
  
  debug: (message, meta = {}) => {
    if (config.nodeEnv === 'development' && currentLogLevel >= LOG_LEVELS.DEBUG) {
      console.debug(`[DEBUG] ${message}`, meta);
    }
  }
};

module.exports = logger; 