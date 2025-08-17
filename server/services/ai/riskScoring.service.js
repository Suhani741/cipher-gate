const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../../utils/logger');

class RiskScoringService {
  constructor() {
    this.aiModelEndpoint = config.ai.modelEndpoint || 'http://localhost:5000/api/predict';
    this.apiKey = config.ai.apiKey;
    this.timeout = config.ai.timeout || 30000; // 30 seconds
  }

  /**
   * Calculate risk score for a file
   * @param {Object} file - Multer file object with path and other properties
   * @param {Object} metadata - Additional file metadata
   * @returns {Promise<Object>} Risk assessment result
   */
  async calculateRiskScore(file, metadata = {}) {
    try {
      const formData = new FormData();
      
      // Add file to form data
      formData.append('file', fs.createReadStream(file.path), {
        filename: file.originalname,
        contentType: file.mimetype,
      });

      // Add metadata
      formData.append('metadata', JSON.stringify({
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        ...metadata,
      }));

      const response = await axios.post(this.aiModelEndpoint, formData, {
        headers: {
          ...formData.getHeaders(),
          'Authorization': `Bearer ${this.apiKey}`,
          'Accept': 'application/json',
        },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: this.timeout,
      });

      return this._processRiskResponse(response.data);
    } catch (error) {
      logger.error('AI Risk Scoring Error:', error);
      return this._handleError(error);
    }
  }

  /**
   * Process the AI model response
   * @private
   */
  _processRiskResponse(data) {
    // Default response structure
    const defaultResponse = {
      riskScore: 0,
      riskLevel: 'low',
      isMalicious: false,
      confidence: 0,
      details: {},
      modelVersion: '1.0.0',
      timestamp: new Date().toISOString(),
    };

    if (!data) {
      logger.warn('Empty response from AI model');
      return defaultResponse;
    }

    try {
      // Map the AI model response to our standard format
      return {
        riskScore: data.score || 0,
        riskLevel: this._getRiskLevel(data.score || 0),
        isMalicious: data.is_malicious || false,
        confidence: data.confidence || 0,
        details: data.details || {},
        modelVersion: data.model_version || '1.0.0',
        timestamp: new Date().toISOString(),
        rawResponse: data, // Include raw response for debugging
      };
    } catch (error) {
      logger.error('Error processing AI response:', error);
      return defaultResponse;
    }
  }

  /**
   * Determine risk level based on score
   * @private
   */
  _getRiskLevel(score) {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 20) return 'low';
    return 'info';
  }

  /**
   * Handle errors from the AI service
   * @private
   */
  _handleError(error) {
    // Default error response
    const errorResponse = {
      error: true,
      message: 'Error processing file with AI model',
      riskScore: 100, // Default to high risk on error
      riskLevel: 'high',
      isMalicious: true, // Default to malicious on error
      details: {},
    };

    if (error.response) {
      // The request was made and the server responded with a status code
      errorResponse.status = error.response.status;
      errorResponse.message = error.response.data?.message || error.message;
      errorResponse.details = error.response.data?.details || {};
    } else if (error.request) {
      // The request was made but no response was received
      errorResponse.message = 'No response from AI model service';
    } else {
      // Something happened in setting up the request
      errorResponse.message = error.message;
    }

    logger.error('AI Service Error:', errorResponse);
    return errorResponse;
  }

  /**
   * Check if AI service is available
   * @returns {Promise<boolean>} Service availability status
   */
  async isAvailable() {
    try {
      const response = await axios.get(`${this.aiModelEndpoint}/health`, {
        timeout: 5000, // 5 second timeout for health check
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });
      return response.status === 200 && response.data?.status === 'healthy';
    } catch (error) {
      logger.warn('AI Service Health Check Failed:', error.message);
      return false;
    }
  }
}

// Export a singleton instance
module.exports = new RiskScoringService();
