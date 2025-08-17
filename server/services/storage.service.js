const AWS = require('aws-sdk');
const config = require('../config');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const util = require('util');
const stream = require('stream');

// Promisify the stream.finished function
const finished = util.promisify(stream.finished);

// Configure AWS SDK
AWS.config.update({
  accessKeyId: config.aws.accessKeyId,
  secretAccessKey: config.aws.secretAccessKey,
  region: config.aws.region
});

const s3 = new AWS.S3();

class StorageService {
  constructor() {
    this.bucketName = config.aws.s3.bucketName;
    this.uploadFolder = config.aws.s3.uploadFolder || 'uploads';
    this.quarantineFolder = config.aws.s3.quarantineFolder || 'quarantine';
  }

  /**
   * Generate a unique file key with folder structure
   * @param {string} originalName - Original filename
   * @param {string} [folder] - Optional subfolder
   * @returns {string} Generated file key
   */
  generateFileKey(originalName, folder = '') {
    const ext = path.extname(originalName).toLowerCase();
    const baseName = path.basename(originalName, ext);
    const sanitizedName = baseName.replace(/[^a-zA-Z0-9-_]/g, '_');
    const uuid = uuidv4();
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    
    // Format: [folder]/YYYY/MM/uuid_sanitized-filename.ext
    const key = [
      folder || this.uploadFolder,
      year,
      month,
      `${uuid}_${sanitizedName}${ext}`
    ].join('/');
    
    return key;
  }

  /**
   * Upload a file to S3
   * @param {Object} file - File object with buffer and originalname
   * @param {string} [folder] - Optional subfolder
   * @returns {Promise<Object>} Upload result with key and URL
   */
  async uploadFile(file, folder = '') {
    const key = this.generateFileKey(file.originalname, folder);
    
    const params = {
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        originalName: file.originalname,
        uploadedAt: new Date().toISOString(),
        size: file.size.toString(),
      }
    };

    try {
      const data = await s3.upload(params).promise();
      logger.info(`File uploaded successfully: ${data.Key}`);
      return {
        key: data.Key,
        url: data.Location,
        etag: data.ETag.replace(/"/g, '')
      };
    } catch (error) {
      logger.error('Error uploading file to S3:', error);
      throw new Error('Failed to upload file to storage');
    }
  }

  /**
   * Stream upload for large files
   * @param {ReadableStream} fileStream - File read stream
   * @param {string} originalName - Original filename
   * @param {string} mimetype - File MIME type
   * @param {string} [folder] - Optional subfolder
   * @returns {Promise<Object>} Upload result with key and URL
   */
  async uploadStream(fileStream, originalName, mimetype, folder = '') {
    const key = this.generateFileKey(originalName, folder);
    const pass = new stream.PassThrough();
    
    const uploadParams = {
      Bucket: this.bucketName,
      Key: key,
      Body: pass,
      ContentType: mimetype,
      Metadata: {
        originalName,
        uploadedAt: new Date().toISOString()
      }
    };

    try {
      // Start the upload in the background
      const uploadPromise = s3.upload(uploadParams).promise();
      
      // Pipe the file stream through our pass-through stream
      fileStream.pipe(pass);
      
      // Wait for the stream to finish
      await finished(pass);
      
      // Wait for the upload to complete
      const data = await uploadPromise;
      
      logger.info(`File stream uploaded successfully: ${data.Key}`);
      return {
        key: data.Key,
        url: data.Location,
        etag: data.ETag.replace(/"/g, '')
      };
    } catch (error) {
      logger.error('Error in stream upload to S3:', error);
      throw new Error('Failed to upload file stream');
    }
  }

  /**
   * Generate a pre-signed URL for file download
   * @param {string} key - File key in S3
   * @param {string} [filename] - Optional custom filename for download
   * @param {number} [expiresIn=3600] - URL expiration time in seconds
   * @returns {Promise<string>} Pre-signed URL
   */
  async getSignedUrl(key, filename, expiresIn = 3600) {
    const params = {
      Bucket: this.bucketName,
      Key: key,
      Expires: expiresIn
    };

    if (filename) {
      params.ResponseContentDisposition = `attachment; filename="${encodeURIComponent(filename)}"`;
    }

    try {
      const url = await s3.getSignedUrlPromise('getObject', params);
      return url;
    } catch (error) {
      logger.error('Error generating signed URL:', error);
      throw new Error('Failed to generate download URL');
    }
  }

  /**
   * Move a file to quarantine
   * @param {string} sourceKey - Source file key
   * @returns {Promise<Object>} Result with new key and URL
   */
  async quarantineFile(sourceKey) {
    // Extract the filename from the source key
    const filename = path.basename(sourceKey);
    const quarantineKey = `${this.quarantineFolder}/${Date.now()}_${filename}`;
    
    try {
      // Copy the file to quarantine
      await s3.copyObject({
        Bucket: this.bucketName,
        CopySource: `/${this.bucketName}/${sourceKey}`,
        Key: quarantineKey,
        MetadataDirective: 'COPY',
        Metadata: {
          'x-amz-metadata-quarantined': 'true',
          'x-amz-metadata-quarantined-at': new Date().toISOString(),
          'x-amz-metadata-original-key': sourceKey
        }
      }).promise();

      // Delete the original file
      await this.deleteFile(sourceKey);

      logger.info(`File quarantined: ${sourceKey} -> ${quarantineKey}`);
      
      return {
        key: quarantineKey,
        url: `https://${this.bucketName}.s3.${config.aws.region}.amazonaws.com/${quarantineKey}`
      };
    } catch (error) {
      logger.error('Error quarantining file:', error);
      throw new Error('Failed to quarantine file');
    }
  }

  /**
   * Restore a file from quarantine
   * @param {string} quarantineKey - Quarantined file key
   * @returns {Promise<Object>} Result with new key and URL
   */
  async restoreFromQuarantine(quarantineKey) {
    try {
      // Get the file metadata to find the original key
      const { Metadata } = await s3.headObject({
        Bucket: this.bucketName,
        Key: quarantineKey
      }).promise();

      const originalKey = Metadata['x-amz-metadata-original-key'];
      
      if (!originalKey) {
        throw new Error('Original file path not found in quarantine metadata');
      }

      // Copy the file back to its original location
      await s3.copyObject({
        Bucket: this.bucketName,
        CopySource: `/${this.bucketName}/${quarantineKey}`,
        Key: originalKey,
        MetadataDirective: 'REPLACE',
        Metadata: {
          ...Metadata,
          'x-amz-metadata-restored': 'true',
          'x-amz-metadata-restored-at': new Date().toISOString()
        }
      }).promise();

      // Delete the quarantined file
      await this.deleteFile(quarantineKey);

      logger.info(`File restored from quarantine: ${quarantineKey} -> ${originalKey}`);
      
      return {
        key: originalKey,
        url: `https://${this.bucketName}.s3.${config.aws.region}.amazonaws.com/${originalKey}`
      };
    } catch (error) {
      logger.error('Error restoring file from quarantine:', error);
      throw new Error('Failed to restore file from quarantine');
    }
  }

  /**
   * Delete a file from S3
   * @param {string} key - File key in S3
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async deleteFile(key) {
    const params = {
      Bucket: this.bucketName,
      Key: key
    };

    try {
      await s3.deleteObject(params).promise();
      logger.info(`File deleted: ${key}`);
      return true;
    } catch (error) {
      logger.error('Error deleting file from S3:', error);
      throw new Error('Failed to delete file');
    }
  }

  /**
   * Get file metadata
   * @param {string} key - File key in S3
   * @returns {Promise<Object>} File metadata
   */
  async getFileMetadata(key) {
    const params = {
      Bucket: this.bucketName,
      Key: key
    };

    try {
      const data = await s3.headObject(params).promise();
      return {
        key,
        size: data.ContentLength,
        lastModified: data.LastModified,
        contentType: data.ContentType,
        metadata: data.Metadata,
        etag: data.ETag.replace(/"/g, '')
      };
    } catch (error) {
      if (error.code === 'NotFound') {
        return null;
      }
      logger.error('Error getting file metadata:', error);
      throw new Error('Failed to get file metadata');
    }
  }

  /**
   * Check if a file exists
   * @param {string} key - File key in S3
   * @returns {Promise<boolean>} True if file exists
   */
  async fileExists(key) {
    try {
      await s3.headObject({
        Bucket: this.bucketName,
        Key: key
      }).promise();
      return true;
    } catch (error) {
      if (error.code === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get a readable stream for a file
   * @param {string} key - File key in S3
   * @returns {Promise<ReadableStream>} Readable stream of the file
   */
  async getFileStream(key) {
    const params = {
      Bucket: this.bucketName,
      Key: key
    };

    try {
      const s3Object = await s3.getObject(params).promise();
      const stream = require('stream');
      const readable = new stream.PassThrough();
      readable.end(s3Object.Body);
      return readable;
    } catch (error) {
      logger.error('Error getting file stream:', error);
      throw new Error('Failed to get file stream');
    }
  }
}

module.exports = new StorageService();
