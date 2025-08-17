module.exports = {
  // The test environment that will be used for testing
  testEnvironment: 'node',
  
  // Global setup file that runs before all tests
  globalSetup: '<rootDir>/server/tests/setup.js',
  
  // Global teardown file that runs after all tests
  // globalTeardown: '<rootDir>/server/tests/teardown.js',
  
  // The glob patterns Jest uses to detect test files
  testMatch: [
    '**/__tests__/**/*.test.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // An array of regexp pattern strings that are matched against all test paths
  testPathIgnorePatterns: [
    '/node_modules/',
    '/client/',
    '/build/'
  ],
  
  // The directory where Jest should output its coverage files
  coverageDirectory: 'coverage',
  
  // An array of glob patterns indicating a set of files for which coverage information should be collected
  collectCoverageFrom: [
    'server/**/*.js',
    '!**/node_modules/**',
    '!**/tests/**',
    '!**/coverage/**',
    '!**/mocks/**',
    '!**/config/**',
    '!**/index.js',
    '!**/app.js'
  ],
  
  // A list of reporter names that Jest uses when writing coverage reports
  coverageReporters: [
    'text',
    'lcov',
    'text-summary'
  ],
  
  // The minimum percentage of code coverage required
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // A map from regular expressions to paths to transformers
  transform: {
    '^.+\\.js$': 'babel-jest'
  },
  
  // An array of regexp pattern strings that are matched against all source file paths
  // Matched files will skip transformation
  transformIgnorePatterns: [
    '/node_modules/'
  ],
  
  // Automatically clear mock calls and instances between every test
  clearMocks: true,
  
  // Indicates whether the coverage information should be collected while executing the test
  collectCoverage: true,
  
  // The number of seconds after which a test is considered as slow and reported as such in the results
  slowTestThreshold: 10,
  
  // The number of seconds before a test times out
  testTimeout: 30000,
  
  // A map from regular expressions to module names or to arrays of module names that allow to stub out resources
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/server/$1',
    '^@tests/(.*)$': '<rootDir>/tests/$1',
    '^@models/(.*)$': '<rootDir>/server/models/$1',
    '^@controllers/(.*)$': '<rootDir>/server/controllers/$1',
    '^@middleware/(.*)$': '<rootDir>/server/middleware/$1',
    '^@routes/(.*)$': '<rootDir>/server/routes/$1',
    '^@utils/(.*)$': '<rootDir>/server/utils/$1',
    '^@config$': '<rootDir>/server/config',
    '^@services/(.*)$': '<rootDir>/server/services/$1'
  },
  
  // An array of file extensions your modules use
  moduleFileExtensions: ['js', 'json'],
  
  // A list of paths to directories that Jest should use to search for files in
  roots: [
    '<rootDir>/server',
    '<rootDir>/tests'
  ],
  
  // The paths to modules that run some code to configure or set up the testing environment before each test
  setupFiles: [
    '<rootDir>/server/tests/setup.js'
  ],
  
  // A list of paths to modules that run code to configure or set up the testing framework before each test
  setupFilesAfterEnv: [
    '<rootDir>/server/tests/setup.js'
  ],
  
  // The glob patterns Jest uses to detect test files
  testMatch: [
    '**/tests/**/*.test.js'
  ],
  
  // An array of regexp pattern strings that are matched against all test paths before executing the test
  testPathIgnorePatterns: [
    '/node_modules/'
  ],
  
  // This option allows the use of a custom test runner
  // testRunner: 'jest-circus/runner',
  
  // This option allows you to use a custom watch plugins
  // watchPlugins: [
  //   'jest-watch-typeahead/filename',
  //   'jest-watch-typeahead/testname'
  // ],
  
  // Whether to use watchman for file crawling
  // watchman: true,
};
