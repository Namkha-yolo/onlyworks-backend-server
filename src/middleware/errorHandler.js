const { logger, logError } = require('../utils/logger');

// Standard error codes and messages
const ERROR_CODES = {
  // Authentication & Authorization
  AUTH_REQUIRED: {
    code: 'AUTH_REQUIRED',
    message: 'Authentication required',
    statusCode: 401
  },
  AUTH_INVALID: {
    code: 'AUTH_INVALID',
    message: 'Invalid authentication credentials',
    statusCode: 401
  },
  AUTH_EXPIRED: {
    code: 'AUTH_EXPIRED',
    message: 'Authentication token has expired',
    statusCode: 401
  },
  PERMISSION_DENIED: {
    code: 'PERMISSION_DENIED',
    message: 'Insufficient permissions for this operation',
    statusCode: 403
  },

  // Validation Errors
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    statusCode: 400
  },
  MISSING_REQUIRED_FIELD: {
    code: 'MISSING_REQUIRED_FIELD',
    message: 'Required field is missing',
    statusCode: 400
  },
  INVALID_FILE_TYPE: {
    code: 'INVALID_FILE_TYPE',
    message: 'Invalid file type or format',
    statusCode: 400
  },
  FILE_TOO_LARGE: {
    code: 'FILE_TOO_LARGE',
    message: 'File size exceeds maximum limit',
    statusCode: 400
  },

  // Resource Errors
  RESOURCE_NOT_FOUND: {
    code: 'RESOURCE_NOT_FOUND',
    message: 'Requested resource was not found',
    statusCode: 404
  },
  RESOURCE_CONFLICT: {
    code: 'RESOURCE_CONFLICT',
    message: 'Resource conflict occurred',
    statusCode: 409
  },
  RESOURCE_LOCKED: {
    code: 'RESOURCE_LOCKED',
    message: 'Resource is currently locked',
    statusCode: 423
  },

  // Rate Limiting
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Rate limit exceeded, please try again later',
    statusCode: 429
  },
  QUOTA_EXCEEDED: {
    code: 'QUOTA_EXCEEDED',
    message: 'Account quota exceeded',
    statusCode: 429
  },

  // External Service Errors
  AI_SERVICE_ERROR: {
    code: 'AI_SERVICE_ERROR',
    message: 'AI analysis service is temporarily unavailable',
    statusCode: 503
  },
  STORAGE_SERVICE_ERROR: {
    code: 'STORAGE_SERVICE_ERROR',
    message: 'File storage service is temporarily unavailable',
    statusCode: 503
  },
  DATABASE_ERROR: {
    code: 'DATABASE_ERROR',
    message: 'Database operation failed',
    statusCode: 503
  },

  // Generic Errors
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    message: 'An internal server error occurred',
    statusCode: 500
  },
  SERVICE_UNAVAILABLE: {
    code: 'SERVICE_UNAVAILABLE',
    message: 'Service is temporarily unavailable',
    statusCode: 503
  }
};

// Custom error class
class ApiError extends Error {
  constructor(errorCode, details = null, originalError = null) {
    const errorDef = ERROR_CODES[errorCode] || ERROR_CODES.INTERNAL_ERROR;

    super(errorDef.message);

    this.name = 'ApiError';
    this.code = errorDef.code;
    this.statusCode = errorDef.statusCode;
    this.details = details;
    this.originalError = originalError;
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp
      }
    };
  }
}

// Validation helper
function validateRequired(obj, requiredFields) {
  const missing = requiredFields.filter(field =>
    obj[field] === undefined || obj[field] === null || obj[field] === ''
  );

  if (missing.length > 0) {
    throw new ApiError('MISSING_REQUIRED_FIELD', {
      missing_fields: missing
    });
  }
}

// File validation helper
function validateFile(file, options = {}) {
  const {
    maxSize = 10 * 1024 * 1024, // 10MB default
    allowedTypes = ['image/png', 'image/jpeg'],
    allowedExtensions = ['.png', '.jpg', '.jpeg']
  } = options;

  if (!file) {
    throw new ApiError('MISSING_REQUIRED_FIELD', {
      field: 'file',
      reason: 'No file provided'
    });
  }

  if (file.size > maxSize) {
    throw new ApiError('FILE_TOO_LARGE', {
      file_size: file.size,
      max_size: maxSize,
      file_name: file.name
    });
  }

  if (allowedTypes.length > 0 && !allowedTypes.includes(file.type)) {
    throw new ApiError('INVALID_FILE_TYPE', {
      file_type: file.type,
      allowed_types: allowedTypes,
      file_name: file.name
    });
  }

  return true;
}

// Main error handling middleware
function errorHandler(error, req, res, next) {
  // Add request context to error
  const context = {
    req,
    timestamp: new Date().toISOString(),
    requestId: req?.requestId
  };

  // Handle different error types
  let apiError;

  if (error instanceof ApiError) {
    // Already a properly formatted API error
    apiError = error;
  } else if (error.name === 'ValidationError') {
    // Database validation error
    apiError = new ApiError('VALIDATION_ERROR', {
      validation_errors: error.details || error.message
    }, error);
  } else if (error.code === 'PGRST116' || error.message?.includes('not found')) {
    // Supabase/PostgREST not found error
    apiError = new ApiError('RESOURCE_NOT_FOUND', null, error);
  } else if (error.code === 'PGRST204' || error.message?.includes('conflict')) {
    // Supabase/PostgREST conflict error
    apiError = new ApiError('RESOURCE_CONFLICT', null, error);
  } else if (error.name === 'TypeError' && error.message?.includes('fetch')) {
    // Network/service error
    apiError = new ApiError('SERVICE_UNAVAILABLE', {
      service: 'external_api'
    }, error);
  } else {
    // Generic server error
    apiError = new ApiError('INTERNAL_ERROR', {
      original_message: error.message
    }, error);
  }

  // Log the error
  const logData = logError(error, {
    ...context,
    api_error_code: apiError.code,
    status_code: apiError.statusCode
  });

  // Prepare response
  const response = apiError.toJSON();

  // Add request ID to response for debugging
  if (req?.requestId) {
    response.error.request_id = req.requestId;
  }

  // Send error response
  if (res && !res.headersSent) {
    res.status(apiError.statusCode).json(response);
  }

  // Don't call next() - error handling is complete
}

// Async error wrapper
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Not found handler (should be last middleware)
function notFoundHandler(req, res, next) {
  const error = new ApiError('RESOURCE_NOT_FOUND', {
    endpoint: `${req.method} ${req.originalUrl}`
  });

  errorHandler(error, req, res, next);
}

module.exports = {
  ApiError,
  ERROR_CODES,
  errorHandler,
  asyncHandler,
  notFoundHandler,
  validateRequired,
  validateFile
};