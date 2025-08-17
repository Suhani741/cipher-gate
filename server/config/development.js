// Development environment configuration
// Overrides and additions to the default configuration

module.exports = {
  // Development-specific settings
  env: 'development',
  
  // Enable detailed error messages and stack traces
  errorDetails: true,
  
  // Database configuration for development
  db: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ciphergate-dev',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
      useFindAndModify: false,
    },
  },
  
  // Logging configuration for development
  logging: {
    level: 'debug', // More verbose logging in development
    prettyPrint: true, // Pretty print logs
    colorize: true, // Colorize console output
  },
  
  // CORS configuration for development
  cors: {
    origin: [
      'http://localhost:3000', // React dev server
      'http://127.0.0.1:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3001',
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  },
  
  // Rate limiting for development (more generous)
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 500, // Limit each IP to 500 requests per windowMs
  },
  
  // File scanning in development (can be disabled for faster development)
  scanning: {
    enabled: process.env.FILE_SCANNING_ENABLED !== 'false',
    // Use mock scanner in development by default
    useMockScanner: process.env.USE_MOCK_SCANNER !== 'false',
  },
  
  // Email configuration for development
  email: {
    enabled: process.env.EMAIL_ENABLED === 'true',
    // Use MailHog or similar for local email testing
    host: process.env.EMAIL_HOST || 'localhost',
    port: parseInt(process.env.EMAIL_PORT) || 1025,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER || '',
      pass: process.env.EMAIL_PASS || '',
    },
    from: 'CipherGate Dev <dev@ciphergate.local>',
  },
  
  // Development-specific features
  features: {
    registration: true, // Enable registration in development
    emailVerification: false, // Disable email verification in development
    twoFactorAuth: false, // Disable 2FA in development
    fileSharing: true,
    apiDocumentation: true, // Enable API documentation
  },
  
  // Development server settings
  server: {
    host: '0.0.0.0',
    port: process.env.PORT || 5000,
    // Enable hot-reload in development
    watch: true,
  },
};
