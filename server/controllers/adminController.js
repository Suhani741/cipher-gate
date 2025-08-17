const User = require('../models/userModel');
const File = require('../models/fileModel');

// @desc    Get all users
// @route   GET /api/admin/users
// @access  Private/Admin
const getUsers = async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get user by ID
// @route   GET /api/admin/users/:id
// @access  Private/Admin
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (user) {
      res.json(user);
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update user
// @route   PUT /api/admin/users/:id
// @access  Private/Admin
const updateUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      user.isAdmin = req.body.isAdmin !== undefined ? req.body.isAdmin : user.isAdmin;

      const updatedUser = await user.save();
      res.json({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        isAdmin: updatedUser.isAdmin,
      });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private/Admin
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (user) {
      // Delete all files associated with the user
      await File.deleteMany({ user: user._id });
      
      // Delete the user
      await user.remove();
      
      res.json({ message: 'User removed' });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all quarantined files
// @route   GET /api/admin/files/quarantined
// @access  Private/Admin
const getQuarantinedFiles = async (req, res) => {
  try {
    const files = await File.find({ isQuarantined: true })
      .populate('user', 'name email')
      .sort({ createdAt: -1 });
    
    res.json(files);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Update file status (quarantine/release)
// @route   PUT /api/admin/files/:id/status
// @access  Private/Admin
const updateFileStatus = async (req, res) => {
  try {
    const { isQuarantined } = req.body;
    const file = await File.findById(req.params.id);

    if (file) {
      file.isQuarantined = isQuarantined !== undefined ? isQuarantined : file.isQuarantined;
      
      if (req.body.riskScore !== undefined) {
        file.riskScore = req.body.riskScore;
      }
      
      const updatedFile = await file.save();
      res.json(updatedFile);
    } else {
      res.status(404);
      throw new Error('File not found');
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get system statistics
// @route   GET /api/admin/stats
// @access  Private/Admin
const getSystemStats = async (req, res) => {
  try {
    const [
      totalUsers,
      totalFiles,
      quarantinedFiles,
      activeUsers,
      storageUsed
    ] = await Promise.all([
      User.countDocuments({}),
      File.countDocuments({}),
      File.countDocuments({ isQuarantined: true }),
      User.countDocuments({ lastActive: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }),
      File.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: '$fileSize' }
          }
        }
      ])
    ]);

    res.json({
      totalUsers,
      totalFiles,
      quarantinedFiles,
      activeUsers,
      storageUsed: storageUsed[0]?.total || 0,
      lastUpdated: new Date()
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  getUsers,
  getUserById,
  updateUser,
  deleteUser,
  getQuarantinedFiles,
  updateFileStatus,
  getSystemStats,
};
