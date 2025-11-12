const express = require('express');
const AIAnalysisBacktestService = require('../services/AIAnalysisBacktestService');
const { authenticateUser } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

// Create singleton backtest service instance
const backtestService = new AIAnalysisBacktestService();

/**
 * POST /api/backtest/run
 * Run comprehensive AI analysis backtest
 */
router.post('/run', authenticateUser, asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const backtestOptions = req.body;

  logger.info('Starting AI analysis backtest', {
    userId,
    options: backtestOptions
  });

  const result = await backtestService.runBacktest(backtestOptions);

  if (result.success) {
    logger.business('backtest_completed', {
      user_id: userId,
      backtest_id: result.data.backtest_id,
      total_tests: result.data.test_configuration.sample_size,
      overall_accuracy: result.data.overall_metrics.average_accuracy
    });

    res.json({
      success: true,
      data: result.data,
      message: 'Backtest completed successfully'
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
}));

/**
 * GET /api/backtest/results/:backtestId
 * Get specific backtest results
 */
router.get('/results/:backtestId', authenticateUser, asyncHandler(async (req, res) => {
  const { backtestId } = req.params;
  const { userId } = req.user;

  logger.info('Retrieving backtest results', { userId, backtestId });

  const result = await backtestService.getBacktestResults(backtestId);

  if (result.success) {
    res.json({
      success: true,
      data: result.data
    });
  } else {
    res.status(404).json({
      success: false,
      error: {
        code: 'BACKTEST_NOT_FOUND',
        message: 'Backtest results not found'
      }
    });
  }
}));

/**
 * GET /api/backtest/list
 * List all backtest runs
 */
router.get('/list', authenticateUser, asyncHandler(async (req, res) => {
  const { userId } = req.user;

  logger.info('Listing backtests', { userId });

  const result = await backtestService.listBacktests();

  res.json({
    success: true,
    data: result.data
  });
}));

/**
 * GET /api/backtest/metrics
 * Get overall performance metrics
 */
router.get('/metrics', authenticateUser, asyncHandler(async (req, res) => {
  const { userId } = req.user;

  logger.info('Retrieving performance metrics', { userId });

  const result = await backtestService.getPerformanceMetrics();

  res.json({
    success: true,
    data: result.data
  });
}));

/**
 * POST /api/backtest/validate-real-time
 * Run quick real-time validation test
 */
router.post('/validate-real-time', authenticateUser, asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { sampleSize = 5 } = req.body;

  logger.info('Running real-time validation', { userId, sampleSize });

  try {
    // Run a small quick validation test
    const quickTest = await backtestService.runBacktest({
      testSampleSize: sampleSize,
      models: ['gemini-1.5-flash'],
      enableRealTimeValidation: true
    });

    if (quickTest.success) {
      res.json({
        success: true,
        data: {
          validation_id: quickTest.data.backtest_id,
          real_time_results: quickTest.data.real_time_validation,
          quick_metrics: {
            accuracy: quickTest.data.overall_metrics.average_accuracy,
            latency: quickTest.data.overall_metrics.average_latency,
            confidence: quickTest.data.model_results['gemini-1.5-flash'].performance_metrics.average_confidence
          }
        },
        message: 'Real-time validation completed'
      });
    } else {
      throw new Error(quickTest.error.message);
    }

  } catch (error) {
    logger.error('Real-time validation failed', { userId, error: error.message });
    res.status(500).json({
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Real-time validation failed',
        details: error.message
      }
    });
  }
}));

/**
 * GET /api/backtest/health
 * Health check for backtesting service
 */
router.get('/health', asyncHandler(async (req, res) => {
  try {
    const healthStatus = {
      service_status: 'operational',
      ai_service_available: backtestService.model !== null,
      backtest_service_ready: true,
      total_backtests_run: backtestService.backtestResults.size,
      last_check: new Date().toISOString()
    };

    res.json({
      success: true,
      data: healthStatus
    });

  } catch (error) {
    res.status(503).json({
      success: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Backtest service health check failed'
      }
    });
  }
}));

module.exports = router;