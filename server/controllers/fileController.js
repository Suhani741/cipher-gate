const File = require('../models/fileModel');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const { analyzeFile } = require('../utils/aiScanner');

const unlinkAsync = promisify(fs.unlink);

// @desc    Upload a file
// @route   POST /api/files/upload
// @access  Private
const uploadFile = async (req, res) => {
  try {
    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({ message: 'No files were uploaded.' });
    }

    const file = req.files.file;
    const uploadDir = path.join(__dirname, '../../uploads');

    // Create uploads directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const uniqueName = `${uuidv4()}-${file.name}`;
    const uploadPath = path.join(uploadDir, uniqueName);

    // Move file to uploads directory
    await file.mv(uploadPath);

    // Analyze file for threats
    const scanResult = await analyzeFile(uploadPath);
    
    // Create file record in database
    const fileRecord = await File.create({
      user: req.user._id,
      filename: uniqueName,
      originalName: file.name,
      fileType: file.mimetype,
      fileSize: file.size,
      storagePath: uploadPath,
      riskScore: scanResult.riskScore,
      isQuarantined: scanResult.isMalicious,
      scanResults: scanResult.details,
    });

    res.status(201).json({
      message: 'File uploaded successfully',
      file: {
        id: fileRecord._id,
        name: fileRecord.originalName,
        type: fileRecord.fileType,
        size: fileRecord.fileSize,
        riskScore: fileRecord.riskScore,
        isQuarantined: fileRecord.isQuarantined,
      },
    });
  } catch (error) {
    console.error('Upload error:', error);
    if (req.file) {
      await unlinkAsync(req.file.path).catch(console.error);
    }
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get all files for the authenticated user
// @route   GET /api/files
// @access  Private
const getFiles = async (req, res) => {
  try {
    const files = await File.find({ user: req.user._id })
      .select('-storagePath -scanResults -__v')
      .sort({ createdAt: -1 });
    
    res.json(files);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Download a file
// @route   GET /api/files/download/:id
// @access  Private
const downloadFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Check if file is quarantined
    if (file.isQuarantined) {
      return res.status(403).json({ 
        message: 'This file has been quarantined due to security concerns' 
      });
    }

    // Check if file exists
    if (!fs.existsSync(file.storagePath)) {
      return res.status(404).json({ message: 'File not found on server' });
    }

    // Increment download count
    file.downloadCount += 1;
    await file.save();

    // Send file for download
    res.download(file.storagePath, file.originalName);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Delete a file
// @route   DELETE /api/files/:id
// @access  Private
const deleteFile = async (req, res) => {
  try {
    const file = await File.findById(req.params.id);
    
    if (!file) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Check if user owns the file or is admin
    if (file.user.toString() !== req.user._id.toString() && !req.user.isAdmin) {
      return res.status(401).json({ message: 'Not authorized' });
    }

    // Delete file from filesystem
    if (fs.existsSync(file.storagePath)) {
      await unlinkAsync(file.storagePath);
    }

    // Delete record from database
    await file.remove();

    res.json({ message: 'File removed' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  uploadFile,
  getFiles,
  downloadFile,
  deleteFile,
};
