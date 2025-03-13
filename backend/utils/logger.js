const config = require('../config/config');

const logger = {
  info: (message, meta = {}) => {
    if (config.nodeEnv !== 'test') {
      console.log(`[INFO] ${message}`, meta);
    }
  },
  
  error: (message, error = null) => {
    if (config.nodeEnv !== 'test') {
      console.error(`[ERROR] ${message}`, error ? error : '');
    }
  },
  
  warn: (message, meta = {}) => {
    if (config.nodeEnv !== 'test') {
      console.warn(`[WARN] ${message}`, meta);
    }
  },
  
  debug: (message, meta = {}) => {
    if (config.nodeEnv === 'development') {
      console.debug(`[DEBUG] ${message}`, meta);
    }
  }
};

module.exports = logger; 