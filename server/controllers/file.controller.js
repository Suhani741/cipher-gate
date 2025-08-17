const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const File = require('../models/file.model');
const User = require('../models/user.model');
const storageService = require('../services/storage.service');
const logger = require('../utils/logger');
const config = require('../config');
const { fileScanQueue } = require('../queues/scan.queue');
const { riskScoringService } = require('../services/ai');

/**
 * @desc    Upload a file
 * @route   POST /api/files/upload
 * @access  Private
 */
const uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      logger.warn('No file uploaded');
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded' 
      });
    }

    const { originalname, mimetype, size, buffer } = req.file;
    // For development, use a default user ID if not provided
    const userId = process.env.NODE_ENV === 'development' && !req.user?.id 
      ? 'dev-user-123' 
      : req.user.id;
    const { folderId } = req.body;

    // Check file size limit
    if (size > config.aws.s3.maxFileSize) {
      return res.status(400).json({
        success: false,
        message: `File size exceeds the limit of ${config.aws.s3.maxFileSize / (1024 * 1024)}MB`
      });
    }

    // Perform AI risk assessment
    let riskAssessment;
    try {
      riskAssessment = await riskScoringService.calculateRiskScore(req.file, {
        uploader: userId,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      });
      
      logger.info(`File risk assessment for ${originalname}:`, {
        riskScore: riskAssessment.riskScore,
        riskLevel: riskAssessment.riskLevel,
        isMalicious: riskAssessment.isMalicious
      });
      
      // Auto-quarantine high-risk files
      if (riskAssessment.isMalicious || riskAssessment.riskLevel === 'high') {
        logger.warn(`Quarantining high-risk file: ${originalname} (Score: ${riskAssessment.riskScore})`);
        return res.status(403).json({
          success: false,
          message: 'File blocked due to security concerns',
          riskAssessment: {
            riskScore: riskAssessment.riskScore,
            riskLevel: riskAssessment.riskLevel,
            isMalicious: riskAssessment.isMalicious,
            details: riskAssessment.details
          }
        });
      }
    } catch (error) {
      logger.error('Error during risk assessment:', error);
      // Continue with upload but mark for review
      riskAssessment = {
        error: true,
        message: 'Error during risk assessment',
        riskScore: 100, // Default to high risk on error
        riskLevel: 'high',
        isMalicious: true,
        requiresReview: true,
        details: { error: error.message }
      };
    }

    // Get user's storage usage
    const user = await User.findById(userId);
    if (!user) {
      logger.warn(`User not found: ${userId}`);
      return res.status(404).json({ 
        success: false, 
        message: 'User not found' 
      });
    }

    // Check user's storage quota
    if (user.storageUsed + size > user.storageQuota) {
      return res.status(400).json({
        success: false,
        message: 'Storage quota exceeded',
        storageUsed: user.storageUsed,
        storageQuota: user.storageQuota
      });
    }

    // Generate a unique file ID
    const fileId = uuidv4();
    
    // Create a temporary file record with 'uploading' status
    const fileRecord = new File({
      name: originalname,
      mimeType: mimetype,
      size,
      storagePath: `${userId}/${fileId}${path.extname(originalname)}`,
      owner: userId,
      folder: folderId || null,
      isPublic: false,
      status: riskAssessment?.isMalicious ? 'quarantined' : 'active',
      riskAssessment: {
        riskScore: riskAssessment.riskScore,
        riskLevel: riskAssessment.riskLevel,
        isMalicious: riskAssessment.isMalicious,
        confidence: riskAssessment.confidence,
        modelVersion: riskAssessment.modelVersion,
        details: riskAssessment.details,
        requiresReview: riskAssessment.requiresReview || false,
        reviewedBy: null,
        reviewedAt: null,
        reviewNotes: null
      },
      metadata: {
        originalName: originalname,
        uploadIp: req.ip,
        userAgent: req.get('user-agent'),
        scannedAt: new Date(),
        scannerVersion: riskAssessment.modelVersion || '1.0.0'
      },
      tags: riskAssessment?.details?.tags || []
    });

    // Save the file record to the database
    await fileRecord.save();

    try {
      // Upload the file to S3
      const uploadResult = await storageService.uploadFile({
        originalname,
        mimetype,
        size,
        buffer
      });

      // Update the file record with the S3 key and URL
      fileRecord.storage = {
        provider: 's3',
        key: uploadResult.key,
        bucket: config.aws.s3.bucketName,
        region: config.aws.region,
        url: uploadResult.url,
        etag: uploadResult.etag
      };

      // Change status to 'active'
      fileRecord.status = 'active';
      fileRecord.metadata.uploadDate = new Date();
      
      // Save the updated file record
      await fileRecord.save();

      // Update user's storage usage
      user.storageUsed += size;
      await user.save();

      // Add the file to the scanning queue
      if (config.scanning.enabled) {
        await fileScanQueue.add('scan-file', {
          fileId: fileRecord._id,
          userId: user._id,
          filePath: uploadResult.key,
          originalName: originalname,
          mimeType: mimetype
        }, {
          jobId: `scan-${fileRecord._id}`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000 // 5 seconds
          },
          removeOnComplete: true,
          removeOnFail: true
        });
        
        logger.info(`File ${fileRecord._id} added to scan queue`);
      }

      // Return success response
      res.status(201).json({
        success: true,
        message: 'File uploaded successfully',
        file: {
          id: fileRecord._id,
          name: fileRecord.name,
          size: fileRecord.size,
          mimeType: fileRecord.mimeType,
          status: fileRecord.status,
          url: fileRecord.storage.url,
          createdAt: fileRecord.createdAt,
          updatedAt: fileRecord.updatedAt,
          metadata: fileRecord.metadata
        }
      });

    } catch (error) {
      // Clean up the file record if upload fails
      await File.findByIdAndDelete(fileRecord._id);
      logger.error('Error uploading file to S3:', error);
      throw error; // Let the error handler catch this
    }

  } catch (error) {
    logger.error('Error in uploadFile controller:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading file',
      error: config.env === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Download a file
 * @route   GET /api/files/download/:id
 * @access  Private
 */
const downloadFile = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Find the file in the database
    const file = await File.findOne({
      _id: id,
      $or: [
        { owner: userId },
        { 'sharedWith.user': userId, 'sharedWith.permission': { $in: ['view', 'edit'] } }
      ]
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found or access denied'
      });
    }

    // Check if the file is quarantined
    if (file.status === 'quarantined') {
      return res.status(403).json({
        success: false,
        message: 'This file has been quarantined due to security concerns',
        scanResult: file.scanResult
      });
    }

    // Generate a pre-signed URL for the file
    const signedUrl = await storageService.getSignedUrl(
      file.storage.key,
      file.name,
      3600 // 1 hour expiration
    );

    // Log the download activity
    file.downloads.push({
      user: userId,
      downloadedAt: new Date(),
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });
    
    await file.save();

    // Redirect to the pre-signed URL
    res.redirect(signedUrl);

  } catch (error) {
    logger.error('Error in downloadFile controller:', error);
    res.status(500).json({
      success: false,
      message: 'Error downloading file',
      error: config.env === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Get file information
 * @route   GET /api/files/:id
 * @access  Private
 */
const getFileInfo = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Find the file in the database
    const file = await File.findOne({
      _id: id,
      $or: [
        { owner: userId },
        { 'sharedWith.user': userId }
      ]
    }).populate('owner', 'name email')
      .populate('sharedWith.user', 'name email');

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found or access denied'
      });
    }

    // Format the response
    const fileInfo = {
      id: file._id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      status: file.status,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      metadata: file.metadata,
      owner: file.owner,
      sharedWith: file.sharedWith,
      downloadCount: file.downloads ? file.downloads.length : 0,
      scanResult: file.scanResult,
      isOwner: file.owner._id.toString() === userId,
      permissions: {
        canView: true,
        canEdit: file.owner._id.toString() === userId || 
                 file.sharedWith.some(share => 
                   share.user._id.toString() === userId && 
                   share.permission === 'edit'
                 ),
        canShare: file.owner._id.toString() === userId,
        canDelete: file.owner._id.toString() === userId
      }
    };

    res.status(200).json({
      success: true,
      file: fileInfo
    });

  } catch (error) {
    logger.error('Error in getFileInfo controller:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving file information',
      error: config.env === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Get all files for the authenticated user
 * @route   GET /api/files
 * @access  Private
 */
const getUserFiles = async (req, res) => {
  try {
    const userId = req.user.id;
    const { 
      page = 1, 
      limit = 10, 
      sortBy = 'createdAt', 
      sortOrder = 'desc',
      status,
      mimeType,
      search,
      folderId
    } = req.query;

    // Build the query
    const query = { 
      $or: [
        { owner: userId },
        { 'sharedWith.user': userId }
      ]
    };

    // Apply filters
    if (status) {
      query.status = status;
    }

    if (mimeType) {
      query.mimeType = { $regex: mimeType, $options: 'i' };
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'metadata.originalName': { $regex: search, $options: 'i' } }
      ];
    }

    if (folderId) {
      query.folder = folderId === 'root' ? { $in: [null, ''] } : folderId;
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    // Get total count for pagination
    const total = await File.countDocuments(query);
    
    // Get files with pagination and sorting
    const files = await File.find(query)
      .sort({ [sortBy]: sortOrder === 'asc' ? 1 : -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('owner', 'name email')
      .populate('folder', 'name')
      .lean();

    // Calculate total pages
    const totalPages = Math.ceil(total / parseInt(limit));

    // Format the response
    const formattedFiles = files.map(file => ({
      id: file._id,
      name: file.name,
      mimeType: file.mimeType,
      size: file.size,
      status: file.status,
      url: file.storage?.url,
      createdAt: file.createdAt,
      updatedAt: file.updatedAt,
      metadata: file.metadata,
      isOwner: file.owner._id.toString() === userId,
      folder: file.folder,
      sharedWith: file.sharedWith,
      permissions: {
        canView: true,
        canEdit: file.owner._id.toString() === userId || 
                 file.sharedWith.some(share => 
                   share.user.toString() === userId && 
                   share.permission === 'edit'
                 ),
        canShare: file.owner._id.toString() === userId,
        canDelete: file.owner._id.toString() === userId
      }
    }));

    res.status(200).json({
      success: true,
      files: formattedFiles,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages
      }
    });

  } catch (error) {
    logger.error('Error in getUserFiles controller:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving files',
      error: config.env === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Update file information
 * @route   PUT /api/files/:id
 * @access  Private
 */
const updateFile = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { name, description, metadata } = req.body;

    // Find the file in the database
    const file = await File.findOne({
      _id: id,
      owner: userId // Only owner can update file info
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found or access denied'
      });
    }

    // Update file properties
    if (name) file.name = name;
    if (description) file.description = description;
    if (metadata) {
      file.metadata = {
        ...file.metadata,
        ...metadata,
        updatedAt: new Date()
      };
    }

    // Save the updated file
    await file.save();

    res.status(200).json({
      success: true,
      message: 'File updated successfully',
      file: {
        id: file._id,
        name: file.name,
        description: file.description,
        metadata: file.metadata,
        updatedAt: file.updatedAt
      }
    });

  } catch (error) {
    logger.error('Error in updateFile controller:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating file',
      error: config.env === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Delete a file
 * @route   DELETE /api/files/:id
 * @access  Private
 */
const deleteFile = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Find the file in the database
    const file = await File.findOne({
      _id: id,
      owner: userId // Only owner can delete file
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found or access denied'
      });
    }

    // Delete the file from storage
    await storageService.deleteFile(file.storage.key);

    // Update user's storage usage
    await User.findByIdAndUpdate(userId, {
      $inc: { storageUsed: -file.size }
    });

    // Delete the file record from the database
    await File.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'File deleted successfully'
    });

  } catch (error) {
    logger.error('Error in deleteFile controller:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting file',
      error: config.env === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Share a file with another user
 * @route   POST /api/files/:id/share
 * @access  Private
 */
const shareFile = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const { userId: shareWithUserId, permission = 'view', message } = req.body;

    // Validate permission
    if (!['view', 'edit'].includes(permission)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid permission. Must be "view" or "edit"'
      });
    }

    // Check if the user is trying to share with themselves
    if (userId === shareWithUserId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot share file with yourself'
      });
    }

    // Find the file in the database
    const file = await File.findOne({
      _id: id,
      owner: userId // Only owner can share the file
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found or access denied'
      });
    }

    // Check if the target user exists
    const targetUser = await User.findById(shareWithUserId);
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Check if the file is already shared with this user
    const existingShareIndex = file.sharedWith.findIndex(
      share => share.user.toString() === shareWithUserId
    );

    if (existingShareIndex >= 0) {
      // Update existing share
      file.sharedWith[existingShareIndex].permission = permission;
      file.sharedWith[existingShareIndex].sharedAt = new Date();
    } else {
      // Add new share
      file.sharedWith.push({
        user: shareWithUserId,
        permission,
        sharedAt: new Date(),
        sharedBy: userId,
        message
      });
    }

    // Save the updated file
    await file.save();

    // TODO: Send notification to the target user
    // await sendShareNotification(userId, shareWithUserId, file._id, permission, message);

    res.status(200).json({
      success: true,
      message: 'File shared successfully',
      share: {
        fileId: file._id,
        userId: shareWithUserId,
        permission,
        sharedAt: file.sharedWith.find(s => s.user.toString() === shareWithUserId).sharedAt
      }
    });

  } catch (error) {
    logger.error('Error in shareFile controller:', error);
    res.status(500).json({
      success: false,
      message: 'Error sharing file',
      error: config.env === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Remove a user's access to a shared file
 * @route   DELETE /api/files/:id/share/:userId
 * @access  Private
 */
const unshareFile = async (req, res) => {
  try {
    const { id, userId: shareWithUserId } = req.params;
    const userId = req.user.id;

    // Find the file in the database
    const file = await File.findOne({
      _id: id,
      owner: userId // Only owner can unshare the file
    });

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found or access denied'
      });
    }

    // Check if the file is shared with this user
    const shareIndex = file.sharedWith.findIndex(
      share => share.user.toString() === shareWithUserId
    );

    if (shareIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'File is not shared with this user'
      });
    }

    // Remove the share
    file.sharedWith.splice(shareIndex, 1);

    // Save the updated file
    await file.save();

    res.status(200).json({
      success: true,
      message: 'File access removed successfully'
    });

  } catch (error) {
    logger.error('Error in unshareFile controller:', error);
    res.status(500).json({
      success: false,
      message: 'Error removing file access',
      error: config.env === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Quarantine a file (admin only)
 * @route   POST /api/admin/files/:id/quarantine
 * @access  Private/Admin
 */
const quarantineFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Find the file in the database
    const file = await File.findById(id);

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Skip if already quarantined
    if (file.status === 'quarantined') {
      return res.status(200).json({
        success: true,
        message: 'File is already quarantined',
        file
      });
    }

    // Move the file to quarantine in S3
    const quarantineResult = await storageService.quarantineFile(file.storage.key);

    // Update the file record
    file.status = 'quarantined';
    file.quarantinedAt = new Date();
    file.quarantinedBy = req.user.id;
    file.quarantineReason = reason || 'Suspicious content detected';
    file.storage.key = quarantineResult.key;
    file.storage.url = quarantineResult.url;

    await file.save();

    // TODO: Notify the file owner about the quarantine

    res.status(200).json({
      success: true,
      message: 'File quarantined successfully',
      file
    });

  } catch (error) {
    logger.error('Error in quarantineFile controller:', error);
    res.status(500).json({
      success: false,
      message: 'Error quarantining file',
      error: config.env === 'development' ? error.message : 'Internal server error'
    });
  }
};

/**
 * @desc    Restore a file from quarantine (admin only)
 * @route   POST /api/admin/files/:id/restore
 * @access  Private/Admin
 */
const restoreFile = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    // Find the file in the database
    const file = await File.findById(id);

    if (!file) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }

    // Skip if not quarantined
    if (file.status !== 'quarantined') {
      return res.status(400).json({
        success: false,
        message: 'File is not quarantined'
      });
    }

    // Restore the file from quarantine in S3
    const restoreResult = await storageService.restoreFromQuarantine(file.storage.key);

    // Update the file record
    file.status = 'active';
    file.restoredAt = new Date();
    file.restoredBy = req.user.id;
    file.restoreReason = reason || 'False positive';
    file.storage.key = restoreResult.key;
    file.storage.url = restoreResult.url;

    await file.save();

    // TODO: Notify the file owner about the restoration

    res.status(200).json({
      success: true,
      message: 'File restored successfully',
      file
    });

  } catch (error) {
    logger.error('Error in restoreFile controller:', error);
    res.status(500).json({
      success: false,
      message: 'Error restoring file',
      error: config.env === 'development' ? error.message : 'Internal server error'
    });
  }
};

module.exports = {
  uploadFile,
  downloadFile,
  getFileInfo,
  getUserFiles,
  updateFile,
  deleteFile,
  shareFile,
  unshareFile,
  quarantineFile,
  restoreFile
};
