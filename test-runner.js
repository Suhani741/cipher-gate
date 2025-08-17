#!/usr/bin/env node

/**
 * Test Runner
 * 
 * This script runs the test suite and generates coverage reports.
 * It can be configured to run different types of tests (unit, integration, e2e).
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.test
require('dotenv').config({ path: '.env.test' });

// Configuration
const config = {
  testTypes: ['unit', 'integration', 'e2e'],
  coverageDir: path.join(__dirname, 'coverage'),
  testResultsDir: path.join(__dirname, 'test-results'),
  jestConfig: require('./package.json').jest,
};

// Create necessary directories
function setupDirectories() {
  [config.coverageDir, config.testResultsDir].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Run tests with coverage
function runTests(testType) {
  console.log(`\n🚀 Running ${testType} tests...`);
  
  try {
    const command = `cross-env NODE_ENV=test jest --config=jest.config.js --testPathPattern="${testType}" --coverage`;
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (error) {
    console.error(`❌ ${testType} tests failed`);
    return false;
  }
}

// Generate coverage report
function generateCoverageReport() {
  console.log('\n📊 Generating coverage report...');
  
  try {
    const lcovPath = path.join(config.coverageDir, 'lcov-report', 'index.html');
    console.log(`\n✅ Coverage report generated at: file://${path.resolve(lcovPath)}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to generate coverage report:', error.message);
    return false;
  }
}

// Main function
async function main() {
  console.log('🚀 Starting test runner...');
  
  // Setup directories
  setupDirectories();
  
  // Run tests
  let allTestsPassed = true;
  
  for (const testType of config.testTypes) {
    const success = runTests(testType);
    if (!success) {
      allTestsPassed = false;
      break;
    }
  }
  
  // Generate coverage report if all tests passed
  if (allTestsPassed) {
    generateCoverageReport();
    console.log('\n✅ All tests passed!');
  } else {
    console.log('\n❌ Some tests failed. Check the logs for details.');
    process.exit(1);
  }
}

// Run the test runner
main().catch(error => {
  console.error('❌ Test runner failed:', error);
  process.exit(1);
});
