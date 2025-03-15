/**
 * Centralized logging utility for the application
 * Allows control of log verbosity based on environment
 */

// Default log levels
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// Default configuration
let config = {
  level: process.env.NODE_ENV === 'production' ? LOG_LEVELS.ERROR : LOG_LEVELS.INFO,
  enabledModules: {
    photo: true,
    report: true,
    auth: true,
    api: true
  }
};

/**
 * Initialize logger with custom configuration
 * @param {Object} customConfig - Custom logger configuration
 */
export const initLogger = (customConfig = {}) => {
  // Get configuration from localStorage if available
  try {
    const storedConfig = localStorage.getItem('loggerConfig');
    if (storedConfig) {
      config = { ...config, ...JSON.parse(storedConfig) };
    }
  } catch (e) {
    // Ignore localStorage errors
  }
  
  // Override with custom config
  config = { ...config, ...customConfig };
  
  // Get configuration from environment variables if available
  if (import.meta && import.meta.env) {
    if (import.meta.env.VITE_LOG_LEVEL) {
      const levelName = import.meta.env.VITE_LOG_LEVEL.toUpperCase();
      if (LOG_LEVELS[levelName] !== undefined) {
        config.level = LOG_LEVELS[levelName];
      }
    }
    
    // Parse module-specific settings
    Object.keys(config.enabledModules).forEach(module => {
      const envVar = `VITE_LOG_${module.toUpperCase()}_ENABLED`;
      if (import.meta.env[envVar] !== undefined) {
        config.enabledModules[module] = import.meta.env[envVar] === 'true';
      }
    });
  }
};

// Initialize with default config
initLogger();

/**
 * Log a message at the appropriate level
 * @param {string} level - Log level (ERROR, WARN, INFO, DEBUG)
 * @param {string} module - Module name
 * @param {string} message - Log message
 * @param {any} data - Optional data to log
 */
const log = (level, module, message, data = null) => {
  // Check if logging is enabled for this level and module
  if (LOG_LEVELS[level] > config.level || !config.enabledModules[module]) {
    return;
  }
  
  const timestamp = new Date().toISOString();
  const formattedMessage = `[${timestamp}] [${module.toUpperCase()}] [${level}] ${message}`;
  
  switch (level) {
    case 'ERROR':
      if (data) {
        console.error(formattedMessage, data);
      } else {
        console.error(formattedMessage);
      }
      break;
    case 'WARN':
      if (data) {
        console.warn(formattedMessage, data);
      } else {
        console.warn(formattedMessage);
      }
      break;
    case 'INFO':
      if (data) {
        console.info(formattedMessage, data);
      } else {
        console.info(formattedMessage);
      }
      break;
    case 'DEBUG':
      if (data) {
        console.debug(formattedMessage, data);
      } else {
        console.debug(formattedMessage);
      }
      break;
    default:
      if (data) {
        console.log(formattedMessage, data);
      } else {
        console.log(formattedMessage);
      }
  }
};

// Module-specific loggers
export const photoLogger = {
  error: (message, data = null) => log('ERROR', 'photo', message, data),
  warn: (message, data = null) => log('WARN', 'photo', message, data),
  info: (message, data = null) => log('INFO', 'photo', message, data),
  debug: (message, data = null) => log('DEBUG', 'photo', message, data),
  timing: (message, elapsedMs = null) => {
    const timeInfo = elapsedMs ? `${message} (${elapsedMs}ms)` : message;
    log('DEBUG', 'photo', `[TIMING] ${timeInfo}`);
  }
};

export const reportLogger = {
  error: (message, data = null) => log('ERROR', 'report', message, data),
  warn: (message, data = null) => log('WARN', 'report', message, data),
  info: (message, data = null) => log('INFO', 'report', message, data),
  debug: (message, data = null) => log('DEBUG', 'report', message, data)
};

export const authLogger = {
  error: (message, data = null) => log('ERROR', 'auth', message, data),
  warn: (message, data = null) => log('WARN', 'auth', message, data),
  info: (message, data = null) => log('INFO', 'auth', message, data),
  debug: (message, data = null) => log('DEBUG', 'auth', message, data)
};

export const apiLogger = {
  error: (message, data = null) => log('ERROR', 'api', message, data),
  warn: (message, data = null) => log('WARN', 'api', message, data),
  info: (message, data = null) => log('INFO', 'api', message, data),
  debug: (message, data = null) => log('DEBUG', 'api', message, data),
  request: (method, url, data = null) => {
    log('INFO', 'api', `${method} ${url}`, data);
  },
  response: (status, url, data = null) => {
    log('DEBUG', 'api', `[${status}] ${url}`, data);
  }
};

export default {
  initLogger,
  photoLogger,
  reportLogger,
  authLogger,
  apiLogger
}; 