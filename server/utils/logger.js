const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');
const config = require('../config');

// Ensure log directory exists
const logDir = path.dirname(config.logging.file || 'logs/app.log');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Define log format
const logFormat = format.combine(
  format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
);

// Create logger instance
const logger = createLogger({
  level: config.logging.level || 'info',  
  format: logFormat,
  defaultMeta: { service: 'ciphergate-api' },
  transports: [
    // Write all logs with level 'error' and below to 'error.log'
    new transports.File({ 
      filename: config.logging.errorFile || 'logs/error.log',
      level: 'error',
      maxsize: config.logging.maxSize || '20m',
      maxFiles: config.logging.maxFiles || '14d'
    }),
    // Write all logs to 'combined.log'
    new transports.File({ 
      filename: config.logging.file || 'logs/combined.log',
      maxsize: config.logging.maxSize || '20m',
      maxFiles: config.logging.maxFiles || '14d'
    })
  ],
  exitOnError: false // Don't exit on handled exceptions
});

// If we're not in production, also log to console with colorization
if (config.env !== 'production') {
  const consoleFormat = format.combine(
    format.colorize({ all: true }),
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.printf(
      ({ level, message, timestamp, ...meta }) => {
        // Format the message with metadata if present
        let metaStr = '';
        if (Object.keys(meta).length > 0) {
          metaStr = ' ' + JSON.stringify(meta, null, 2);
        }
        return `${timestamp} [${level}]: ${message}${metaStr}`;
      }
    )
  );
  
  logger.add(new transports.Console({
    format: consoleFormat,
    level: 'debug' // Log everything in development
  }));
}

// Create a stream object for morgan (HTTP request logging)
logger.stream = {
  write: function(message, encoding) {
    // Remove the newline character at the end
    const logMessage = message.trim();
    // Log HTTP requests as 'info' level
    logger.info(logMessage);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  // Don't exit immediately, allow the process to continue
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit immediately, allow the process to continue
});

// Log application startup
logger.info(`Starting CipherGate API in ${config.env} environment`);

module.exports = logger;
