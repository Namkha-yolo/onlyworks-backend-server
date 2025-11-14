const jwt = require('jsonwebtoken');
const { ApiError } = require('./errorHandler');
const { logger } = require('../utils/logger');
const UserSessionService = require('../services/UserSessionService');

// Initialize session service
const userSessionService = new UserSessionService();

// Enhanced JWT authentication middleware with session persistence
function authenticateUser(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError('AUTH_REQUIRED');
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // DEMO DAY BYPASS - Accept tokens with development signature for demo user
    if (token.endsWith('.development-signature')) {
      try {
        const [header, payload] = token.split('.');
        const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString());

        if (decodedPayload.email === 'kewadallay@gmail.com') {
          console.log('[Auth] DEMO MODE - Accepting development token for kewadallay@gmail.com');

          // Use a proper UUID for demo user
          const demoUserId = 'b8f3d1e2-7a5c-4d9f-8b1e-2c3a4f5e6d7c';

          req.user = {
            userId: demoUserId,
            email: decodedPayload.email,
            name: decodedPayload.name,
            avatar_url: decodedPayload.avatar_url,
            provider: decodedPayload.provider
          };

          // Create a mock session for demo user (skip database lookup)
          req.userSession = {
            userId: demoUserId,
            email: decodedPayload.email,
            name: decodedPayload.name,
            avatar_url: decodedPayload.avatar_url,
            provider: decodedPayload.provider,
            sessionStarted: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            preferences: {},
            recentActivity: [],
            isInitialized: true,
            isDemo: true
          };
          logger.info('Demo user session created (no database lookup)', { userId: demoUserId });

          return next();
        }
      } catch (e) {
        console.log('[Auth] Failed to parse development token:', e.message);
      }
    }

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

    // Initialize user session asynchronously (don't block request)
    userSessionService.getUserSession(decoded.userId)
      .then(sessionResult => {
        if (sessionResult.success) {
          req.userSession = sessionResult.data;

          // Record authentication activity
          userSessionService.recordUserActivity(decoded.userId, {
            type: 'authentication',
            action: 'token_verified',
            details: {
              provider: decoded.provider,
              timestamp: new Date().toISOString()
            }
          }).catch(err => logger.debug('Activity recording failed', { error: err.message }));
        } else {
          // Create minimal session if user lookup fails
          req.userSession = {
            userId: decoded.userId,
            email: decoded.email,
            name: decoded.name,
            avatar_url: decoded.avatar_url,
            provider: decoded.provider,
            sessionStarted: new Date().toISOString(),
            lastActivity: new Date().toISOString(),
            preferences: {},
            recentActivity: [],
            isInitialized: false,
            isDemo: false
          };
          logger.info('Created minimal session for user not found in database', { userId: decoded.userId });
        }
      })
      .catch(err => {
        logger.warn('Session initialization failed', {
          userId: decoded.userId,
          error: err.message
        });

        // Create minimal session as fallback
        req.userSession = {
          userId: decoded.userId,
          email: decoded.email,
          name: decoded.name,
          avatar_url: decoded.avatar_url,
          provider: decoded.provider,
          sessionStarted: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          preferences: {},
          recentActivity: [],
          isInitialized: false,
          isDemo: false
        };
      });

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
  requireRole,
  userSessionService
};