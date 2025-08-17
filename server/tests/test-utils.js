const User = require('../models/user.model');
const jwt = require('jsonwebtoken');
const config = require('../config');

/**
 * Create a test user in the database
 * @param {Object} userData - User data
 * @returns {Promise<Object>} Created user
 */
async function createTestUser(userData = {}) {
  const defaultUser = {
    email: 'test@example.com',
    password: 'password123',
    name: 'Test User',
    isEmailVerified: true,
    ...userData
  };
  
  // Hash password if provided
  if (defaultUser.password) {
    const user = new User(defaultUser);
    await user.setPassword(defaultUser.password);
    return user.save();
  }
  
  return User.create(defaultUser);
}

/**
 * Generate JWT token for a user
 * @param {Object} user - User object
 * @returns {String} JWT token
 */
function generateAuthToken(user) {
  return jwt.sign(
    { userId: user._id, email: user.email },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

/**
 * Get auth token for a test user
 * @param {String} email - User email
 * @param {String} password - User password
 * @returns {Promise<String>} JWT token
 */
async function getAuthToken(email, password) {
  const user = await User.findOne({ email });
  
  if (!user) {
    throw new Error('User not found');
  }
  
  const isPasswordValid = await user.validatePassword(password);
  
  if (!isPasswordValid) {
    throw new Error('Invalid password');
  }
  
  return generateAuthToken(user);
}

/**
 * Clean up test data
 * @returns {Promise<void>}
 */
async function cleanupTestData() {
  await User.deleteMany({});
  // Add other models to clean up as needed
}

/**
 * Setup test environment
 * @returns {Promise<Object>} Test context with test user and token
 */
async function setupTestEnvironment() {
  // Clean up any existing test data
  await cleanupTestData();
  
  // Create test user
  const testUser = await createTestUser({
    email: 'test@example.com',
    password: 'test123',
    name: 'Test User',
    isEmailVerified: true
  });
  
  // Generate auth token
  const authToken = generateAuthToken(testUser);
  
  return {
    testUser,
    authToken,
    cleanup: async () => {
      await cleanupTestData();
    }
  };
}

module.exports = {
  createTestUser,
  generateAuthToken,
  getAuthToken,
  cleanupTestData,
  setupTestEnvironment
};
