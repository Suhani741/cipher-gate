// Test environment configuration
// Overrides and additions to the default configuration

module.exports = {
  // Test-specific settings
  env: 'test',
  
  // Disable logging in test environment
  logging: {
    level: 'error', // Only log errors in tests
    silent: true,   // Suppress all logging
  },
  
  // Database configuration for testing
  db: {
    uri: process.env.TEST_MONGODB_URI || 'mongodb://localhost:27017/ciphergate-test',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
      useFindAndModify: false,
      // Disable connection buffering for tests
      bufferCommands: false,
      // Disable connection pooling for tests
      poolSize: 1,
      // Disable server selection retry
      serverSelectionTimeoutMS: 5000,
      // Disable socket timeouts for tests
      socketTimeoutMS: 0,
      // Disable connection timeouts for tests
      connectTimeoutMS: 10000,
    },
  },
  
  // AWS Configuration for testing (using localstack or mocks)
  aws: {
    // Enable AWS SDK mocking
    mock: true,
    // Use localstack for local AWS service emulation
    localstack: process.env.USE_LOCALSTACK === 'true',
    localstackEndpoint: process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566',
    
    // S3 Configuration for testing
    s3: {
      bucketName: 'test-bucket',
      uploadFolder: 'test-uploads',
      quarantineFolder: 'test-quarantine',
      maxFileSize: 10 * 1024 * 1024, // 10MB for tests
      presignedUrlExpiry: 900, // 15 minutes for tests
    },
  },
  
  // Disable rate limiting in tests
  rateLimit: {
    enabled: false,
  },
  
  // CORS configuration for testing
  cors: {
    origin: '*', // Allow all origins in tests
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  },
  
  // Session configuration for testing
  session: {
    secret: 'test-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Allow HTTP in tests
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  },
  
  // File scanning in tests (use mock scanner)
  scanning: {
    enabled: true,
    useMockScanner: true,
    // Mock scanner settings
    mockScanner: {
      // Percentage of files to mark as malicious (0-1)
      maliciousRate: 0.1,
      // Average scan time in ms
      scanTime: 100,
      // Random variation in scan time (±50%)
      scanTimeVariation: 0.5,
    },
  },
  
  // Email configuration for testing
  email: {
    enabled: false, // Disable actual email sending in tests
    // Use ethereal.email for test emails
    testAccount: {
      user: 'test@example.com',
      pass: 'test-password',
    },
  },
  
  // Test-specific features
  features: {
    registration: true,
    emailVerification: false, // Disable email verification in tests
    twoFactorAuth: false, // Disable 2FA in tests
    fileSharing: true,
    apiDocumentation: false, // Disable API docs in tests
  },
  
  // Test server settings
  server: {
    host: 'localhost',
    port: 0, // Use random available port
    // Disable watching in tests
    watch: false,
    // Disable clustering in tests
    cluster: false,
  },
  
  // Test data configuration
  testData: {
    // Number of test users to create
    userCount: 5,
    // Number of test files per user
    filesPerUser: 3,
    // Test file sizes in bytes
    fileSizes: [
      1024, // 1KB
      1024 * 1024, // 1MB
      5 * 1024 * 1024, // 5MB
    ],
  },
  
  // Test timeout configuration
  timeouts: {
    // Global test timeout in milliseconds
    test: 10000, // 10 seconds
    // API request timeout in milliseconds
    request: 5000, // 5 seconds
    // Database operation timeout in milliseconds
    database: 5000, // 5 seconds
    // File operation timeout in milliseconds
    file: 10000, // 10 seconds
  },
  
  // Test security configuration
  security: {
    // Disable security headers in tests for easier testing
    enableSecurityHeaders: false,
    // Disable rate limiting in tests
    enableRateLimiting: false,
    // Enable request validation in tests
    enableRequestValidation: true,
    // Disable CSRF protection in tests
    enableCSRF: false,
    // Enable CORS in tests
    enableCORS: true,
    // Disable content security policy in tests
    enableCSP: false,
    // Disable HSTS in tests
    enableHSTS: false,
    // Disable XSS protection in tests
    enableXSS: false,
    // Disable no-sniff in tests
    enableNoSniff: false,
    // Disable X-Frame-Options in tests
    enableXFrameOptions: false,
    // Disable DNS prefetch control in tests
    enableDNSPrefetchControl: false,
  },
};
