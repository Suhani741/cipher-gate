const mongoose = require('mongoose');

const fileSchema = mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: 'User',
    },
    filename: {
      type: String,
      required: true,
    },
    originalName: {
      type: String,
      required: true,
    },
    fileType: {
      type: String,
      required: true,
    },
    fileSize: {
      type: Number,
      required: true,
    },
    storagePath: {
      type: String,
      required: true,
    },
    downloadCount: {
      type: Number,
      required: true,
      default: 0,
    },
    riskScore: {
      type: Number,
      required: true,
      default: 0,
    },
    isQuarantined: {
      type: Boolean,
      required: true,
      default: false,
    },
    scanResults: {
      type: Object,
      default: {},
    },
    expiresAt: {
      type: Date,
      default: () => new Date(+new Date() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
    },
  },
  {
    timestamps: true,
  }
);

// Index for faster querying
fileSchema.index({ user: 1 });
fileSchema.index({ isQuarantined: 1 });
fileSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const File = mongoose.model('File', fileSchema);

module.exports = File;
