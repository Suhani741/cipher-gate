require('dotenv').config();

const config = {
  // Server configuration
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 5000,
  
  // JWT Configuration
  jwt: {
    secret: process.env.JWT_SECRET || 'your_jwt_secret_key_here',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your_jwt_refresh_secret_key_here',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },
  
  // Database configuration
  db: {
    uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/ciphergate',
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      useCreateIndex: true,
      useFindAndModify: false,
    },
  },
  
  // AWS Configuration
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    region: process.env.AWS_REGION || 'us-east-1',
    
    // S3 Configuration
    s3: {
      bucketName: process.env.S3_BUCKET_NAME || 'ciphergate-files',
      uploadFolder: process.env.S3_UPLOAD_FOLDER || 'uploads',
      quarantineFolder: process.env.S3_QUARANTINE_FOLDER || 'quarantine',
      maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 100 * 1024 * 1024, // 100MB default
      presignedUrlExpiry: parseInt(process.env.PRESIGNED_URL_EXPIRY) || 3600, // 1 hour
      
      // CORS configuration for S3 bucket
      corsRules: [
        {
          AllowedHeaders: ['*'],
          AllowedMethods: ['GET', 'PUT', 'POST', 'DELETE', 'HEAD'],
          AllowedOrigins: process.env.ALLOWED_ORIGINS ? 
            process.env.ALLOWED_ORIGINS.split(',') : 
            ['http://localhost:3000'],
          ExposeHeaders: ['ETag'],
          MaxAgeSeconds: 3000,
        },
      ],
    },
    
    // SQS Configuration for background jobs (optional)
    sqs: {
      queueUrl: process.env.SQS_QUEUE_URL || '',
      visibilityTimeout: 300, // 5 minutes
      maxNumberOfMessages: 10,
      waitTimeSeconds: 20,
    },
  },
  
  // File scanning configuration
  scanning: {
    enabled: process.env.FILE_SCANNING_ENABLED !== 'false', // Enabled by default
    maxFileSize: parseInt(process.env.MAX_SCAN_SIZE) || 50 * 1024 * 1024, // 50MB
    timeout: parseInt(process.env.SCAN_TIMEOUT) || 300000, // 5 minutes in ms
    
    // ClamAV configuration (if using)
    clamav: {
      host: process.env.CLAMAV_HOST || 'localhost',
      port: parseInt(process.env.CLAMAV_PORT) || 3310,
      timeout: parseInt(process.env.CLAMAV_TIMEOUT) || 60000, // 60 seconds
    },
    
    // VirusTotal API (if using)
    virusTotal: {
      apiKey: process.env.VIRUSTOTAL_API_KEY || '',
      enabled: process.env.VIRUSTOTAL_ENABLED === 'true',
      maxFileSize: 32 * 1024 * 1024, // 32MB (VirusTotal free tier limit)
    },
  },
  
  // Rate limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: process.env.RATE_LIMIT_MAX || 100, // limit each IP to 100 requests per windowMs
  },
  
  // CORS configuration
  cors: {
    origin: process.env.ALLOWED_ORIGINS ? 
      process.env.ALLOWED_ORIGINS.split(',') : 
      ['http://localhost:3000'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    credentials: true,
  },
  
  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || 'logs/app.log',
    errorFile: process.env.ERROR_LOG_FILE || 'logs/error.log',
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
  },
  
  // Email configuration (for notifications)
  email: {
    enabled: process.env.EMAIL_ENABLED === 'true',
    service: process.env.EMAIL_SERVICE || 'gmail',
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER || '',
      pass: process.env.EMAIL_PASS || '',
    },
    from: process.env.EMAIL_FROM || 'CipherGate <noreply@ciphergate.com>',
  },
  
  // Admin configuration
  admin: {
    email: process.env.ADMIN_EMAIL || 'admin@ciphergate.com',
    defaultPassword: process.env.ADMIN_DEFAULT_PASSWORD || 'ChangeMe123!',
  },
  
  // Feature flags
  features: {
    registration: process.env.FEATURE_REGISTRATION !== 'false',
    emailVerification: process.env.FEATURE_EMAIL_VERIFICATION === 'true',
    twoFactorAuth: process.env.FEATURE_2FA === 'true',
    fileSharing: process.env.FEATURE_FILE_SHARING !== 'false',
    apiDocumentation: process.env.FEATURE_API_DOCS !== 'false',
  },
};

// Environment-specific overrides
const envConfig = require(`./${config.env}.js`) || {};
module.exports = { ...config, ...envConfig };
