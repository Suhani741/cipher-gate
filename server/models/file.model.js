const mongoose = require('mongoose');
const config = require('../config');
const logger = require('../utils/logger');

// File status
const STATUS = {
  ACTIVE: 'active',
  QUARANTINED: 'quarantined',
  DELETED: 'deleted',
  UPLOADING: 'uploading',
  PROCESSING: 'processing'
};

// File visibility
const VISIBILITY = {
  PRIVATE: 'private',
  PUBLIC: 'public',
  UNLISTED: 'unlisted'
};

// Shared permission levels
const PERMISSIONS = {
  VIEW: 'view',
  EDIT: 'edit',
  MANAGE: 'manage'
};

// Shared access schema
const sharedWithSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  permission: {
    type: String,
    enum: Object.values(PERMISSIONS),
    default: PERMISSIONS.VIEW
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
}, { _id: false });

// Download history schema
const downloadHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  downloadedAt: {
    type: Date,
    default: Date.now
  },
  ip: String,
  userAgent: String
}, { _id: false });

// Version history schema
const versionHistorySchema = new mongoose.Schema({
  version: {
    type: Number,
    required: true
  },
  storageKey: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  uploadedAt: {
    type: Date,
    default: Date.now
  },
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  comment: String
}, { _id: false });

// File schema
const fileSchema = new mongoose.Schema({
  // Core file info
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255
  },
  originalName: {
    type: String,
    required: true
  },
  description: {
    type: String,
    maxlength: 1000
  },
  mimeType: {
    type: String,
    required: true
  },
  size: {
    type: Number,
    required: true,
    min: 0
  },
  extension: {
    type: String,
    required: true
  },
  
  // Storage info
  storage: {
    provider: {
      type: String,
      default: 's3',
      enum: ['s3', 'local', 'gcs', 'azure']
    },
    key: {
      type: String,
      required: true
    },
    bucket: String,
    region: String,
    url: String,
    etag: String,
    versionId: String
  },
  
  // File status and visibility
  status: {
    type: String,
    enum: Object.values(STATUS),
    default: STATUS.ACTIVE
  },
  visibility: {
    type: String,
    enum: Object.values(VISIBILITY),
    default: VISIBILITY.PRIVATE
  },
  isEncrypted: {
    type: Boolean,
    default: false
  },
  encryptionKey: {
    type: String,
    select: false
  },
  
  // Ownership and sharing
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  folder: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Folder',
    index: true
  },
  sharedWith: [sharedWithSchema],
  
  // Security and scanning
  scanStatus: {
    type: String,
    enum: ['pending', 'scanning', 'clean', 'infected', 'error'],
    default: 'pending'
  },
  scanResult: {
    isClean: Boolean,
    threats: [{
      name: String,
      type: String,
      riskScore: Number
    }],
    scannedAt: Date,
    scannedBy: String // Scanner service name
  },
  quarantineInfo: {
    quarantinedAt: Date,
    quarantinedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    reason: String,
    originalKey: String
  },
  
  // Versioning
  currentVersion: {
    type: Number,
    default: 1
  },
  versions: [versionHistorySchema],
  
  // Activity tracking
  downloads: [downloadHistorySchema],
  downloadCount: {
    type: Number,
    default: 0
  },
  lastDownloadedAt: Date,
  lastDownloadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Metadata
  metadata: {
    width: Number,
    height: Number,
    duration: Number, // for video/audio
    bitrate: Number,
    codec: String,
    pages: Number, // for PDFs and documents
    orientation: String, // for images
    colorSpace: String, // for images
    hasThumbnail: {
      type: Boolean,
      default: false
    },
    thumbnailKey: String,
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
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better query performance
fileSchema.index({ owner: 1, status: 1 });
fileSchema.index({ 'sharedWith.user': 1, status: 1 });
fileSchema.index({ mimeType: 1 });
fileSchema.index({ size: 1 });
fileSchema.index({ createdAt: -1 });
fileSchema.index({ updatedAt: -1 });
fileSchema.index({ 'scanStatus': 1, 'scanResult.isClean': 1 });
fileSchema.index({ 'metadata.hasThumbnail': 1 });

// Text index for search
fileSchema.index(
  { 
    name: 'text',
    description: 'text',
    originalName: 'text',
    'metadata.custom.tags': 'text',
    'metadata.custom.comments': 'text'
  },
  {
    weights: {
      name: 10,
      originalName: 8,
      description: 5,
      'metadata.custom.tags': 5,
      'metadata.custom.comments': 3
    },
    name: 'file_search'
  }
);

// Pre-save hook to update timestamps and handle versioning
fileSchema.pre('save', function(next) {
  const now = new Date();
  this.updatedAt = now;
  
  // If this is a new file, set creation date
  if (this.isNew) {
    this.createdAt = now;
  }
  
  // If the file is being updated, create a new version
  if (this.isModified('storage.key') && !this.isNew) {
    // Add current version to versions array before updating
    if (this.storage && this.storage.key) {
      this.versions.push({
        version: this.currentVersion,
        storageKey: this.storage.key,
        size: this.size,
        mimeType: this.mimeType,
        uploadedAt: now,
        uploadedBy: this.owner
      });
      
      // Increment version number
      this.currentVersion += 1;
    }
  }
  
  next();
});

// Instance method to check if a user has permission to access the file
fileSchema.methods.hasPermission = function(userId, requiredPermission = PERMISSIONS.VIEW) {
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
  const permissionLevels = Object.values(PERMISSIONS);
  const userLevel = permissionLevels.indexOf(sharedAccess.permission);
  const requiredLevel = permissionLevels.indexOf(requiredPermission);
  
  return userLevel >= requiredLevel;
};

// Static method to get user's storage usage
fileSchema.statics.getStorageUsage = async function(userId) {
  const result = await this.aggregate([
    {
      $match: {
        owner: mongoose.Types.ObjectId(userId),
        status: { $ne: 'deleted' }
      }
    },
    {
      $group: {
        _id: null,
        totalSize: { $sum: '$size' },
        fileCount: { $sum: 1 }
      }
    }
  ]);
  
  return result.length > 0 
    ? { totalSize: result[0].totalSize, fileCount: result[0].fileCount }
    : { totalSize: 0, fileCount: 0 };
};

// Static method to get file statistics
fileSchema.statics.getFileStats = async function(userId) {
  const stats = await this.aggregate([
    {
      $match: {
        owner: mongoose.Types.ObjectId(userId),
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
    {
      $sort: { count: -1 }
    }
  ]);
  
  return stats;
};

// Virtual for file URL
fileSchema.virtual('url').get(function() {
  if (!this.storage || !this.storage.url) {
    return null;
  }
  
  // If the file is stored in S3 and we have a direct URL, use it
  if (this.storage.provider === 's3' && this.storage.url) {
    return this.storage.url;
  }
  
  // Otherwise, generate a download URL
  return `/api/files/${this._id}/download`;
});

// Virtual for thumbnail URL
fileSchema.virtual('thumbnailUrl').get(function() {
  if (!this.metadata || !this.metadata.hasThumbnail) {
    return null;
  }
  
  if (this.metadata.thumbnailKey) {
    return `/api/files/${this._id}/thumbnail`;
  }
  
  // Return a generic icon based on file type
  const icons = {
    'image/': 'image',
    'video/': 'video',
    'audio/': 'audio',
    'application/pdf': 'pdf',
    'application/msword': 'word',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'word',
    'application/vnd.ms-excel': 'excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'excel',
    'application/vnd.ms-powerpoint': 'powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'powerpoint',
    'text/': 'text',
    'application/zip': 'archive',
    'application/x-rar-compressed': 'archive',
    'application/x-7z-compressed': 'archive'
  };
  
  const icon = Object.entries(icons).find(([prefix]) => this.mimeType.startsWith(prefix));
  return `/icons/${icon ? icon[1] : 'file'}.svg`;
});

// Virtual for file type (used for icons and previews)
fileSchema.virtual('fileType').get(function() {
  if (!this.mimeType) return 'file';
  
  const [type, subtype] = this.mimeType.split('/');
  
  // Common document types
  const documentTypes = [
    'pdf', 'msword', 'vnd.openxmlformats-officedocument.wordprocessingml.document',
    'vnd.ms-excel', 'vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'vnd.ms-powerpoint', 'vnd.openxmlformats-officedocument.presentationml.presentation',
    'rtf', 'text/plain', 'csv', 'tsv', 'json', 'xml', 'yaml', 'markdown'
  ];
  
  // Archive types
  const archiveTypes = [
    'zip', 'x-rar-compressed', 'x-7z-compressed', 'x-tar', 'x-gzip', 'x-bzip2'
  ];
  
  // Code types
  const codeTypes = [
    'javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'c', 'go', 'ruby', 'php',
    'swift', 'kotlin', 'rust', 'scala', 'dart', 'html', 'css', 'scss', 'less', 'sass',
    'shell', 'bash', 'powershell', 'sql', 'graphql', 'dockerfile', 'yaml', 'toml', 'ini'
  ];
  
  if (type === 'image') return 'image';
  if (type === 'video') return 'video';
  if (type === 'audio') return 'audio';
  
  if (documentTypes.includes(subtype) || documentTypes.includes(this.mimeType)) {
    return 'document';
  }
  
  if (archiveTypes.includes(subtype)) {
    return 'archive';
  }
  
  if (codeTypes.includes(subtype)) {
    return 'code';
  }
  
  return 'file';
});

const File = mongoose.model('File', fileSchema);

module.exports = {
  File,
  FILE_STATUS: STATUS,
  FILE_VISIBILITY: VISIBILITY,
  FILE_PERMISSIONS: PERMISSIONS
};
