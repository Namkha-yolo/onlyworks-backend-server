/**
 * Supabase Error Handler Middleware
 * Catches and handles Supabase-specific errors, including deprecated method errors
 */

const { logger } = require('../utils/logger');

/**
 * Middleware to handle Supabase errors and provide meaningful responses
 * @param {Error} error - The error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function supabaseErrorHandler(error, req, res, next) {
  // Check if this is the specific deprecated method error
  if (error.message && error.message.includes('getUserByEmail is not a function')) {
    logger.error('Deprecated Supabase method detected', {
      error: error.message,
      stack: error.stack,
      endpoint: req.path,
      method: req.method
    });

    return res.status(500).json({
      success: false,
      error: {
        code: 'SUPABASE_COMPATIBILITY_ERROR',
        message: 'Authentication service is being updated. Please try again in a moment.',
        details: {
          originalError: 'Deprecated Supabase client method',
          suggestion: 'The backend server needs to be updated to use the latest Supabase client'
        }
      },
      timestamp: new Date().toISOString(),
      request_id: req.id || Date.now().toString()
    });
  }

  // Check for other Supabase auth errors
  if (error.message && error.message.includes('supabaseAdmin.auth.admin')) {
    logger.error('Supabase admin auth error', {
      error: error.message,
      endpoint: req.path,
      method: req.method
    });

    return res.status(500).json({
      success: false,
      error: {
        code: 'SUPABASE_AUTH_ERROR',
        message: 'Authentication service temporarily unavailable',
        details: {
          originalError: 'Supabase admin auth method error'
        }
      },
      timestamp: new Date().toISOString(),
      request_id: req.id || Date.now().toString()
    });
  }

  // Check for general Supabase errors
  if (error.message && (error.message.includes('supabase') || error.message.includes('Supabase'))) {
    logger.error('General Supabase error', {
      error: error.message,
      endpoint: req.path,
      method: req.method
    });

    return res.status(500).json({
      success: false,
      error: {
        code: 'DATABASE_ERROR',
        message: 'Database service temporarily unavailable',
        details: {
          originalError: 'Supabase client error'
        }
      },
      timestamp: new Date().toISOString(),
      request_id: req.id || Date.now().toString()
    });
  }

  // If it's not a Supabase error, pass to next error handler
  next(error);
}

/**
 * Express middleware wrapper for easier use
 */
function createSupabaseErrorMiddleware() {
  return supabaseErrorHandler;
}

module.exports = {
  supabaseErrorHandler,
  createSupabaseErrorMiddleware
};