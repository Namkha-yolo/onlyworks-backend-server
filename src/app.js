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
const aiRoutes = require('./routes/aiRoutes');
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
app.use('/api/ai', aiRoutes);
app.use('/api/backtest', backtestRoutes);
app.use('/api/batch', batchProcessingRoutes);
app.use('/api/user-session', userSessionRoutes);
app.use('/api/analytics', analyticsRoutes);

// Backward compatibility endpoint for desktop app
// Desktop app expects POST /api/analyze
app.post('/api/analyze', async (req, res) => {
  try {
    const { imageData, analysisType = 'full' } = req.body;

    if (!imageData) {
      return res.status(400).json({
        success: false,
        error: 'imageData is required'
      });
    }

    // Simple mock response for now - can be enhanced later
    const mockAnalysis = {
      success: true,
      analysisType,
      results: {
        productivity_score: Math.floor(Math.random() * 100),
        activity_classification: 'productive',
        detected_applications: ['Code Editor', 'Browser'],
        focus_level: 'high',
        timestamp: new Date().toISOString()
      },
      message: 'Analysis completed successfully'
    };

    logger.info('Desktop analyze request processed', { analysisType });
    res.json(mockAnalysis);
  } catch (error) {
    logger.error('Desktop analyze error:', error);
    res.status(500).json({
      success: false,
      error: 'Analysis failed',
      details: error.message
    });
  }
});

// Debug endpoints for frontend connectivity testing
app.get('/api/test/connectivity', (req, res) => {
  res.json({
    success: true,
    message: 'Backend connectivity OK',
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

app.get('/api/test/auth', async (req, res) => {
  const authHeader = req.headers.authorization;
  res.json({
    success: true,
    message: 'Auth test endpoint',
    has_auth_header: !!authHeader,
    auth_header_preview: authHeader ? authHeader.substring(0, 20) + '...' : null,
    auth_header_full_length: authHeader ? authHeader.length : 0,
    timestamp: new Date().toISOString()
  });
});

// Also add a no-auth version of the session stats for testing
app.get('/api/test/session-stats', async (req, res) => {
  res.json({
    success: true,
    data: {
      total_time_minutes: 120,
      total_sessions: 5,
      average_focus: 75
    },
    message: 'Mock session stats for testing'
  });
});

// Emergency test upload endpoint (no auth required for testing)
app.post('/api/test/upload', upload.single('screenshot'), async (req, res) => {
  try {
    const ScreenshotRepository = require('./repositories/ScreenshotRepository');
    const FileStorageService = require('./services/FileStorageService');

    const screenshotRepository = new ScreenshotRepository();
    const fileStorage = new FileStorageService();

    const { sessionId, ...screenshotData } = req.body;
    const uploadedFile = req.file;

    console.log('🧪 TEST UPLOAD - File received:', uploadedFile?.originalname);
    console.log('🧪 TEST UPLOAD - Metadata:', screenshotData);

    if (!uploadedFile) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    // Use test user ID for testing
    const testUserId = 'test-user-emergency-123';
    const testSessionId = sessionId || 'test-session-emergency-123';

    // Generate unique filename for JPEG
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const fileExtension = uploadedFile.mimetype === 'image/jpeg' ? 'jpg' : 'jpg'; // Default to JPEG
    const fileName = `test_emergency_${timestamp}_${randomId}.${fileExtension}`;

    // Upload file to storage
    const uploadResult = await fileStorage.uploadFile(
      uploadedFile.buffer,
      fileName,
      {
        contentType: uploadedFile.mimetype,
        userId: testUserId,
        sessionId: testSessionId
      }
    );

    if (!uploadResult.success) {
      return res.status(500).json({
        success: false,
        error: 'File upload failed: ' + uploadResult.error
      });
    }

    // Create screenshot record with emergency fixes
    const finalScreenshotData = {
      ...screenshotData,
      file_storage_key: uploadResult.data.path,
      file_size_bytes: uploadedFile.size,
      public_url: uploadResult.data.publicUrl,
      action_type: screenshotData.action_type || 'emergency_test',
      timestamp: screenshotData.timestamp || new Date().toISOString()
    };

    console.log('🧪 TEST UPLOAD - Creating screenshot record with data:', finalScreenshotData);

    const screenshot = await screenshotRepository.createScreenshot(testUserId, testSessionId, finalScreenshotData);

    console.log('🧪 TEST UPLOAD - Screenshot created successfully:', screenshot.id);

    res.status(201).json({
      success: true,
      data: screenshot,
      message: 'Emergency test upload successful',
      fileInfo: {
        originalName: uploadedFile.originalname,
        size: uploadedFile.size,
        storageKey: uploadResult.data.path
      }
    });

  } catch (error) {
    console.error('🧪 TEST UPLOAD - Error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: 'Emergency test upload failed'
    });
  }
});

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