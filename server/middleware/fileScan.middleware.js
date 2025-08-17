const { riskScoringService } = require('../services/ai');
const logger = require('../utils/logger');
const File = require('../models/file.model');

/**
 * Middleware to scan uploaded files for potential threats
 */
const fileScanMiddleware = () => {
  return async (req, res, next) => {
    // Skip if no files to process
    if (!req.files || req.files.length === 0) {
      return next();
    }

    try {
      // Process each file in parallel
      const scanPromises = req.files.map(async (file) => {
        try {
          // Skip if already processed
          if (file.riskAssessment) {
            return file;
          }

          logger.info(`Scanning file: ${file.originalname} (${file.size} bytes)`);
          
          // Get risk assessment from AI service
          const riskAssessment = await riskScoringService.calculateRiskScore(file, {
            uploader: req.user?.id,
            ipAddress: req.ip,
            userAgent: req.get('user-agent'),
          });

          // Add risk assessment to file object
          file.riskAssessment = riskAssessment;
          file.isSafe = !riskAssessment.isMalicious && riskAssessment.riskLevel !== 'high';
          
          logger.info(`File scan completed: ${file.originalname} - Risk: ${riskAssessment.riskLevel} (${riskAssessment.riskScore}/100)`);
          
          return file;
        } catch (error) {
          logger.error(`Error scanning file ${file.originalname}:`, error);
          // Mark as unsafe if there's an error during scanning
          file.riskAssessment = {
            error: true,
            message: 'Error during file scanning',
            riskScore: 100,
            riskLevel: 'high',
            isMalicious: true,
            details: { error: error.message },
            timestamp: new Date().toISOString()
          };
          file.isSafe = false;
          return file;
        }
      });

      // Wait for all files to be processed
      req.files = await Promise.all(scanPromises);
      
      // Check if any files are unsafe
      const unsafeFiles = req.files.filter(file => !file.isSafe);
      
      if (unsafeFiles.length > 0) {
        const unsafeFileNames = unsafeFiles.map(f => f.originalname).join(', ');
        logger.warn(`Potentially unsafe files detected: ${unsafeFileNames}`);
        
        // Add warning to response locals
        res.locals.securityWarning = {
          message: `${unsafeFiles.length} file(s) may be unsafe`,
          unsafeFiles: unsafeFiles.map(file => ({
            name: file.originalname,
            riskLevel: file.riskAssessment.riskLevel,
            riskScore: file.riskAssessment.riskScore,
            details: file.riskAssessment.details
          }))
        };
      }
      
      next();
    } catch (error) {
      logger.error('Error in file scanning middleware:', error);
      // Continue to next middleware even if scanning fails
      next();
    }
  };
};

/**
 * Middleware to block requests with unsafe files
 */
const blockUnsafeFiles = (options = {}) => {
  const {
    redirectTo = '/error',
    errorMessage = 'File upload blocked due to security concerns',
    logOnly = false // If true, log but don't block
  } = options;

  return (req, res, next) => {
    // Skip if no files to check
    if (!req.files || req.files.length === 0) {
      return next();
    }

    const unsafeFiles = req.files.filter(file => !file.isSafe);
    
    if (unsafeFiles.length > 0) {
      const fileNames = unsafeFiles.map(f => f.originalname).join(', ');
      const riskLevels = unsafeFiles.map(f => f.riskAssessment.riskLevel);
      
      const logMessage = `Blocked upload of potentially unsafe files: ${fileNames} (Risk levels: ${riskLevels.join(', ')})`;
      
      if (logOnly) {
        logger.warn(logMessage);
        return next();
      }
      
      logger.error(logMessage);
      
      // Clean up uploaded files
      const fs = require('fs');
      const path = require('path');
      const uploadDir = path.join(__dirname, '../../uploads');
      
      req.files.forEach(file => {
        try {
          if (fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
        } catch (err) {
          logger.error(`Error cleaning up file ${file.path}:`, err);
        }
      });
      
      // Handle response based on request type
      if (req.accepts('html')) {
        req.flash('error', `${errorMessage}: ${fileNames}`);
        return res.redirect(redirectTo);
      }
      
      // JSON response for API requests
      return res.status(403).json({
        success: false,
        error: errorMessage,
        unsafeFiles: unsafeFiles.map(file => ({
          name: file.originalname,
          riskLevel: file.riskAssessment.riskLevel,
          riskScore: file.riskAssessment.riskScore,
          details: file.riskAssessment.details
        }))
      });
    }
    
    next();
  };
};

module.exports = {
  fileScanMiddleware,
  blockUnsafeFiles
};
