const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const {
  getUsers,
  deleteUser,
  getUserById,
  updateUser,
  getQuarantinedFiles,
  updateFileStatus,
  getSystemStats,
} = require('../controllers/adminController');

// Apply both protect and admin middleware to all admin routes
router.use(protect, admin);

// User management routes
router.route('/users')
  .get(getUsers);

router.route('/users/:id')
  .get(getUserById)
  .put(updateUser)
  .delete(deleteUser);

// File management routes
router.route('/files/quarantined')
  .get(getQuarantinedFiles);

router.route('/files/:id/status')
  .put(updateFileStatus);

// System stats
router.route('/stats')
  .get(getSystemStats);

module.exports = router;
