const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const logger = require('../utils/logger');

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Create a temporary directory for this upload
    const tempDir = path.join(uploadDir, 'temp', uuidv4());
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    cb(null, tempDir);
  },
  filename: function (req, file, cb) {
    // Generate a unique filename with original extension
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  }
});

// File filter to allow only certain file types
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv',
    'application/rtf',
    'application/json',
    'application/xml',
    
    // Archives
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    'application/x-tar',
    'application/gzip',
    'application/x-bzip2',
    
    // Code
    'text/javascript',
    'application/javascript',
    'application/x-javascript',
    'text/x-python',
    'application/x-httpd-php',
    'text/x-java-source',
    'text/x-c',
    'text/x-c++',
    'text/x-csharp',
    'text/css',
    'text/html',
    'text/x-ruby',
    'application/x-sh',
    'application/x-typescript',
    
    // Audio/Video
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    'audio/mp4',
    'video/mp4',
    'video/x-msvideo',
    'video/x-ms-wmv',
    'video/quicktime',
    'video/x-ms-afs',
    'video/x-ms-asf',
    'video/x-ms-wvx',
    'video/x-ms-wm',
    'video/x-ms-wmx',
    'video/x-ms-wmz',
    'video/x-ms-wvx',
    'video/x-flv',
    'video/webm',
    'video/3gpp',
    'video/3gpp2',
    'video/ogg',
    'video/mpeg'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    const error = new Error('Invalid file type. Only specific file types are allowed.');
    error.status = 400;
    cb(error, false);
  }
};

// Configure multer with limits
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: config.aws.s3.maxFileSize, // Max file size in bytes (100MB by default)
    files: 10, // Max number of files
    fields: 20, // Max number of non-file fields
    parts: 30, // For multipart forms, max number of parts (files + fields)
    headerPairs: 2000 // Max number of header key=>value pairs
  }
});

// Middleware to handle file uploads
const uploadFiles = (fields) => {
  return (req, res, next) => {
    // Use multer upload instance
    const uploadMiddleware = upload.fields(fields);
    
    uploadMiddleware(req, res, function (err) {
      if (err) {
        // Handle multer errors
        logger.error('File upload error:', err);
        
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            message: `File too large. Maximum file size is ${config.aws.s3.maxFileSize / (1024 * 1024)}MB.`
          });
        }
        
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: 'Too many files. Maximum 10 files allowed per request.'
          });
        }
        
        if (err.code === 'LIMIT_UNEXPECTED_FILE') {
          return res.status(400).json({
            success: false,
            message: `Unexpected field: ${err.field}`
          });
        }
        
        if (err.message === 'Invalid file type. Only specific file types are allowed.') {
          return res.status(400).json({
            success: false,
            message: 'Invalid file type. Only specific file types are allowed.'
          });
        }
        
        return res.status(400).json({
          success: false,
          message: 'Error uploading files',
          error: config.env === 'development' ? err.message : undefined
        });
      }
      
      // If no files were uploaded, continue
      if (!req.files) {
        return next();
      }
      
      // Process uploaded files
      try {
        // Convert files to array for easier handling
        const files = [];
        
        // Handle multiple file fields
        Object.keys(req.files).forEach(fieldName => {
          const fieldFiles = Array.isArray(req.files[fieldName]) 
            ? req.files[fieldName] 
            : [req.files[fieldName]];
          
          fieldFiles.forEach(file => {
            // Read file into buffer
            const fileBuffer = fs.readFileSync(file.path);
            
            // Add file info to request
            files.push({
              fieldname: file.fieldname,
              originalname: file.originalname,
              encoding: file.encoding,
              mimetype: file.mimetype,
              size: file.size,
              destination: file.destination,
              filename: file.filename,
              path: file.path,
              buffer: fileBuffer
            });
          });
        });
        
        // Add files to request object
        req.uploadedFiles = files;
        
        // Continue to next middleware
        next();
      } catch (error) {
        logger.error('Error processing uploaded files:', error);
        
        // Clean up uploaded files
        if (req.files) {
          Object.values(req.files).flat().forEach(file => {
            try {
              if (file.path && fs.existsSync(file.path)) {
                fs.unlinkSync(file.path);
              }
            } catch (err) {
              logger.error('Error cleaning up file:', err);
            }
          });
        }
        
        res.status(500).json({
          success: false,
          message: 'Error processing uploaded files',
          error: config.env === 'development' ? error.message : undefined
        });
      }
    });
  };
};

// Middleware to clean up temporary files after request is complete
const cleanupTempFiles = (req, res, next) => {
  // Add a listener for when the response is finished
  res.on('finish', () => {
    if (req.uploadedFiles) {
      req.uploadedFiles.forEach(file => {
        try {
          // Delete the temporary file
          if (file.path && fs.existsSync(file.path)) {
            fs.unlinkSync(file.path);
          }
          
          // Delete the parent directory if it's empty
          const dir = path.dirname(file.path);
          if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
            fs.rmdirSync(dir);
          }
        } catch (error) {
          logger.error('Error cleaning up temporary file:', error);
        }
      });
    }
  });
  
  next();
};

// Middleware to handle single file upload
const uploadSingle = (fieldName) => {
  return (req, res, next) => {
    const uploadSingle = upload.single(fieldName);
    
    uploadSingle(req, res, function (err) {
      if (err) {
        logger.error('Single file upload error:', err);
        
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            success: false,
            message: `File too large. Maximum file size is ${config.aws.s3.maxFileSize / (1024 * 1024)}MB.`
          });
        }
        
        if (err.message === 'Invalid file type. Only specific file types are allowed.') {
          return res.status(400).json({
            success: false,
            message: 'Invalid file type. Only specific file types are allowed.'
          });
        }
        
        return res.status(400).json({
          success: false,
          message: 'Error uploading file',
          error: config.env === 'development' ? err.message : undefined
        });
      }
      
      // If file was uploaded, add it to req.uploadedFile
      if (req.file) {
        try {
          // Read file into buffer
          const fileBuffer = fs.readFileSync(req.file.path);
          
          // Add file to request
          req.uploadedFile = {
            ...req.file,
            buffer: fileBuffer
          };
        } catch (error) {
          logger.error('Error processing uploaded file:', error);
          
          // Clean up the file
          if (req.file && req.file.path) {
            try {
              fs.unlinkSync(req.file.path);
            } catch (err) {
              logger.error('Error cleaning up file:', err);
            }
          }
          
          return res.status(500).json({
            success: false,
            message: 'Error processing uploaded file',
            error: config.env === 'development' ? error.message : undefined
          });
        }
      }
      
      next();
    });
  };
};

module.exports = {
  upload,
  uploadFiles,
  uploadSingle,
  cleanupTempFiles
};
