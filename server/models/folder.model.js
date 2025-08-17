const mongoose = require('mongoose');
const { FILE_PERMISSIONS } = require('./file.model');

// Folder schema
const folderSchema = new mongoose.Schema({
  // Core folder info
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255
  },
  description: {
    type: String,
    maxlength: 1000
  },
  
  // Hierarchy
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    default: null
  },
  path: {
    type: String,
    default: '/',
    index: true
  },
  
  // Ownership and sharing
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  sharedWith: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    permission: {
      type: String,
      enum: Object.values(FILE_PERMISSIONS),
      default: FILE_PERMISSIONS.VIEW
    },
    sharedAt: {
      type: Date,
      default: Date.now
    },
    sharedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    message: String
  }],
  
  // Settings
  isDefault: {
    type: Boolean,
    default: false
  },
  isTrash: {
    type: Boolean,
    default: false
  },
  isArchive: {
    type: Boolean,
    default: false
  },
  
  // Stats
  fileCount: {
    type: Number,
    default: 0
  },
  folderCount: {
    type: Number,
    default: 0
  },
  totalSize: {
    type: Number,
    default: 0
  },
  
  // Metadata
  metadata: {
    color: String,
    icon: String,
    tags: [String],
    custom: mongoose.Schema.Types.Mixed
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  lastModified: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
folderSchema.index({ owner: 1, parent: 1 });
folderSchema.index({ path: 'text' });
folderSchema.index({ 'sharedWith.user': 1 });
folderSchema.index({ name: 'text', description: 'text' });

// Virtual for full path
folderSchema.virtual('fullPath').get(function() {
  if (!this.parent) return `/${this.name}`;
  return `${this.path}${this.name}/`;
});

// Pre-save hook to update path and timestamps
folderSchema.pre('save', async function(next) {
  const now = new Date();
  this.updatedAt = now;
  this.lastModified = now;
  
  // If this is a new folder, set creation date
  if (this.isNew) {
    this.createdAt = now;
    
    // If parent is set, update the path
    if (this.parent) {
      const parentFolder = await this.constructor.findById(this.parent);
      if (parentFolder) {
        this.path = parentFolder.fullPath;
      }
    }
    
    // Update parent's folder count
    if (this.parent) {
      await this.constructor.updateOne(
        { _id: this.parent },
        { $inc: { folderCount: 1 } }
      );
    }
  } else if (this.isModified('parent') && !this.isNew) {
    // If parent is changed, update the path and all descendants
    const oldParent = await this.constructor.findById(this.parent);
    const newPath = oldParent ? `${oldParent.fullPath}${this.name}/` : `/${this.name}/`;
    
    // Update this folder's path
    this.path = newPath;
    
    // Update all descendants' paths
    await updateDescendantPaths(this._id, this.path);
    
    // Update parent folder counts
    if (this._originalParent && this._originalParent.toString() !== this.parent.toString()) {
      await this.constructor.updateOne(
        { _id: this._originalParent },
        { $inc: { folderCount: -1 } }
      );
      
      await this.constructor.updateOne(
        { _id: this.parent },
        { $inc: { folderCount: 1 } }
      );
    }
  }
  
  next();
});

// Pre-remove hook to handle folder deletion
folderSchema.pre('remove', async function(next) {
  const session = this.$session();
  
  try {
    // Delete all files in this folder
    const File = mongoose.model('File');
    await File.deleteMany({ folder: this._id }, { session });
    
    // Delete all subfolders
    await this.constructor.deleteMany({ parent: this._id }, { session });
    
    // Update parent's folder count if this folder has a parent
    if (this.parent) {
      await this.constructor.updateOne(
        { _id: this.parent },
        { $inc: { folderCount: -1 } },
        { session }
      );
    }
    
    next();
  } catch (error) {
    next(error);
  }
});

// Helper function to update paths of all descendant folders
async function updateDescendantPaths(parentId, parentPath) {
  const children = await this.constructor.find({ parent: parentId });
  
  for (const child of children) {
    const oldPath = child.path;
    const newPath = `${parentPath}${child.name}/`;
    
    // Update the child's path
    child.path = newPath;
    await child.save();
    
    // Recursively update all descendants
    await updateDescendantPaths(child._id, newPath);
  }
}

// Instance method to check if a user has permission to access the folder
folderSchema.methods.hasPermission = function(userId, requiredPermission = FILE_PERMISSIONS.VIEW) {
  // If the user is the owner, they have all permissions
  if (this.owner.toString() === userId.toString()) {
    return true;
  }
  
  // Check shared permissions
  const sharedAccess = this.sharedWith.find(
    share => share.user.toString() === userId.toString()
  );
  
  if (!sharedAccess) {
    return false;
  }
  
  // Check permission level
  const permissionLevels = Object.values(FILE_PERMISSIONS);
  const userLevel = permissionLevels.indexOf(sharedAccess.permission);
  const requiredLevel = permissionLevels.indexOf(requiredPermission);
  
  return userLevel >= requiredLevel;
};

// Static method to get folder tree for a user
folderSchema.statics.getFolderTree = async function(userId, parentId = null) {
  const folders = await this.find({
    owner: userId,
    parent: parentId,
    isTrash: false,
    isArchive: false
  }).sort({ name: 1 });
  
  const result = [];
  
  for (const folder of folders) {
    const children = await this.getFolderTree(userId, folder._id);
    
    result.push({
      ...folder.toObject(),
      children
    });
  }
  
  return result;
};

// Static method to get folder breadcrumbs
folderSchema.statics.getBreadcrumbs = async function(folderId) {
  const breadcrumbs = [];
  let currentId = folderId;
  
  while (currentId) {
    const folder = await this.findById(currentId);
    if (!folder) break;
    
    breadcrumbs.unshift({
      id: folder._id,
      name: folder.name,
      path: folder.fullPath
    });
    
    currentId = folder.parent;
  }
  
  // Add root folder
  breadcrumbs.unshift({
    id: null,
    name: 'Root',
    path: '/'
  });
  
  return breadcrumbs;
};

// Static method to get folder statistics
folderSchema.statics.getFolderStats = async function(folderId, userId) {
  const File = mongoose.model('File');
  
  const [fileStats, folderStats] = await Promise.all([
    // File statistics
    File.aggregate([
      {
        $match: {
          folder: folderId ? mongoose.Types.ObjectId(folderId) : { $in: [null, ''] },
          owner: mongoose.Types.ObjectId(userId),
          status: { $ne: 'deleted' }
        }
      },
      {
        $group: {
          _id: null,
          fileCount: { $sum: 1 },
          totalSize: { $sum: '$size' },
          byType: {
            $push: {
              mimeType: '$mimeType',
              count: { $literal: 1 },
              size: '$size'
            }
          }
        }
      },
      {
        $project: {
          _id: 0,
          fileCount: 1,
          totalSize: 1,
          byType: {
            $reduce: {
              input: '$byType',
              initialValue: [],
              in: {
                $let: {
                  vars: {
                    existingType: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: '$$value',
                            as: 'item',
                            cond: { $eq: ['$$item.mimeType', '$$this.mimeType'] }
                          }
                        },
                        0
                      ]
                    }
                  },
                  in: {
                    $cond: {
                      if: '$$existingType',
                      then: {
                        $map: {
                          input: '$$value',
                          as: 'item',
                          in: {
                            $cond: {
                              if: { $eq: ['$$item.mimeType', '$$this.mimeType'] },
                              then: {
                                mimeType: '$$item.mimeType',
                                count: { $add: ['$$item.count', 1] },
                                size: { $add: ['$$item.size', '$$this.size'] }
                              },
                              else: '$$item'
                            }
                          }
                        }
                      },
                      else: {
                        $concatArrays: [
                          '$$value',
                          [{
                            mimeType: '$$this.mimeType',
                            count: 1,
                            size: '$$this.size'
                          }]
                        ]
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    ]),
    
    // Folder statistics
    this.aggregate([
      {
        $match: {
          parent: folderId ? mongoose.Types.ObjectId(folderId) : { $in: [null, ''] },
          owner: mongoose.Types.ObjectId(userId),
          isTrash: false,
          isArchive: false
        }
      },
      {
        $group: {
          _id: null,
          folderCount: { $sum: 1 },
          totalSize: { $sum: '$totalSize' }
        }
      }
    ])
  ]);
  
  const result = {
    fileCount: fileStats[0]?.fileCount || 0,
    folderCount: folderStats[0]?.folderCount || 0,
    totalSize: (fileStats[0]?.totalSize || 0) + (folderStats[0]?.totalSize || 0),
    fileTypes: fileStats[0]?.byType || []
  };
  
  return result;
};

const Folder = mongoose.model('Folder', folderSchema);

module.exports = Folder;
