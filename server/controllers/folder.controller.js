const Folder = require('../models/folder.model');
const File = require('../models/file.model');
const User = require('../models/user.model');
const logger = require('../utils/logger');
const { FILE_PERMISSIONS } = require('../models/file.model');
const config = require('../config');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// Helper function to calculate folder size recursively
const calculateFolderSize = async (folderId) => {
  try {
    // Calculate size of files in this folder
    const fileStats = await File.aggregate([
      { $match: { folder: folderId, status: { $ne: 'deleted' } } },
      { $group: { _id: null, totalSize: { $sum: '$size' } } }
    ]);
    
    const fileSize = fileStats[0]?.totalSize || 0;
    
    // Get all subfolders
    const subfolders = await Folder.find({ parent: folderId, isTrash: false });
    
    // Calculate size of each subfolder
    let subfolderSize = 0;
    for (const subfolder of subfolders) {
      subfolderSize += await calculateFolderSize(subfolder._id);
    }
    
    return fileSize + subfolderSize;
  } catch (error) {
    logger.error(`Error calculating folder size for ${folderId}:`, error);
    return 0;
  }
};

// Create a new folder
exports.createFolder = async (req, res) => {
  try {
    const { name, parent, description, metadata } = req.body;
    const userId = req.user._id;
    
    // Validate input
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Folder name is required'
      });
    }
    
    // Check if folder with same name already exists in the same location
    const existingFolder = await Folder.findOne({
      name: name.trim(),
      parent: parent || null,
      owner: userId,
      isTrash: false
    });
    
    if (existingFolder) {
      return res.status(409).json({
        success: false,
        message: 'A folder with this name already exists in this location'
      });
    }
    
    // Create new folder
    const folder = new Folder({
      name: name.trim(),
      description: description || '',
      parent: parent || null,
      owner: userId,
      metadata: metadata || {}
    });
    
    // If parent is specified, update the parent's folder count
    if (parent) {
      const parentFolder = await Folder.findById(parent);
      
      if (!parentFolder) {
        return res.status(404).json({
          success: false,
          message: 'Parent folder not found'
        });
      }
      
      // Check if user has permission to add to this folder
      if (parentFolder.owner.toString() !== userId.toString() && 
          !parentFolder.hasPermission(userId, FILE_PERMISSIONS.EDIT)) {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to create a folder here'
        });
      }
      
      // Update parent's folder count
      parentFolder.folderCount += 1;
      await parentFolder.save();
      
      // Set the path based on parent's path
      folder.path = `${parentFolder.path}${parentFolder.name}/`;
    } else {
      // Root level folder
      folder.path = '/';
    }
    
    await folder.save();
    
    res.status(201).json({
      success: true,
      data: folder
    });
  } catch (error) {
    logger.error('Error creating folder:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating folder',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Get folder contents
exports.getFolderContents = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20, sortBy = 'name', sortOrder = 'asc', type } = req.query;
    const userId = req.user._id;
    
    // Find the folder
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
        message: 'You do not have permission to view this folder'
      });
    }
    
    // Build query for files
    const fileQuery = {
      folder: id === 'root' ? { $in: [null, ''] } : id,
      status: { $ne: 'deleted' },
      $or: [
        { owner: userId },
        { 'sharedWith.user': userId }
      ]
    };
    
    // Build query for subfolders
    const folderQuery = {
      parent: id === 'root' ? { $in: [null, ''] } : id,
      isTrash: false,
      $or: [
        { owner: userId },
        { 'sharedWith.user': userId }
      ]
    };
    
    // Apply type filter if specified
    if (type === 'file') {
      // Only get files
      const [files, totalFiles] = await Promise.all([
        File.find(fileQuery)
          .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .populate('owner', 'name email')
          .lean(),
        File.countDocuments(fileQuery)
      ]);
      
      return res.json({
        success: true,
        data: {
          folder: id === 'root' ? { _id: 'root', name: 'Root', path: '/' } : folder,
          files,
          totalFiles,
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalFiles / limit)
        }
      });
    } else if (type === 'folder') {
      // Only get folders
      const [folders, totalFolders] = await Promise.all([
        Folder.find(folderQuery)
          .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .populate('owner', 'name email')
          .lean(),
        Folder.countDocuments(folderQuery)
      ]);
      
      return res.json({
        success: true,
        data: {
          folder: id === 'root' ? { _id: 'root', name: 'Root', path: '/' } : folder,
          folders,
          totalFolders,
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalFolders / limit)
        }
      });
    } else {
      // Get both files and folders
      const [files, totalFiles, folders, totalFolders] = await Promise.all([
        File.find(fileQuery)
          .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .populate('owner', 'name email')
          .lean(),
        File.countDocuments(fileQuery),
        Folder.find(folderQuery)
          .sort({ [sortBy]: sortOrder === 'desc' ? -1 : 1 })
          .skip((page - 1) * limit)
          .limit(parseInt(limit))
          .populate('owner', 'name email')
          .lean(),
        Folder.countDocuments(folderQuery)
      ]);
      
      return res.json({
        success: true,
        data: {
          folder: id === 'root' ? { _id: 'root', name: 'Root', path: '/' } : folder,
          files,
          folders,
          totalFiles,
          totalFolders,
          currentPage: parseInt(page),
          totalPages: Math.max(
            Math.ceil(totalFiles / limit),
            Math.ceil(totalFolders / limit)
          )
        }
      });
    }
  } catch (error) {
    logger.error('Error getting folder contents:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting folder contents',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Get folder tree
exports.getFolderTree = async (req, res) => {
  try {
    const userId = req.user._id;
    
    // Get all folders for the user
    const folders = await Folder.find({
      $or: [
        { owner: userId },
        { 'sharedWith.user': userId }
      ],
      isTrash: false
    }).select('name parent path');
    
    // Build tree structure
    const buildTree = (parentId = null) => {
      const children = folders
        .filter(folder => 
          (folder.parent && folder.parent.toString() === parentId?.toString()) || 
          (!folder.parent && !parentId)
        )
        .map(folder => ({
          ...folder.toObject(),
          children: buildTree(folder._id)
        }));
      
      return children;
    };
    
    const tree = buildTree();
    
    res.json({
      success: true,
      data: tree
    });
  } catch (error) {
    logger.error('Error getting folder tree:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting folder tree',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Get folder info
exports.getFolderInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    // Handle root folder
    if (id === 'root') {
      // Get root folder contents
      const [fileCount, folderCount, totalSize] = await Promise.all([
        File.countDocuments({ 
          folder: { $in: [null, ''] },
          status: { $ne: 'deleted' },
          owner: userId
        }),
        Folder.countDocuments({ 
          parent: { $in: [null, ''] },
          isTrash: false,
          owner: userId
        }),
        calculateFolderSize(null) // Pass null for root folder
      ]);
      
      return res.json({
        success: true,
        data: {
          _id: 'root',
          name: 'Root',
          path: '/',
          owner: userId,
          fileCount,
          folderCount,
          size: totalSize,
          isRoot: true
        }
      });
    }
    
    const folder = await Folder.findById(id)
      .populate('owner', 'name email')
      .populate('sharedWith.user', 'name email');
    
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
        message: 'You do not have permission to view this folder'
      });
    }
    
    // Calculate folder size
    const size = await calculateFolderSize(folder._id);
    
    // Get file and folder counts
    const [fileCount, folderCount] = await Promise.all([
      File.countDocuments({ 
        folder: folder._id, 
        status: { $ne: 'deleted' } 
      }),
      Folder.countDocuments({ 
        parent: folder._id, 
        isTrash: false 
      })
    ]);
    
    const folderInfo = {
      ...folder.toObject(),
      size,
      fileCount,
      folderCount
    };
    
    res.json({
      success: true,
      data: folderInfo
    });
  } catch (error) {
    logger.error('Error getting folder info:', error);
    res.status(500).json({
      success: false,
      message: 'Error getting folder info',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Update folder info
exports.updateFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, metadata, color, icon } = req.body;
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
    
    // Update fields if provided
    if (name && typeof name === 'string' && name.trim() !== '') {
      // Check if folder with same name already exists in the same location
      const existingFolder = await Folder.findOne({
        name: name.trim(),
        parent: folder.parent || null,
        owner: folder.owner,
        isTrash: false,
        _id: { $ne: id }
      });
      
      if (existingFolder) {
        return res.status(409).json({
          success: false,
          message: 'A folder with this name already exists in this location'
        });
      }
      
      folder.name = name.trim();
    }
    
    if (description !== undefined) {
      folder.description = description || '';
    }
    
    if (metadata) {
      folder.metadata = { ...folder.metadata, ...metadata };
    }
    
    if (color) {
      folder.metadata = {
        ...folder.metadata,
        color
      };
    }
    
    if (icon) {
      folder.metadata = {
        ...folder.metadata,
        icon
      };
    }
    
    await folder.save();
    
    res.json({
      success: true,
      data: folder
    });
  } catch (error) {
    logger.error('Error updating folder:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating folder',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Delete folder
exports.deleteFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { permanent = false } = req.query;
    const userId = req.user._id;
    
    const folder = await Folder.findById(id);
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    // Check if user has permission to delete this folder
    if (folder.owner.toString() !== userId.toString() && 
        !folder.hasPermission(userId, FILE_PERMISSIONS.MANAGE)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to delete this folder'
      });
    }
    
    if (permanent) {
      // Permanently delete the folder and all its contents
      await deleteFolderRecursive(folder._id);
      
      // Update parent's folder count if this folder has a parent
      if (folder.parent) {
        await Folder.updateOne(
          { _id: folder.parent },
          { $inc: { folderCount: -1 } }
        );
      }
      
      return res.json({
        success: true,
        message: 'Folder permanently deleted'
      });
    } else {
      // Move folder to trash
      folder.isTrash = true;
      folder.deletedAt = new Date();
      await folder.save();
      
      // Update parent's folder count if this folder has a parent
      if (folder.parent) {
        await Folder.updateOne(
          { _id: folder.parent },
          { $inc: { folderCount: -1 } }
        );
      }
      
      // Move all files in this folder to trash
      await File.updateMany(
        { folder: folder._id },
        { status: 'deleted', deletedAt: new Date() }
      );
      
      // Move all subfolders to trash
      await Folder.updateMany(
        { parent: folder._id },
        { isTrash: true, deletedAt: new Date() }
      );
      
      return res.json({
        success: true,
        message: 'Folder moved to trash'
      });
    }
  } catch (error) {
    logger.error('Error deleting folder:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting folder',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Helper function to recursively delete a folder and its contents
const deleteFolderRecursive = async (folderId) => {
  try {
    // Delete all files in this folder
    await File.deleteMany({ folder: folderId });
    
    // Get all subfolders
    const subfolders = await Folder.find({ parent: folderId });
    
    // Recursively delete all subfolders
    for (const subfolder of subfolders) {
      await deleteFolderRecursive(subfolder._id);
    }
    
    // Delete the folder itself
    await Folder.findByIdAndDelete(folderId);
  } catch (error) {
    logger.error(`Error deleting folder ${folderId} recursively:`, error);
    throw error;
  }
};

// Move folder
exports.moveFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { parentId } = req.body;
    const userId = req.user._id;
    
    const folder = await Folder.findById(id);
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    // Check if user has permission to move this folder
    if (folder.owner.toString() !== userId.toString() && 
        !folder.hasPermission(userId, FILE_PERMISSIONS.EDIT)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to move this folder'
      });
    }
    
    // If parentId is null, move to root
    if (!parentId) {
      // Update parent's folder count
      if (folder.parent) {
        await Folder.updateOne(
          { _id: folder.parent },
          { $inc: { folderCount: -1 } }
        );
      }
      
      // Move to root
      const oldParentId = folder.parent;
      folder.parent = null;
      folder.path = '/';
      await folder.save();
      
      // Update paths of all descendants
      await updateDescendantPaths(folder._id, folder.path);
      
      return res.json({
        success: true,
        message: 'Folder moved to root'
      });
    }
    
    // Check if new parent exists
    const newParent = await Folder.findById(parentId);
    
    if (!newParent) {
      return res.status(404).json({
        success: false,
        message: 'Destination folder not found'
      });
    }
    
    // Check if user has permission to move to the new parent
    if (newParent.owner.toString() !== userId.toString() && 
        !newParent.hasPermission(userId, FILE_PERMISSIONS.EDIT)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to move to the destination folder'
      });
    }
    
    // Check for circular reference (can't move a folder into itself or its descendants)
    if (folder._id.toString() === parentId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot move a folder into itself'
      });
    }
    
    // Check if the new parent is a descendant of the current folder
    const isDescendant = await isDescendantFolder(folder._id, parentId);
    
    if (isDescendant) {
      return res.status(400).json({
        success: false,
        message: 'Cannot move a folder into one of its subfolders'
      });
    }
    
    // Check if a folder with the same name already exists in the destination
    const existingFolder = await Folder.findOne({
      name: folder.name,
      parent: parentId,
      owner: folder.owner,
      isTrash: false,
      _id: { $ne: folder._id }
    });
    
    if (existingFolder) {
      return res.status(409).json({
        success: false,
        message: 'A folder with this name already exists in the destination'
      });
    }
    
    // Update old parent's folder count
    if (folder.parent && folder.parent.toString() !== parentId.toString()) {
      await Folder.updateOne(
        { _id: folder.parent },
        { $inc: { folderCount: -1 } }
      );
    }
    
    // Update new parent's folder count
    if (!folder.parent || folder.parent.toString() !== parentId.toString()) {
      await Folder.updateOne(
        { _id: parentId },
        { $inc: { folderCount: 1 } }
      );
    }
    
    // Save old parent for path updates
    const oldParentId = folder.parent;
    
    // Update folder's parent and path
    folder.parent = parentId;
    folder.path = `${newParent.path}${newParent.name}/`;
    await folder.save();
    
    // Update paths of all descendants
    await updateDescendantPaths(folder._id, folder.path);
    
    res.json({
      success: true,
      message: 'Folder moved successfully'
    });
  } catch (error) {
    logger.error('Error moving folder:', error);
    res.status(500).json({
      success: false,
      message: 'Error moving folder',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Helper function to check if a folder is a descendant of another folder
const isDescendantFolder = async (parentId, childId) => {
  if (!parentId || !childId) return false;
  
  let currentId = childId;
  
  while (currentId) {
    const folder = await Folder.findById(currentId).select('parent');
    
    if (!folder) return false;
    
    if (folder.parent && folder.parent.toString() === parentId.toString()) {
      return true;
    }
    
    currentId = folder.parent;
  }
  
  return false;
};

// Helper function to update paths of all descendant folders
const updateDescendantPaths = async (parentId, parentPath) => {
  try {
    const children = await Folder.find({ parent: parentId });
    
    for (const child of children) {
      const oldPath = child.path;
      const newPath = `${parentPath}${child.name}/`;
      
      // Only update if path has changed
      if (oldPath !== newPath) {
        child.path = newPath;
        await child.save();
        
        // Recursively update all descendants
        await updateDescendantPaths(child._id, newPath);
      }
    }
  } catch (error) {
    logger.error('Error updating descendant paths:', error);
    throw error;
  }
};
