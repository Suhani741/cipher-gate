const Folder = require('../models/folder.model');
const File = require('../models/file.model');
const User = require('../models/user.model');
const logger = require('../utils/logger');
const { FILE_PERMISSIONS } = require('../models/file.model');
const config = require('../config');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');

// Share folder with user
exports.shareFolder = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, permission, message } = req.body;
    const currentUserId = req.user._id;
    
    // Validate permission
    if (!Object.values(FILE_PERMISSIONS).includes(permission)) {
      return res.status(400).json({
        success: false,
        message: `Invalid permission. Must be one of: ${Object.values(FILE_PERMISSIONS).join(', ')}`
      });
    }
    
    const folder = await Folder.findById(id);
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    // Check if user has permission to share this folder
    if (folder.owner.toString() !== currentUserId.toString() && 
        !folder.hasPermission(currentUserId, FILE_PERMISSIONS.MANAGE)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to share this folder'
      });
    }
    
    // Check if user is trying to share with themselves
    if (userId === currentUserId.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot share with yourself'
      });
    }
    
    // Check if target user exists
    const targetUser = await User.findById(userId);
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Check if folder is already shared with this user
    const existingShareIndex = folder.sharedWith.findIndex(
      share => share.user.toString() === userId
    );
    
    if (existingShareIndex >= 0) {
      // Update existing share
      folder.sharedWith[existingShareIndex] = {
        user: userId,
        permission,
        sharedAt: new Date(),
        sharedBy: currentUserId,
        message: message || undefined
      };
    } else {
      // Add new share
      folder.sharedWith.push({
        user: userId,
        permission,
        sharedAt: new Date(),
        sharedBy: currentUserId,
        message: message || undefined
      });
    }
    
    await folder.save();
    
    res.json({
      success: true,
      message: 'Folder shared successfully',
      data: folder
    });
  } catch (error) {
    logger.error('Error sharing folder:', error);
    res.status(500).json({
      success: false,
      message: 'Error sharing folder',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Remove user's access to folder
exports.unshareFolder = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const currentUserId = req.user._id;
    
    const folder = await Folder.findById(id);
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    // Check if user has permission to manage shares
    if (folder.owner.toString() !== currentUserId.toString() && 
        !folder.hasPermission(currentUserId, FILE_PERMISSIONS.MANAGE)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage shares for this folder'
      });
    }
    
    // Find and remove the share
    const shareIndex = folder.sharedWith.findIndex(
      share => share.user.toString() === userId
    );
    
    if (shareIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Share not found'
      });
    }
    
    // Remove the share
    folder.sharedWith.splice(shareIndex, 1);
    
    await folder.save();
    
    res.json({
      success: true,
      message: 'Share removed successfully'
    });
  } catch (error) {
    logger.error('Error unsharing folder:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing share',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Generate shareable link
exports.generateShareLink = async (req, res) => {
  try {
    const { id } = req.params;
    const { expiresIn = '7d', password, permission = 'view' } = req.body;
    const userId = req.user._id;
    
    // Validate permission
    if (!Object.values(FILE_PERMISSIONS).includes(permission)) {
      return res.status(400).json({
        success: false,
        message: `Invalid permission. Must be one of: ${Object.values(FILE_PERMISSIONS).join(', ')}`
      });
    }
    
    const folder = await Folder.findById(id);
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    // Check if user has permission to share this folder
    if (folder.owner.toString() !== userId.toString() && 
        !folder.hasPermission(userId, FILE_PERMISSIONS.MANAGE)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to share this folder'
      });
    }
    
    // Generate a unique token
    const token = uuidv4();
    
    // Calculate expiration date
    let expiresAt = new Date();
    
    if (expiresIn === 'never') {
      expiresAt = null; // Never expires
    } else {
      // Parse duration string (e.g., '7d', '1m', '1y')
      const match = expiresIn.match(/^(\d+)([dmy])$/);
      
      if (!match) {
        return res.status(400).json({
          success: false,
          message: 'Invalid expiresIn format. Use format like "7d" (days), "1m" (month), or "1y" (year)'
        });
      }
      
      const value = parseInt(match[1]);
      const unit = match[2];
      
      switch (unit) {
        case 'd':
          expiresAt.setDate(expiresAt.getDate() + value);
          break;
        case 'm':
          expiresAt.setMonth(expiresAt.getMonth() + value);
          break;
        case 'y':
          expiresAt.setFullYear(expiresAt.getFullYear() + value);
          break;
      }
    }
    
    // Create share link
    const shareLink = {
      token,
      createdBy: userId,
      createdAt: new Date(),
      expiresAt,
      password: password ? await bcrypt.hash(password, 10) : null,
      permission,
      accessCount: 0,
      lastAccessedAt: null,
      metadata: {
        userAgent: req.headers['user-agent'],
        ip: req.ip
      }
    };
    
    // Add share link to folder
    if (!folder.shareLinks) {
      folder.shareLinks = [];
    }
    
    folder.shareLinks.push(shareLink);
    await folder.save();
    
    // Generate the full shareable URL
    const baseUrl = config.app.baseUrl || `${req.protocol}://${req.get('host')}`;
    const shareUrl = `${baseUrl}/share/folder/${folder._id}?token=${token}`;
    
    res.status(201).json({
      success: true,
      data: {
        shareUrl,
        expiresAt,
        passwordProtected: !!password,
        permission
      }
    });
  } catch (error) {
    logger.error('Error generating share link:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating share link',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Revoke shareable link
exports.revokeShareLink = async (req, res) => {
  try {
    const { id } = req.params;
    const { token } = req.query;
    const userId = req.user._id;
    
    const folder = await Folder.findById(id);
    
    if (!folder) {
      return res.status(404).json({
        success: false,
        message: 'Folder not found'
      });
    }
    
    // Check if user has permission to manage shares
    if (folder.owner.toString() !== userId.toString() && 
        !folder.hasPermission(userId, FILE_PERMISSIONS.MANAGE)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to manage shares for this folder'
      });
    }
    
    // If token is provided, remove that specific share link
    // Otherwise, remove all share links
    if (token) {
      const shareIndex = folder.shareLinks.findIndex(link => link.token === token);
      
      if (shareIndex === -1) {
        return res.status(404).json({
          success: false,
          message: 'Share link not found'
        });
      }
      
      folder.shareLinks.splice(shareIndex, 1);
    } else {
      // Remove all share links
      folder.shareLinks = [];
    }
    
    await folder.save();
    
    res.json({
      success: true,
      message: token ? 'Share link revoked' : 'All share links revoked'
    });
  } catch (error) {
    logger.error('Error revoking share link:', error);
    res.status(500).json({
      success: false,
      message: 'Error revoking share link',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};
