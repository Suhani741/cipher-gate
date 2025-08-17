const Folder = require('../models/folder.model');
const File = require('../models/file.model');
const User = require('../models/user.model');
const logger = require('../utils/logger');
const { FILE_PERMISSIONS } = require('../models/file.model');
const config = require('../config');
const { sendNotification } = require('../services/notification.service');

// Admin: Get all folders (paginated)
exports.adminGetAllFolders = async (req, res) => {
  try {
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', search } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Build query
    const query = {};
    
    // Add search filter if provided
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'owner.email': { $regex: search, $options: 'i' } },
        { 'owner.name': { $regex: search, $options: 'i' } },
        { path: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Get total count and paginated results
    const [total, folders] = await Promise.all([
      Folder.countDocuments(query),
      Folder.find(query)
        .populate('owner', 'name email')
        .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean()
    ]);
    
    res.json({
      success: true,
      data: {
        items: folders,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        hasMore: skip + folders.length < total
      }
    });
  } catch (error) {
    logger.error('Error getting all folders (admin):', error);
    res.status(500).json({
      success: false,
      message: 'Error getting folders',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Admin: Get folder by ID
exports.adminGetFolder = async (req, res) => {
  try {
    const { id } = req.params;
    
    const folder = await Folder.findById(id)
      .populate('owner', 'name email')
      .populate('sharedWith.user', 'name email')
      .populate('sharedBy', 'name email')
      .lean();
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    res.json({
      success: true,
      data: folder
    });
  } catch (error) {
    logger.error('Error getting folder (admin):', error);
    res.status(500).json({
      success: false,
      message: 'Error getting folder',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Admin: Update folder
exports.adminUpdateFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    
    // Prevent updating sensitive fields
    const { _id, owner, createdAt, updatedAt, ...safeUpdateData } = updateData;
    
    const folder = await Folder.findByIdAndUpdate(
      id,
      { $set: safeUpdateData },
      { new: true, runValidators: true }
    );
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    res.json({
      success: true,
      data: folder
    });
  } catch (error) {
    logger.error('Error updating folder (admin):', error);
    res.status(500).json({
      success: false,
      message: 'Error updating folder',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Admin: Delete folder permanently
exports.adminDeleteFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { notifyUser = true, reason } = req.body;
    
    // Find the folder first to get the owner
    const folder = await Folder.findById(id).populate('owner', 'email name');
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    const ownerId = folder.owner._id;
    
    // Delete the folder and all its contents recursively
    await deleteFolderRecursive(id);
    
    // Notify the owner if requested
    if (notifyUser && folder.owner) {
      try {
        await sendNotification({
          to: folder.owner.email,
          subject: 'Folder Deleted by Admin',
          template: 'folder-deleted-admin',
          context: {
            userName: folder.owner.name,
            folderName: folder.name,
            folderPath: folder.path,
            reason: reason || 'No reason provided',
            supportEmail: config.app.supportEmail || 'support@ciphergate.com'
          }
        });
      } catch (notificationError) {
        logger.error('Error sending folder deletion notification:', notificationError);
        // Continue even if notification fails
      }
    }
    
    res.json({
      success: true,
      message: 'Folder and all its contents have been permanently deleted'
    });
  } catch (error) {
    logger.error('Error deleting folder (admin):', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting folder',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Helper function to delete a folder and all its contents recursively
const deleteFolderRecursive = async (folderId) => {
  try {
    // Delete all files in this folder
    await File.deleteMany({ folder: folderId });
    
    // Find all subfolders
    const subfolders = await Folder.find({ parent: folderId });
    
    // Recursively delete all subfolders
    for (const subfolder of subfolders) {
      await deleteFolderRecursive(subfolder._id);
    }
    
    // Delete the folder itself
    await Folder.findByIdAndDelete(folderId);
    
    return true;
  } catch (error) {
    logger.error(`Error deleting folder ${folderId} recursively:`, error);
    throw error;
  }
};

// Admin: Get folder statistics
exports.adminGetFolderStats = async (req, res) => {
  try {
    const { timeRange = '30d' } = req.query;
    
    // Calculate date range
    const endDate = new Date();
    let startDate = new Date();
    
    switch (timeRange) {
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setMonth(endDate.getMonth() - 1);
        break;
      case '90d':
        startDate.setMonth(endDate.getMonth() - 3);
        break;
      case '1y':
        startDate.setFullYear(endDate.getFullYear() - 1);
        break;
      default:
        startDate.setMonth(endDate.getMonth() - 1);
    }
    
    // Get folder creation stats
    const folderStats = await Folder.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { _id: 1 } }
    ]);
    
    // Get top users by folder count
    const topUsers = await Folder.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: '$owner',
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      { $unwind: '$user' },
      {
        $project: {
          _id: 0,
          userId: '$_id',
          name: { $concat: ['$user.firstName', ' ', '$user.lastName'] },
          email: '$user.email',
          count: 1
        }
      }
    ]);
    
    // Get folder size distribution
    const sizeDistribution = await Folder.aggregate([
      {
        $match: {
          size: { $gt: 0 }
        }
      },
      {
        $bucket: {
          groupBy: '$size',
          boundaries: [0, 1024 * 1024, 10 * 1024 * 1024, 100 * 1024 * 1024, 1024 * 1024 * 1024, Number.MAX_SAFE_INTEGER],
          default: 'other',
          output: {
            count: { $sum: 1 },
            totalSize: { $sum: '$size' }
          }
        }
      },
      {
        $project: {
          range: {
            $switch: {
              branches: [
                { case: { $eq: ['$_id', 0] }, then: '0-1MB' },
                { case: { $eq: ['$_id', 1] }, then: '1MB-10MB' },
                { case: { $eq: ['$_id', 2] }, then: '10MB-100MB' },
                { case: { $eq: ['$_id', 3] }, then: '100MB-1GB' },
                { case: { $eq: ['$_id', 'other'] }, then: '1GB+' }
              ],
              default: 'unknown'
            }
          },
          count: 1,
          totalSize: 1
        }
      },
      { $sort: { '_id': 1 } }
    ]);
    
    res.json({
      success: true,
      data: {
        timeRange: {
          start: startDate,
          end: endDate
        },
        totalFolders: await Folder.countDocuments({
          createdAt: { $gte: startDate, $lte: endDate }
        }),
        totalSize: await Folder.aggregate([
          {
            $match: {
              createdAt: { $gte: startDate, $lte: endDate }
            }
          },
          {
            $group: {
              _id: null,
              total: { $sum: '$size' }
            }
          }
        ]).then(results => results[0]?.total || 0),
        folderStats,
        topUsers,
        sizeDistribution
      }
    });
  } catch (error) {
    logger.error('Error getting folder statistics (admin):', error);
    res.status(500).json({
      success: false,
      message: 'Error getting folder statistics',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Admin: Clean up orphaned folders
exports.adminCleanupOrphanedFolders = async (req, res) => {
  try {
    // Find all folders where parent doesn't exist and it's not a root folder
    const allFolders = await Folder.find({});
    const folderIds = allFolders.map(f => f._id.toString());
    
    const orphanedFolders = [];
    
    for (const folder of allFolders) {
      if (folder.parent && folder.parent.toString() !== 'root' && !folderIds.includes(folder.parent.toString())) {
        orphanedFolders.push(folder);
      }
    }
    
    // Delete all orphaned folders
    const deletePromises = orphanedFolders.map(folder => 
      deleteFolderRecursive(folder._id)
    );
    
    await Promise.all(deletePromises);
    
    res.json({
      success: true,
      message: `Cleaned up ${orphanedFolders.length} orphaned folders`,
      data: {
        count: orphanedFolders.length,
        folders: orphanedFolders.map(f => ({
          id: f._id,
          name: f.name,
          path: f.path,
          parent: f.parent,
          owner: f.owner
        }))
      }
    });
  } catch (error) {
    logger.error('Error cleaning up orphaned folders:', error);
    res.status(500).json({
      success: false,
      message: 'Error cleaning up orphaned folders',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Admin: Recalculate folder sizes
exports.adminRecalculateFolderSizes = async (req, res) => {
  try {
    const { folderId } = req.params;
    
    // If no folderId provided, update all folders
    if (!folderId) {
      // Get all root folders (folders with no parent or parent=null)
      const rootFolders = await Folder.find({
        $or: [
          { parent: { $exists: false } },
          { parent: null },
          { parent: '' },
          { parent: 'root' }
        ]
      });
      
      // Recalculate size for each root folder (which will recursively update all subfolders)
      const results = [];
      
      for (const folder of rootFolders) {
        const size = await calculateFolderSize(folder._id);
        results.push({
          id: folder._id,
          name: folder.name,
          path: folder.path,
          size
        });
      }
      
      return res.json({
        success: true,
        message: `Recalculated sizes for ${results.length} root folders`,
        data: results
      });
    }
    
    // Recalculate size for a specific folder
    const folder = await Folder.findById(folderId);
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    const size = await calculateFolderSize(folderId);
    
    res.json({
      success: true,
      data: {
        id: folder._id,
        name: folder.name,
        path: folder.path,
        size
      }
    });
  } catch (error) {
    logger.error('Error recalculating folder sizes:', error);
    res.status(500).json({
      success: false,
      message: 'Error recalculating folder sizes',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Helper function to calculate folder size recursively
const calculateFolderSize = async (folderId) => {
  try {
    let totalSize = 0;
    
    // Get size of all files in this folder
    const files = await File.find({ 
      folder: folderId || { $in: [null, ''] }, 
      status: { $ne: 'deleted' } 
    }).select('size');
    
    totalSize += files.reduce((sum, file) => sum + (file.size || 0), 0);
    
    // Get all subfolders
    const subfolders = await Folder.find({ 
      parent: folderId || { $in: [null, ''] }, 
      isTrash: false 
    }).select('_id');
    
    // Calculate size of each subfolder
    for (const subfolder of subfolders) {
      totalSize += await calculateFolderSize(subfolder._id);
    }
    
    // Update the folder's size in the database
    if (folderId) {
      await Folder.findByIdAndUpdate(folderId, { size: totalSize });
    }
    
    return totalSize;
  } catch (error) {
    logger.error(`Error calculating size for folder ${folderId || 'root'}:`, error);
    throw error;
  }
};

// Export the helper function for use in other files
exports.calculateFolderSize = calculateFolderSize;
