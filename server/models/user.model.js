const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const logger = require('../utils/logger');

// User roles
const ROLES = {
  USER: 'user',
  ADMIN: 'admin',
  MODERATOR: 'moderator'
};

// User status
const STATUS = {
  ACTIVE: 'active',
  SUSPENDED: 'suspended',
  PENDING: 'pending',
  DELETED: 'deleted'
};

const userSchema = new mongoose.Schema({
  // Authentication
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\S+@\S+\.\S+$/, 'Please use a valid email address.']
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
    select: false // Don't return password by default
  },
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  
  // Profile
  firstName: {
    type: String,
    trim: true,
    maxlength: 50
  },
  lastName: {
    type: String,
    trim: true,
    maxlength: 50
  },
  avatar: String,
  bio: {
    type: String,
    maxlength: 500
  },
  
  // Account settings
  role: {
    type: String,
    enum: Object.values(ROLES),
    default: ROLES.USER
  },
  status: {
    type: String,
    enum: Object.values(STATUS),
    default: STATUS.ACTIVE
  },
  emailVerified: {
    type: Boolean,
    default: false
  },
  emailVerificationToken: String,
  emailVerificationExpires: Date,
  twoFactorEnabled: {
    type: Boolean,
    default: false
  },
  twoFactorSecret: {
    type: String,
    select: false
  },
  
  // Storage
  storageUsed: {
    type: Number,
    default: 0
  },
  storageQuota: {
    type: Number,
    default: 10737418240 // 10GB in bytes
  },
  
  // Security
  lastLogin: Date,
  lastLoginIp: String,
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: Date,
  failedLoginAttempts: [{
    ip: String,
    userAgent: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ status: 1 });
userSchema.index({ role: 1 });
userSchema.index({ 'storageUsed': 1 });

// Virtuals
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`.trim();
});

// Pre-save hook to hash password
userSchema.pre('save', async function(next) {
  // Only run this function if password was actually modified
  if (!this.isModified('password')) return next();
  
  try {
    // Hash the password with cost of 12
    this.password = await bcrypt.hash(this.password, 12);
    
    // Delete passwordConfirm field
    this.passwordConfirm = undefined;
    
    // Set passwordChangedAt
    if (!this.isNew) {
      this.passwordChangedAt = Date.now() - 1000; // Ensure token is created after password change
    }
    
    next();
  } catch (error) {
    logger.error('Error hashing password:', error);
    next(error);
  }
});

// Instance method to check if password is correct
userSchema.methods.correctPassword = async function(candidatePassword, userPassword) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

// Instance method to check if password was changed after token was issued
userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000, 10);
    return JWTTimestamp < changedTimestamp;
  }
  return false; // Not changed
};

// Instance method to create password reset token
userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');
  
  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
    
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  
  return resetToken;
};

// Instance method to create email verification token
userSchema.methods.createEmailVerificationToken = function() {
  const verificationToken = crypto.randomBytes(32).toString('hex');
  
  this.emailVerificationToken = crypto
    .createHash('sha256')
    .update(verificationToken)
    .digest('hex');
    
  this.emailVerificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hours
  
  return verificationToken;
};

// Instance method to generate JWT token
userSchema.methods.generateAuthToken = function() {
  const token = jwt.sign(
    { id: this._id, role: this.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
  
  return token;
};

// Instance method to generate refresh token
userSchema.methods.generateRefreshToken = function() {
  const refreshToken = jwt.sign(
    { id: this._id },
    config.jwt.refreshSecret,
    { expiresIn: config.jwt.refreshExpiresIn }
  );
  
  return refreshToken;
};

// Static method to check if account is locked
userSchema.statics.isAccountLocked = async function(userId) {
  const user = await this.findById(userId).select('lockUntil');
  
  if (!user) {
    return false;
  }
  
  return user.lockUntil && user.lockUntil > Date.now();
};

// Static method to handle failed login attempt
userSchema.statics.handleFailedLogin = async function(userId, ip, userAgent) {
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOCK_TIME = 30 * 60 * 1000; // 30 minutes
  
  const user = await this.findById(userId);
  
  if (!user) {
    return;
  }
  
  // Add failed login attempt
  user.failedLoginAttempts.push({
    ip,
    userAgent,
    timestamp: Date.now()
  });
  
  // Increment login attempts
  user.loginAttempts += 1;
  
  // Lock account if max attempts reached
  if (user.loginAttempts >= MAX_LOGIN_ATTEMPTS) {
    user.lockUntil = Date.now() + LOCK_TIME;
    user.status = STATUS.SUSPENDED;
    
    // TODO: Send account locked email
  }
  
  await user.save({ validateBeforeSave: false });
};

// Static method to handle successful login
userSchema.statics.handleSuccessfulLogin = async function(userId, ip) {
  const user = await this.findByIdAndUpdate(
    userId,
    {
      $set: {
        lastLogin: Date.now(),
        lastLoginIp: ip,
        loginAttempts: 0,
        lockUntil: undefined,
        status: STATUS.ACTIVE
      },
      $push: {
        loginHistory: {
          ip,
          timestamp: Date.now()
        }
      }
    },
    { new: true, runValidators: false }
  );
  
  return user;
};

// Add text index for search
userSchema.index(
  { 
    email: 'text',
    firstName: 'text',
    lastName: 'text',
    'profile.bio': 'text'
  },
  {
    weights: {
      email: 10,
      firstName: 5,
      lastName: 5,
      'profile.bio': 1
    },
    name: 'user_search'
  }
);

const User = mongoose.model('User', userSchema);

module.exports = {
  User,
  USER_ROLES: ROLES,
  USER_STATUS: STATUS
};
