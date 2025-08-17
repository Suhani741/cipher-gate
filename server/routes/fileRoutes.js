const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { uploadFile, getFiles, downloadFile, deleteFile } = require('../controllers/fileController');

// Apply protect middleware to all routes
router.use(protect);

// File routes
router.route('/')
  .get(getFiles) // Get all files for the authenticated user
  .post(uploadFile); // Upload a new file

router.route('/:id')
  .delete(deleteFile); // Delete a file

router.route('/download/:id')
  .get(downloadFile); // Download a file

module.exports = router;
