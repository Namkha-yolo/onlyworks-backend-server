const jwt = require('jsonwebtoken');
const { ApiError } = require('./errorHandler');
const { logger } = require('../utils/logger');

// Real JWT authentication middleware
function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('AUTH_REQUIRED');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';

    // Verify JWT token
    const decoded = jwt.verify(token, jwtSecret);

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      name: decoded.name,
      avatar_url: decoded.avatar_url,
      provider: decoded.provider
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      logger.security('authentication_failed', {
        error: 'Invalid or expired token',
        tokenError: error.message,
        headers: req.headers
      });
      return next(new ApiError('AUTH_INVALID'));
    }

    if (error instanceof ApiError) {
      return next(error);
    }

    logger.security('authentication_failed', {
      error: error.message,
      headers: req.headers
    });

    next(new ApiError('AUTH_INVALID'));
  }
}

// Optional authentication middleware
// Allows requests to proceed without authentication but adds user info if present
function optionalAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';

    // Verify JWT token
    const decoded = jwt.verify(token, jwtSecret);

    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      name: decoded.name,
      avatar_url: decoded.avatar_url,
      provider: decoded.provider
    };

    next();
  } catch (error) {
    // For optional auth, continue even if token validation fails
    logger.debug('Optional auth failed, continuing without user', { error: error.message });
    next();
  }
}

// Role-based access control middleware
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError('AUTH_REQUIRED'));
    }

    if (req.user.role !== role) {
      return next(new ApiError('PERMISSION_DENIED', {
        required_role: role,
        user_role: req.user.role
      }));
    }

    next();
  };
}

module.exports = {
  authenticateUser,
  optionalAuth,
  requireRole
};