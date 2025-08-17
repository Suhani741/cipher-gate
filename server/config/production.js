// Production environment configuration
// Overrides and additions to the default configuration

module.exports = {
  // Production-specific settings
  env: 'production',
  
  // Security settings for production
  security: {
    // Enable security headers
    enableSecurityHeaders: true,
    // Enable rate limiting
    enableRateLimiting: true,
    // Enable request validation
    enableRequestValidation: true,
    // Enable CSRF protection
    enableCSRF: true,
    // Enable CORS
    enableCORS: true,
    // Enable content security policy
    enableCSP: true,
    // Enable HSTS
    enableHSTS: true,
    // Enable XSS protection
    enableXSS: true,
    // Enable no-sniff
    enableNoSniff: true,
    // Enable X-Frame-Options
    enableXFrameOptions: true,
    // Enable DNS prefetch control
    enableDNSPrefetchControl: true,
  },
  
  // Database configuration for production
  db: {
    uri: process.env.MONGODB_URI,
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
      useFindAndModify: false,
      // Enable SSL/TLS in production
      ssl: true,
      sslValidate: true,
      // Connection pooling options
      maxPoolSize: 10,
      minPoolSize: 5,
      maxIdleTimeMS: 30000,
      // Server selection timeout
      serverSelectionTimeoutMS: 30000,
      // Socket timeout
      socketTimeoutMS: 45000,
      // Connection timeout
      connectTimeoutMS: 30000,
      // Replica set options if using replica sets
      replicaSet: process.env.MONGO_REPLICA_SET,
      // Authentication database
      authSource: 'admin',
      // Retry writes
      retryWrites: true,
      // Read preference
      readPreference: 'primary',
      // Write concern
      w: 'majority',
      // Journal write concern
      j: true,
      // Wtimeout for write concern
      wtimeoutMS: 10000,
    },
  },
  
  // AWS Configuration for production
  aws: {
    // Use IAM roles for EC2 or ECS tasks in production
    // accessKeyId and secretAccessKey should be loaded from environment variables
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
    
    // S3 Configuration
    s3: {
      bucketName: process.env.S3_BUCKET_NAME,
      uploadFolder: process.env.S3_UPLOAD_FOLDER || 'uploads',
      quarantineFolder: process.env.S3_QUARANTINE_FOLDER || 'quarantine',
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024, // 100MB default
      presignedUrlExpiry: parseInt(process.env.PRESIGNED_URL_EXPIRY) || 3600, // 1 hour
      
      // Enable server-side encryption
      serverSideEncryption: 'AES256', // or 'aws:kms' for KMS encryption
      
      // Enable versioning
      versioning: true,
      
      // Enable lifecycle rules for automatic cleanup
      lifecycleRules: [
        {
          id: 'cleanup-temp-uploads',
          status: 'Enabled',
          prefix: 'temp/',
          expiration: { days: 1 }, // Delete temp files after 1 day
        },
        {
          id: 'move-to-glacier',
          status: 'Enabled',
          prefix: 'archive/',
          transitions: [
            {
              days: 30, // Transition to Standard-IA after 30 days
              storageClass: 'STANDARD_IA',
            },
            {
              days: 90, // Transition to Glacier after 90 days
              storageClass: 'GLACIER',
            },
          ],
        },
      ],
    },
  },
  
  // Logging configuration for production
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || '/var/log/ciphergate/app.log',
    errorFile: process.env.ERROR_LOG_FILE || '/var/log/ciphergate/error.log',
    maxSize: process.env.LOG_MAX_SIZE || '100m',
    maxFiles: process.env.LOG_MAX_FILES || '30d',
    // Enable JSON logging for better log aggregation
    json: true,
    // Enable log rotation
    rotate: true,
    // Enable request logging middleware
    enableRequestLogging: true,
  },
  
  // Rate limiting for production
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.RATE_LIMIT_MAX ? parseInt(process.env.RATE_LIMIT_MAX) : 100, // requests per windowMs
    // Enable rate limiting headers
    standardHeaders: true,
    // Enable legacy rate limit headers
    legacyHeaders: false,
  },
  
  // CORS configuration for production
  cors: {
    origin: process.env.ALLOWED_ORIGINS ? 
      process.env.ALLOWED_ORIGINS.split(',') : 
      [
        'https://ciphergate.example.com',
        'https://www.ciphergate.example.com',
      ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
    // Enable CORS preflight cache
    maxAge: 600, // 10 minutes
  },
  
  // Session configuration for production
  session: {
    secret: process.env.SESSION_SECRET || 'your-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: true, // Only send over HTTPS
      httpOnly: true, // Prevent client-side JS from reading the cookie
      sameSite: 'strict', // CSRF protection
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      domain: process.env.COOKIE_DOMAIN || '.ciphergate.example.com',
    },
    // Use a secure store like Redis in production
    store: null, // Configure your session store here
  },
  
  // File scanning in production
  scanning: {
    enabled: true, // Always enable scanning in production
    useMockScanner: false, // Never use mock scanner in production
    // Configure your production scanning service
    clamav: {
      host: process.env.CLAMAV_HOST || 'clamav',
      port: parseInt(process.env.CLAMAV_PORT) || 3310,
      timeout: parseInt(process.env.CLAMAV_TIMEOUT) || 60000, // 60 seconds
    },
  },
  
  // Email configuration for production
  email: {
    enabled: process.env.EMAIL_ENABLED === 'true',
    service: process.env.EMAIL_SERVICE || 'ses', // Use AWS SES in production
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: true, // Always use TLS in production
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    from: process.env.EMAIL_FROM || 'CipherGate <noreply@ciphergate.example.com>',
    // Enable email queue for production
    enableQueue: true,
    // Maximum retry attempts for failed emails
    maxRetries: 3,
    // Retry delay in milliseconds
    retryDelay: 60000, // 1 minute
  },
  
  // Admin configuration for production
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@ciphergate.example.com',
    // In production, always require a strong password
    minPasswordLength: 12,
    requireComplexPassword: true,
    // Enable admin approval for new users if needed
    requireAdminApproval: process.env.REQUIRE_ADMIN_APPROVAL === 'true',
  },
  
  // Production-specific features
  features: {
    registration: process.env.ALLOW_REGISTRATION !== 'false',
    emailVerification: process.env.REQUIRE_EMAIL_VERIFICATION !== 'false',
    twoFactorAuth: process.env.REQUIRE_2FA === 'true',
    fileSharing: true,
    apiDocumentation: process.env.ENABLE_API_DOCS === 'true', // Disable in production by default
  },
  
  // Production server settings
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: process.env.PORT || 3000,
    // Disable watching in production
    watch: false,
    // Enable clustering for better performance
    cluster: process.env.ENABLE_CLUSTERING !== 'false',
    // Number of worker processes (defaults to number of CPU cores)
    workers: process.env.WORKER_COUNT || require('os').cpus().length,
    // Enable trust proxy for production
    trustProxy: true,
    // Enable compression
    compression: true,
    // Enable request logging
    enableRequestLogging: true,
  },
  
  // Monitoring and metrics
  monitoring: {
    // Enable application performance monitoring
    enableAPM: process.env.ENABLE_APM === 'true',
    // New Relic configuration (if using)
    newRelic: {
      licenseKey: process.env.NEW_RELIC_LICENSE_KEY,
      appName: process.env.NEW_RELIC_APP_NAME || 'CipherGate',
      logLevel: 'info',
    },
    // Datadog configuration (if using)
    datadog: {
      apiKey: process.env.DD_API_KEY,
      appKey: process.env.DD_APP_KEY,
      site: process.env.DD_SITE || 'datadoghq.com',
    },
  },
  
  // Error tracking
  errorTracking: {
    // Enable error tracking
    enabled: process.env.ENABLE_ERROR_TRACKING === 'true',
    // Sentry configuration (if using)
    sentry: {
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'production',
      release: process.env.APP_VERSION || '1.0.0',
      // Enable performance monitoring
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE) || 0.2,
    },
  },
  
  // Caching configuration
  cache: {
    // Enable caching
    enabled: process.env.ENABLE_CACHING !== 'false',
    // Default TTL in seconds
    ttl: parseInt(process.env.CACHE_TTL) || 300, // 5 minutes
    // Redis configuration (if using Redis)
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB) || 0,
      // Enable TLS if needed
      tls: process.env.REDIS_TLS === 'true' ? {}
        : process.env.REDIS_TLS === 'insecure' ? { rejectUnauthorized: false }
        : undefined,
    },
  },
  
  // Background jobs configuration
  jobs: {
    // Enable background jobs
    enabled: process.env.ENABLE_JOBS !== 'false',
    // Concurrency (number of jobs to process in parallel)
    concurrency: parseInt(process.env.JOBS_CONCURRENCY) || 5,
    // Job queue configuration
    queue: {
      // Maximum number of retries for failed jobs
      maxRetries: 3,
      // Delay between retries in milliseconds
      backoff: 60000, // 1 minute
      // Remove completed jobs after this many milliseconds
      removeOnComplete: 24 * 60 * 60 * 1000, // 24 hours
      // Remove failed jobs after this many milliseconds
      removeOnFail: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
  },
};
