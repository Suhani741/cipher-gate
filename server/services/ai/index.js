const config = require('../../../config');
const logger = require('../../utils/logger');

let riskScoringService;

// Use mock service in test environment or when explicitly disabled
if (process.env.NODE_ENV === 'test' || config.ai?.useMock) {
  logger.info('Using MOCK AI Risk Scoring Service');
  riskScoringService = require('./mockRiskScoring.service');
} else {
  try {
    logger.info('Initializing AI Risk Scoring Service');
    riskScoringService = require('./riskScoring.service');
    
    // Verify the AI service is available
    riskScoringService.isAvailable().then(available => {
      if (available) {
        logger.info('AI Risk Scoring Service is available');
      } else {
        logger.warn('AI Risk Scoring Service is not available, falling back to mock service');
        riskScoringService = require('./mockRiskScoring.service');
      }
    }).catch(error => {
      logger.error('Failed to initialize AI Risk Scoring Service, falling back to mock:', error);
      riskScoringService = require('./mockRiskScoring.service');
    });
  } catch (error) {
    logger.error('Error initializing AI Risk Scoring Service, using mock service:', error);
    riskScoringService = require('./mockRiskScoring.service');
  }
}

module.exports = {
  riskScoringService,
  
  /**
   * Get the active risk scoring service
   * @returns {Object} The active risk scoring service
   */
  getRiskScoringService() {
    return riskScoringService;
  },
  
  /**
   * Force using the mock service (for testing)
   */
  useMockService() {
    logger.warn('Forcing use of MOCK AI Risk Scoring Service');
    riskScoringService = require('./mockRiskScoring.service');
  },
  
  /**
   * Force using the real service (for testing)
   */
  useRealService() {
    if (process.env.NODE_ENV !== 'test') {
      logger.warn('Forcing use of REAL AI Risk Scoring Service');
      riskScoringService = require('./riskScoring.service');
    }
  }
};
