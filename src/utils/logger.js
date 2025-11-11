// Structured logging utility for OnlyWorks backend

const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const currentLogLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

// Generate unique request ID for tracing
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Base logger function
function log(level, message, context = {}) {
  if (LOG_LEVELS[level] > currentLogLevel) {
    return; // Skip logging if level is too verbose
  }

  const logEntry = {
    timestamp: new Date().toISOString(),
    level: level.toLowerCase(),
    message,
    service: 'onlyworks-backend',
    environment: process.env.NODE_ENV || 'development',
    ...context
  };

  // Add request context if available
  if (context.req) {
    logEntry.requestId = context.req.requestId;
    logEntry.userId = context.req.userId;
    logEntry.endpoint = `${context.req.method} ${context.req.url}`;
    logEntry.userAgent = context.req.headers?.['user-agent'];
    logEntry.ip = context.req.headers?.['x-forwarded-for'] || context.req.connection?.remoteAddress;
  }

  // Remove req object from context to avoid circular references
  const { req, ...cleanContext } = context;
  const finalLogEntry = { ...logEntry, ...cleanContext };

  // Additional safety check to prevent circular references
  try {
    JSON.stringify(finalLogEntry);
  } catch (err) {
    // If we still have circular references, log without the problematic context
    const safeLogEntry = {
      timestamp: logEntry.timestamp,
      level: logEntry.level,
      message: logEntry.message,
      service: logEntry.service,
      environment: logEntry.environment,
      requestId: logEntry.requestId,
      userId: logEntry.userId,
      endpoint: logEntry.endpoint,
      userAgent: logEntry.userAgent,
      ip: logEntry.ip
    };
    console.log(JSON.stringify(safeLogEntry));
    return;
  }

  // Output to console (Vercel will capture this)
  console.log(JSON.stringify(finalLogEntry));

  // In production, you might want to send to external logging service
  if (process.env.NODE_ENV === 'production' && level === 'ERROR') {
    // TODO: Send to error tracking service like Sentry
  }
}

// Convenience methods
const logger = {
  error: (message, context = {}) => log('ERROR', message, context),
  warn: (message, context = {}) => log('WARN', message, context),
  info: (message, context = {}) => log('INFO', message, context),
  debug: (message, context = {}) => log('DEBUG', message, context),

  // Performance logging
  performance: (operation, duration, context = {}) => {
    log('INFO', `Performance: ${operation}`, {
      ...context,
      operation,
      duration_ms: duration,
      performance: true
    });
  },

  // API request logging
  request: (req, res, duration) => {
    const statusCode = res.statusCode;
    const level = statusCode >= 400 ? 'WARN' : 'INFO';

    log(level, `${req.method} ${req.url} - ${statusCode}`, {
      req,
      statusCode,
      duration_ms: duration,
      requestType: 'api'
    });
  },

  // Database operation logging
  database: (operation, table, duration, context = {}) => {
    log('DEBUG', `Database: ${operation} on ${table}`, {
      ...context,
      operation,
      table,
      duration_ms: duration,
      type: 'database'
    });
  },

  // AI service logging
  ai: (operation, model, duration, tokenCount, context = {}) => {
    log('INFO', `AI: ${operation} with ${model}`, {
      ...context,
      operation,
      model,
      duration_ms: duration,
      token_count: tokenCount,
      type: 'ai_service'
    });
  },

  // Business logic logging
  business: (event, details, context = {}) => {
    log('INFO', `Business Event: ${event}`, {
      ...context,
      event,
      details,
      type: 'business'
    });
  },

  // Security logging
  security: (event, details, context = {}) => {
    log('WARN', `Security Event: ${event}`, {
      ...context,
      event,
      details,
      type: 'security'
    });
  }
};

// Middleware to add request ID and logging context
function requestLoggingMiddleware(req, res, next) {
  const startTime = Date.now();
  req.requestId = generateRequestId();
  req.startTime = startTime;

  // Log request start
  logger.debug('Request started', { req });

  // Override res.end to log request completion
  const originalEnd = res.end;
  res.end = function(...args) {
    const duration = Date.now() - startTime;
    logger.request(req, res, duration);
    originalEnd.apply(this, args);
  };

  next?.();
}

// Error logging helper
function logError(error, context = {}) {
  const errorInfo = {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...context
  };

  logger.error('Unhandled error occurred', errorInfo);
  return errorInfo;
}

module.exports = {
  logger,
  requestLoggingMiddleware,
  logError,
  generateRequestId,
  LOG_LEVELS
};