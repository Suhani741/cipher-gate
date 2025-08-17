const Folder = require('../models/folder.model');
const File = require('../models/file.model');
const User = require('../models/user.model');
const logger = require('../utils/logger');
const { FILE_PERMISSIONS } = require('../models/file.model');
const config = require('../config');

// Set folder color
exports.setFolderColor = async (req, res) => {
  try {
    const { id } = req.params;
    const { color } = req.body;
    const userId = req.user._id;
    
    // Validate color (simple hex color validation)
    if (!/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid color format. Use hex color code (e.g., #FF5733)'
      });
    }
    
    const folder = await Folder.findById(id);
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    // Check if user has permission to edit this folder
    if (folder.owner.toString() !== userId.toString() && 
        !folder.hasPermission(userId, FILE_PERMISSIONS.EDIT)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to edit this folder'
      });
    }
    
    // Update folder color
    folder.metadata = {
      ...folder.metadata,
      color
    };
    
    await folder.save();
    
    res.json({
      success: true,
      data: folder
    });
  } catch (error) {
    logger.error('Error setting folder color:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting folder color',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Set folder icon
exports.setFolderIcon = async (req, res) => {
  try {
    const { id } = req.params;
    const { icon } = req.body;
    const userId = req.user._id;
    
    const folder = await Folder.findById(id);
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    // Check if user has permission to edit this folder
    if (folder.owner.toString() !== userId.toString() && 
        !folder.hasPermission(userId, FILE_PERMISSIONS.EDIT)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to edit this folder'
      });
    }
    
    // Update folder icon
    folder.metadata = {
      ...folder.metadata,
      icon
    };
    
    await folder.save();
    
    res.json({
      success: true,
      data: folder
    });
  } catch (error) {
    logger.error('Error setting folder icon:', error);
    res.status(500).json({
      success: false,
      message: 'Error setting folder icon',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Add folder tag
exports.addFolderTag = async (req, res) => {
  try {
    const { id } = req.params;
    const { tag } = req.body;
    const userId = req.user._id;
    
    if (!tag || typeof tag !== 'string' || tag.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Tag is required'
      });
    }
    
    const folder = await Folder.findById(id);
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    // Check if user has permission to edit this folder
    if (folder.owner.toString() !== userId.toString() && 
        !folder.hasPermission(userId, FILE_PERMISSIONS.EDIT)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to edit this folder'
      });
    }
    
    // Initialize tags array if it doesn't exist
    if (!folder.metadata.tags) {
      folder.metadata.tags = [];
    }
    
    // Add tag if it doesn't already exist
    const tagLower = tag.trim().toLowerCase();
    
    if (!folder.metadata.tags.some(t => t.toLowerCase() === tagLower)) {
      folder.metadata.tags.push(tag.trim());
      await folder.save();
    }
    
    res.json({
      success: true,
      data: folder.metadata.tags
    });
  } catch (error) {
    logger.error('Error adding folder tag:', error);
    res.status(500).json({
      success: false,
      message: 'Error adding folder tag',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Remove folder tag
exports.removeFolderTag = async (req, res) => {
  try {
    const { id, tag } = req.params;
    const userId = req.user._id;
    
    const folder = await Folder.findById(id);
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    // Check if user has permission to edit this folder
    if (folder.owner.toString() !== userId.toString() && 
        !folder.hasPermission(userId, FILE_PERMISSIONS.EDIT)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to edit this folder'
      });
    }
    
    // Check if tags exist
    if (!folder.metadata.tags || !Array.isArray(folder.metadata.tags)) {
      return res.status(400).json({
        success: false,
        message: 'No tags found on this folder'
      });
    }
    
    // Find and remove the tag (case insensitive)
    const tagIndex = folder.metadata.tags.findIndex(
      t => t.toLowerCase() === tag.toLowerCase()
    );
    
    if (tagIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Tag not found'
      });
    }
    
    // Remove the tag
    folder.metadata.tags.splice(tagIndex, 1);
    
    // If no tags left, remove the tags array
    if (folder.metadata.tags.length === 0) {
      delete folder.metadata.tags;
    }
    
    await folder.save();
    
    res.json({
      success: true,
      message: 'Tag removed successfully'
    });
  } catch (error) {
    logger.error('Error removing folder tag:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing folder tag',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Search folders and files within a folder
exports.searchInFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { query, type, sortBy = 'name', sortOrder = 'asc', page = 1, limit = 20 } = req.query;
    const userId = req.user._id;
    
    if (!query || typeof query !== 'string' || query.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }
    
    // Validate sort order
    const sortDirection = sortOrder.toLowerCase() === 'desc' ? -1 : 1;
    
    // Build search query
    const searchQuery = {
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { 'metadata.tags': { $regex: query, $options: 'i' } },
        { description: { $regex: query, $options: 'i' } }
      ]
    };
    
    // Add parent folder filter if not root
    if (id !== 'root') {
      // First verify the user has access to the parent folder
      const parentFolder = await Folder.findById(id);
      
      if (!parentFolder) {
        return res.status(404).json({
          success: false,
          message: 'Parent folder not found'
        });
      }
      
      if (parentFolder.owner.toString() !== userId.toString() && 
          !parentFolder.hasPermission(userId, FILE_PERMISSIONS.VIEW)) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to search in this folder'
        });
      }
      
      // For folders, search in the specified parent
      searchQuery.parent = id;
    } else {
      // For root, search in all folders the user has access to
      const accessibleFolders = await Folder.find({
        $or: [
          { owner: userId },
          { 'sharedWith.user': userId }
        ]
      }).select('_id');
      
      searchQuery.$or = [
        { ...searchQuery.$or[0], parent: { $in: accessibleFolders.map(f => f._id) } },
        ...searchQuery.$or.slice(1)
      ];
    }
    
    // Add type filter if specified
    if (type === 'folder') {
      searchQuery.isTrash = false; // Don't include trashed folders in search
    } else if (type === 'file') {
      searchQuery.status = { $ne: 'deleted' }; // Don't include deleted files
    }
    
    // Execute search based on type
    let results = [];
    let total = 0;
    
    if (!type || type === 'folder') {
      const folderQuery = { ...searchQuery };
      if (type === 'folder') {
        // If specifically searching for folders, exclude files
        folderQuery.isTrash = false;
      }
      
      const [folderResults, folderTotal] = await Promise.all([
        Folder.find(folderQuery)
          .sort({ [sortBy]: sortDirection })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .lean(),
        Folder.countDocuments(folderQuery)
      ]);
      
      results = results.concat(folderResults.map(f => ({
        ...f,
        type: 'folder',
        name: f.name,
        path: f.path,
        size: f.size,
        modifiedAt: f.updatedAt
      })));
      
      total += folderTotal;
    }
    
    if (!type || type === 'file') {
      const fileQuery = { ...searchQuery };
      if (type === 'file') {
        // If specifically searching for files, exclude folders
        fileQuery.status = { $ne: 'deleted' };
      }
      
      const [fileResults, fileTotal] = await Promise.all([
        File.find(fileQuery)
          .sort({ [sortBy]: sortDirection })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .lean(),
        File.countDocuments(fileQuery)
      ]);
      
      results = results.concat(fileResults.map(f => ({
        ...f,
        type: 'file',
        name: f.originalName || f.name,
        path: f.path,
        size: f.size,
        modifiedAt: f.updatedAt,
        mimeType: f.mimeType
      })));
      
      total += fileTotal;
    }
    
    // Sort combined results if needed
    if (results.length > 0) {
      results.sort((a, b) => {
        const aValue = a[sortBy];
        const bValue = b[sortBy];
        
        if (aValue < bValue) return sortDirection * -1;
        if (aValue > bValue) return sortDirection * 1;
        return 0;
      });
    }
    
    // Paginate combined results
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const paginatedResults = results.slice(startIndex, endIndex);
    
    res.json({
      success: true,
      data: {
        items: paginatedResults,
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / limit),
        hasMore: endIndex < total
      }
    });
  } catch (error) {
    logger.error('Error searching in folder:', error);
    res.status(500).json({
      success: false,
      message: 'Error performing search',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Get folder statistics
exports.getFolderStats = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const folder = id === 'root' 
      ? { _id: null, owner: userId } // Special case for root folder
      : await Folder.findById(id);
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    // Check if user has permission to view this folder
    if (folder.owner.toString() !== userId.toString() && 
        !folder.hasPermission(userId, FILE_PERMISSIONS.VIEW)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to view this folder\'s statistics'
      });
    }
    
    // Helper function to calculate folder size recursively
    const calculateFolderSize = async (folderId) => {
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
      
      return totalSize;
    };
    
    // Calculate folder size
    const size = await calculateFolderSize(folder._id);
    
    // Get file and folder counts
    const [fileCount, folderCount, fileTypes] = await Promise.all([
      File.countDocuments({ 
        folder: folder._id || { $in: [null, ''] }, 
        status: { $ne: 'deleted' } 
      }),
      Folder.countDocuments({ 
        parent: folder._id || { $in: [null, ''] }, 
        isTrash: false 
      }),
      File.aggregate([
        { 
          $match: { 
            folder: folder._id || { $in: [null, ''] },
            status: { $ne: 'deleted' } 
          } 
        },
        {
          $group: {
            _id: '$mimeType',
            count: { $sum: 1 },
            totalSize: { $sum: '$size' }
          }
        },
        { $sort: { count: -1 } }
      ])
    ]);
    
    // Get storage usage by file type
    const storageByType = fileTypes.map(type => ({
      mimeType: type._id,
      count: type.count,
      size: type.totalSize
    }));
    
    // Calculate storage usage over time (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // TODO: Implement file history tracking for more accurate storage over time
    // For now, just return the current size
    const storageOverTime = [
      { date: thirtyDaysAgo, size: 0 },
      { date: new Date(), size }
    ];
    
    res.json({
      success: true,
      data: {
        folder: {
          id: folder._id || 'root',
          name: folder.name || 'Root',
          path: folder.path || '/'
        },
        stats: {
          totalSize: size,
          fileCount,
          folderCount,
          storageByType,
          storageOverTime
        }
      }
    });
  } catch (error) {
    logger.error('Error getting folder stats:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting folder statistics',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};
