const path = require('path');
const logger = require('../../utils/logger');

// Known malicious file signatures (simplified example)
const MALICIOUS_SIGNATURES = [
  '4D5A9000030000000400', // Windows PE executable
  '7F454C46',             // ELF executable
  'D0CF11E0A1B11AE1',     // MS Office documents
  '25504446',             // PDF
  '4F676753',             // Ogg media
];

// Known risky file extensions
const RISKY_EXTENSIONS = [
  '.exe', '.dll', '.bat', '.cmd', '.ps1', '.vbs',
  '.js', '.jse', '.wsf', '.wsh', '.msi', '.jar'
];

// Known safe file extensions
const SAFE_EXTENSIONS = [
  '.txt', '.md', '.csv', '.json', '.xml',
  '.jpg', '.jpeg', '.png', '.gif', '.bmp',
  '.mp3', '.wav', '.mp4', '.avi', '.mov'
];

class MockRiskScoringService {
  constructor() {
    this.isMock = true;
    this.modelVersion = 'mock-1.0.0';
  }

  /**
   * Calculate a mock risk score for a file
   * @param {Object} file - File object with path and other properties
   * @param {Object} metadata - Additional file metadata
   * @returns {Promise<Object>} Mock risk assessment result
   */
  async calculateRiskScore(file, metadata = {}) {
    try {
      // Simulate API delay (50-300ms)
      await new Promise(resolve => setTimeout(resolve, 50 + Math.random() * 250));
      
      const fileExt = path.extname(file.originalname).toLowerCase();
      const fileSize = file.size || 0;
      
      // Base risk score (0-100)
      let riskScore = 0;
      const details = {
        fileType: file.mimetype,
        fileExtension: fileExt,
        fileSize,
        analysis: []
      };

      // Check file extension
      if (RISKY_EXTENSIONS.includes(fileExt)) {
        riskScore += 60;
        details.analysis.push('Risky file extension detected');
      } else if (SAFE_EXTENSIONS.includes(fileExt)) {
        riskScore -= 10;
        details.analysis.push('Safe file extension detected');
      } else {
        riskScore += 10; // Slight risk for unknown extensions
      }

      // Check file size (larger files get higher risk)
      const sizeRisk = Math.min(30, Math.floor(Math.log10(fileSize || 1) * 5));
      riskScore += sizeRisk;
      details.analysis.push(`File size risk: ${sizeRisk}/30`);

      // Check for known malicious patterns (simplified)
      const fileBuffer = require('fs').readFileSync(file.path);
      const fileHex = fileBuffer.toString('hex').toUpperCase();
      
      const foundSignatures = MALICIOUS_SIGNATURES.filter(sig => 
        fileHex.startsWith(sig)
      );
      
      if (foundSignatures.length > 0) {
        riskScore = Math.max(riskScore, 90); // High risk for known signatures
        details.analysis.push(`Detected potential malicious signature: ${foundSignatures[0].substring(0, 12)}...`);
      }

      // Add some randomness (0-10)
      riskScore += Math.random() * 10;
      riskScore = Math.max(0, Math.min(100, Math.round(riskScore))); // Clamp to 0-100

      // Generate confidence score (80-100% for mock)
      const confidence = 80 + Math.random() * 20;

      return {
        riskScore,
        riskLevel: this._getRiskLevel(riskScore),
        isMalicious: riskScore >= 70,
        confidence: Math.round(confidence * 10) / 10,
        details,
        modelVersion: this.modelVersion,
        timestamp: new Date().toISOString(),
        isMock: true
      };
    } catch (error) {
      logger.error('Mock Risk Scoring Error:', error);
      return this._getErrorResponse(error);
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
   * Generate an error response
   * @private
   */
  _getErrorResponse(error) {
    return {
      error: true,
      message: error.message || 'Error in mock risk assessment',
      riskScore: 100,
      riskLevel: 'high',
      isMalicious: true,
      details: { error: error.toString() },
      isMock: true,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Mock health check
   * @returns {Promise<boolean>} Always returns true for mock
   */
  async isAvailable() {
    return true;
  }
}

// Export a singleton instance
module.exports = new MockRiskScoringService();
