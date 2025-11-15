const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const { requestLoggingMiddleware, logger } = require('./utils/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { supabaseErrorHandler } = require('./middleware/supabaseErrorHandler');
const { checkDatabaseConnection } = require('./config/database');

// Route imports
const authRoutes = require('./routes/authRoutes');
const desktopOAuthRoutes = require('./routes/desktopOAuthRoutes');
const userRoutes = require('./routes/userRoutes');
const onboardingRoutes = require('./routes/onboardingRoutes');
const workSessionRoutes = require('./routes/workSessionRoutes');
const screenshotRoutes = require('./routes/screenshotRoutes');
const enhancedScreenshotRoutes = require('./routes/enhancedScreenshotRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const goalRoutes = require('./routes/goalRoutes');
const teamRoutes = require('./routes/teamRoutes');
const reportRoutes = require('./routes/reportRoutes');
const analysisRoutes = require('./routes/analysisRoutes');
const backtestRoutes = require('./routes/backtestRoutes');
const batchProcessingRoutes = require('./routes/batchProcessingRoutes');
const userSessionRoutes = require('./routes/userSessionRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false, // Allow Vercel analytics
  crossOriginEmbedderPolicy: false
}));

// CORS configuration - allow Electron app and development
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like from Electron)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'https://onlyworks.dev',
      'https://app.onlyworks.dev',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ];

    // Allow all origins in development
    if (process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging middleware
app.use(requestLoggingMiddleware);

// Health check endpoint (simple version for compatibility)
app.get('/health', async (req, res) => {
  try {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
      service: 'onlyworks-backend'
    });
  } catch (error) {
    logger.error('Health check failed', { error: error.message });
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    });
  }
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/oauth', desktopOAuthRoutes); // Desktop OAuth routes
app.use('/api/users', userRoutes);
app.use('/api/onboarding', onboardingRoutes);
app.use('/api/sessions', workSessionRoutes);
app.use('/api/screenshots', screenshotRoutes);
app.use('/api/screenshots', enhancedScreenshotRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/goals', goalRoutes);
app.use('/api/teams', teamRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/backtest', backtestRoutes);
app.use('/api/batch', batchProcessingRoutes);
app.use('/api/user-session', userSessionRoutes);
app.use('/api/analytics', analyticsRoutes);

// Root health check routes (for monitoring/load balancers)
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'onlyworks-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.head('/', (req, res) => {
  res.status(200).end();
});

// Catch 404 and forward to error handler
app.use(notFoundHandler);

// Supabase-specific error handler (must be before global error handler)
app.use(supabaseErrorHandler);

// Global error handler
app.use(errorHandler);

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at Promise', {
    reason: reason.toString(),
    stack: reason.stack
  });
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

module.exports = app;