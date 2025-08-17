const express = require('express');
const router = express.Router();
const folderController = require('../controllers/folder.controller');
const { protect, hasPermission } = require('../middleware/auth.middleware');
const { FILE_PERMISSIONS } = require('../models/file.model');

// Apply protect middleware to all routes
router.use(protect);

// Create a new folder
router.post(
  '/',
  folderController.createFolder
);

// Get folder contents
router.get(
  '/:id/contents',
  folderController.getFolderContents
);

// Get folder tree
router.get(
  '/tree',
  folderController.getFolderTree
);

// Get folder info
router.get(
  '/:id',
  folderController.getFolderInfo
);

// Update folder info
router.put(
  '/:id',
  folderController.updateFolder
);

// Delete folder
router.delete(
  '/:id',
  folderController.deleteFolder
);

// Move folder
router.patch(
  '/:id/move',
  folderController.moveFolder
);

// Copy folder
router.post(
  '/:id/copy',
  folderController.copyFolder
);

// Rename folder
router.patch(
  '/:id/rename',
  folderController.renameFolder
);

// Share folder with user
router.post(
  '/:id/share',
  folderController.shareFolder
);

// Remove user's access to folder
router.delete(
  '/:id/share/:userId',
  folderController.unshareFolder
);

// Get folder activity
router.get(
  '/:id/activity',
  folderController.getFolderActivity
);

// Get folder statistics
router.get(
  '/:id/stats',
  folderController.getFolderStats
);

// Get folder breadcrumbs
router.get(
  '/:id/breadcrumbs',
  folderController.getBreadcrumbs
);

// Generate shareable link
router.post(
  '/:id/share/link',
  folderController.generateShareLink
);

// Revoke shareable link
router.delete(
  '/:id/share/link',
  folderController.revokeShareLink
);

// Set folder color
router.patch(
  '/:id/color',
  folderController.setFolderColor
);

// Set folder icon
router.patch(
  '/:id/icon',
  folderController.setFolderIcon
);

// Add folder tag
router.post(
  '/:id/tags',
  folderController.addFolderTag
);

// Remove folder tag
router.delete(
  '/:id/tags/:tag',
  folderController.removeFolderTag
);

// Search within folder
router.get(
  '/:id/search',
  folderController.searchInFolder
);

// Admin routes
router.use(hasPermission('admin'));

// Get all folders (admin only)
router.get(
  '/admin/folders',
  folderController.getAllFolders
);

// Get folder by ID (admin only)
router.get(
  '/admin/folders/:id',
  folderController.adminGetFolder
);

// Update folder (admin only)
router.put(
  '/admin/folders/:id',
  folderController.adminUpdateFolder
);

// Delete folder (admin only)
router.delete(
  '/admin/folders/:id',
  folderController.adminDeleteFolder
);

module.exports = router;
