const express = require('express');
const router = express.Router();
const fileController = require('../controllers/file.controller');
const { protect, hasPermission } = require('../middleware/auth.middleware');
const { uploadFiles, uploadSingle, cleanupTempFiles } = require('../middleware/upload.middleware');
const { FILE_PERMISSIONS } = require('../models/file.model');

// Apply protect middleware to all routes
router.use(protect);

// File upload routes
router.post(
  '/upload',
  uploadSingle('file'),
  cleanupTempFiles,
  fileController.uploadFile
);

// Multiple file upload
router.post(
  '/upload-multiple',
  uploadFiles([{ name: 'files', maxCount: 10 }]),
  cleanupTempFiles,
  fileController.uploadMultipleFiles
);

// File download route
router.get(
  '/:id/download',
  fileController.downloadFile
);

// File info route
router.get(
  '/:id',
  fileController.getFileInfo
);

// List files with pagination and filtering
router.get(
  '/',
  fileController.getUserFiles
);

// Update file info
router.put(
  '/:id',
  fileController.updateFile
);

// Delete file
router.delete(
  '/:id',
  fileController.deleteFile
);

// Share file with another user
router.post(
  '/:id/share',
  fileController.shareFile
);

// Remove user's access to a file
router.delete(
  '/:id/share/:userId',
  fileController.unshareFile
);

// Get file versions
router.get(
  '/:id/versions',
  fileController.getFileVersions
);

// Restore previous version
router.post(
  '/:id/versions/:version/restore',
  fileController.restoreFileVersion
);

// Generate thumbnail
router.get(
  '/:id/thumbnail',
  fileController.generateThumbnail
);

// Generate preview
router.get(
  '/:id/preview',
  fileController.generatePreview
);

// Move file to folder
router.patch(
  '/:id/move',
  fileController.moveFile
);

// Copy file
router.post(
  '/:id/copy',
  fileController.copyFile
);

// Rename file
router.patch(
  '/:id/rename',
  fileController.renameFile
);

// Get file activity
router.get(
  '/:id/activity',
  fileController.getFileActivity
);

// Generate shareable link
router.post(
  '/:id/share/link',
  fileController.generateShareLink
);

// Revoke shareable link
router.delete(
  '/:id/share/link',
  fileController.revokeShareLink
);

// Get file metadata
router.get(
  '/:id/metadata',
  fileController.getFileMetadata
);

// Update file metadata
router.patch(
  '/:id/metadata',
  fileController.updateFileMetadata
);

// Admin routes
router.use(hasPermission('admin'));

// Quarantine file (admin only)
router.post(
  '/admin/files/:id/quarantine',
  fileController.quarantineFile
);

// Restore file from quarantine (admin only)
router.post(
  '/admin/files/:id/restore',
  fileController.restoreFile
);

// Get all files (admin only)
router.get(
  '/admin/files',
  fileController.getAllFiles
);

// Get file by ID (admin only)
router.get(
  '/admin/files/:id',
  fileController.adminGetFile
);

// Update file (admin only)
router.put(
  '/admin/files/:id',
  fileController.adminUpdateFile
);

// Delete file (admin only)
router.delete(
  '/admin/files/:id',
  fileController.adminDeleteFile
);

module.exports = router;
