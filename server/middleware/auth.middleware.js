const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const { User } = require('../models/user.model');
const logger = require('../utils/logger');
const config = require('../config');

// Protect routes - user must be authenticated
const protect = async (req, res, next) => {
  try {
    // Development mode: Skip auth if NODE_ENV is development
    if (process.env.NODE_ENV === 'development') {
      req.user = {
        id: 'dev-user-123',
        name: 'Developer',
        email: 'dev@example.com',
        isAdmin: true
      };
      return next();
    }

    let token;
    
    // 1) Get token from header or cookies
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies && req.cookies.jwt) {
      token = req.cookies.jwt;
    }
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'You are not logged in! Please log in to get access.'
      });
    }
    
    // 2) Verify token
    const decoded = await promisify(jwt.verify)(token, config.jwt.secret);
    
    // 3) Check if user still exists
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: 'The user belonging to this token no longer exists.'
      });
    }
    
    // 4) Check if user changed password after the token was issued
    if (currentUser.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        success: false,
        message: 'User recently changed password! Please log in again.'
      });
    }
    
    // GRANT ACCESS TO PROTECTED ROUTE
    req.user = currentUser;
    res.locals.user = currentUser;
    
    next();
  } catch (error) {
    logger.error('Authentication error:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token. Please log in again!'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Your token has expired! Please log in again.'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Something went wrong with authentication',
      error: config.env === 'development' ? error.message : undefined
    });
  }
};

// Restrict to certain roles
const restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action'
      });
    }
    next();
  };
};

// Check if user is logged in (for frontend)
const isLoggedIn = async (req, res, next) => {
  try {
    if (req.cookies.jwt) {
      // 1) Verify token
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        config.jwt.secret
      );

      // 2) Check if user still exists
      const currentUser = await User.findById(decoded.id);
      if (!currentUser) {
        return next();
      }

      // 3) Check if user changed password after the token was issued
      if (currentUser.changedPasswordAfter(decoded.iat)) {
        return next();
      }

      // THERE IS A LOGGED IN USER
      res.locals.user = currentUser;
      return next();
    }
    next();
  } catch (err) {
    return next();
  }
};

// Check if user is authenticated (for API)
const isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }
  
  res.status(401).json({
    success: false,
    message: 'You need to be logged in to access this resource'
  });
};

// Check if user is the owner of the resource
const isOwner = (model, paramName = 'id') => {
  return async (req, res, next) => {
    try {
      const doc = await model.findById(req.params[paramName]);
      
      if (!doc) {
        return res.status(404).json({
          success: false,
          message: 'No document found with that ID'
        });
      }
      
      // Check if the user is the owner or an admin
      if (doc.owner.toString() !== req.user.id && req.user.role !== 'admin') {
        return res.status(403).json({
          success: false,
          message: 'You do not have permission to perform this action'
        });
      }
      
      // Add the document to the request object for later use
      req.doc = doc;
      next();
    } catch (error) {
      logger.error('Error in isOwner middleware:', error);
      res.status(500).json({
        success: false,
        message: 'Error checking ownership',
        error: config.env === 'development' ? error.message : undefined
      });
    }
  };
};

// Check if user has permission to access a resource
const hasPermission = (requiredPermission) => {
  return async (req, res, next) => {
    try {
      // Skip if no permission is required
      if (!requiredPermission) return next();
      
      // Allow admins to do anything
      if (req.user.role === 'admin') return next();
      
      // Check if the user is the owner
      if (req.doc && req.doc.owner.toString() === req.user.id) {
        return next();
      }
      
      // Check shared permissions if the model has sharedWith
      if (req.doc && req.doc.sharedWith) {
        const sharedAccess = req.doc.sharedWith.find(
          share => share.user.toString() === req.user.id
        );
        
        if (sharedAccess) {
          // Check permission level
          const permissionLevels = ['view', 'edit', 'manage'];
          const userLevel = permissionLevels.indexOf(sharedAccess.permission);
          const requiredLevel = permissionLevels.indexOf(requiredPermission);
          
          if (userLevel >= requiredLevel) {
            return next();
          }
        }
      }
      
      // If we get here, the user doesn't have permission
      res.status(403).json({
        success: false,
        message: 'You do not have permission to perform this action'
      });
    } catch (error) {
      logger.error('Error in hasPermission middleware:', error);
      res.status(500).json({
        success: false,
        message: 'Error checking permissions',
        error: config.env === 'development' ? error.message : undefined
      });
    }
  };
};

// Rate limiting middleware
const rateLimiter = (options = {}) => {
  const { windowMs = 15 * 60 * 1000, max = 100 } = options;
  const ipCache = new Map();
  
  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    
    // Initialize or update request count for this IP
    if (!ipCache.has(ip)) {
      ipCache.set(ip, { count: 1, firstRequest: now });
    } else {
      const entry = ipCache.get(ip);
      
      // Reset the window if it has passed
      if (now - entry.firstRequest > windowMs) {
        entry.count = 1;
        entry.firstRequest = now;
      } else {
        entry.count += 1;
      }
      
      // Check if rate limit is exceeded
      if (entry.count > max) {
        const retryAfter = Math.ceil((entry.firstRequest + windowMs - now) / 1000);
        
        res.set('Retry-After', retryAfter.toString());
        
        return res.status(429).json({
          success: false,
          message: 'Too many requests, please try again later',
          retryAfter
        });
      }
    }
    
    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': max,
      'X-RateLimit-Remaining': max - ipCache.get(ip).count,
      'X-RateLimit-Reset': Math.ceil((ipCache.get(ip).firstRequest + windowMs) / 1000)
    });
    
    next();
  };
};

// Clean up old rate limit entries
setInterval(() => {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15 minutes
  
  for (const [ip, entry] of ipCache.entries()) {
    if (now - entry.firstRequest > windowMs) {
      ipCache.delete(ip);
    }
  }
}, 5 * 60 * 1000); // Run every 5 minutes

module.exports = {
  protect,
  restrictTo,
  isLoggedIn,
  isAuthenticated,
  isOwner,
  hasPermission,
  rateLimiter
};
