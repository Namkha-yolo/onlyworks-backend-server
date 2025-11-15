const express = require('express');
const AIAnalysisService = require('../services/AIAnalysisService');
const { authenticateUser } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();
const aiService = new AIAnalysisService();

// Apply authentication to all AI routes
router.use(authenticateUser);

/**
 * POST /api/ai/analyze
 * Analyze screenshots or session data using AI
 */
router.post('/analyze', asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { screenshots, session_id, metadata } = req.body;

  logger.info('AI analysis request received', {
    userId,
    session_id,
    screenshot_count: screenshots?.length || 0,
    has_metadata: !!metadata
  });

  // Validate required fields
  if (!screenshots || !Array.isArray(screenshots) || screenshots.length === 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'screenshots array is required and must not be empty'
      }
    });
  }

  try {
    const analysisResults = [];

    // Analyze each screenshot
    for (const screenshot of screenshots) {
      const { file_storage_key, ...screenshotMetadata } = screenshot;

      const result = await aiService.analyzeScreenshot(file_storage_key, {
        ...screenshotMetadata,
        ...metadata,
        user_id: userId,
        session_id
      });

      analysisResults.push({
        screenshot_id: screenshot.id || screenshot.screenshot_id,
        file_storage_key,
        analysis: result
      });
    }

    logger.info('AI analysis completed', {
      userId,
      session_id,
      analyzed_count: analysisResults.length
    });

    res.json({
      success: true,
      data: {
        session_id,
        analyses: analysisResults,
        total_analyzed: analysisResults.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('AI analysis failed', {
      userId,
      session_id,
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'AI_SERVICE_ERROR',
        message: 'Failed to analyze screenshots',
        details: error.message
      }
    });
  }
}));

/**
 * POST /api/ai/batch-analyze
 * Batch analyze multiple screenshots more efficiently
 */
router.post('/batch-analyze', asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { session_id, screenshots, batch_metadata } = req.body;

  logger.info('Batch AI analysis request', {
    userId,
    session_id,
    screenshot_count: screenshots?.length || 0
  });

  if (!screenshots || !Array.isArray(screenshots)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'screenshots array is required'
      }
    });
  }

  try {
    const batchAnalysis = await aiService.analyzeBatch?.(screenshots, {
      user_id: userId,
      session_id,
      ...batch_metadata
    });

    res.json({
      success: true,
      data: batchAnalysis || {
        message: 'Batch analysis queued',
        session_id,
        screenshot_count: screenshots.length
      }
    });
  } catch (error) {
    logger.error('Batch AI analysis failed', {
      userId,
      session_id,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: {
        code: 'AI_SERVICE_ERROR',
        message: 'Batch analysis failed',
        details: error.message
      }
    });
  }
}));

/**
 * GET /api/ai/health
 * Check AI service health
 */
router.get('/health', asyncHandler(async (req, res) => {
  const isConfigured = !!process.env.GOOGLE_AI_API_KEY;

  res.json({
    success: true,
    service: 'AI Analysis Service',
    status: isConfigured ? 'operational' : 'mock_mode',
    configured: isConfigured,
    model: isConfigured ? 'gemini-1.5-flash' : 'mock',
    timestamp: new Date().toISOString()
  });
}));

module.exports = router;
