const ScreenshotRepository = require('../repositories/ScreenshotRepository');
const ScreenshotAnalysisRepository = require('../repositories/ScreenshotAnalysisRepository');
const AIAnalysisService = require('../services/AIAnalysisService');
const { asyncHandler, validateRequired } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class ScreenshotController {
  constructor() {
    this.screenshotRepository = new ScreenshotRepository();
    this.analysisRepository = new ScreenshotAnalysisRepository();
    this.aiService = new AIAnalysisService();
  }

  // Upload screenshot metadata
  uploadScreenshot = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { sessionId } = req.params;
    const screenshotData = req.body;

    logger.info('Uploading screenshot metadata', { userId, sessionId, screenshotData });

    // Validate required fields
    validateRequired(screenshotData, ['file_storage_key', 'file_size_bytes']);

    const screenshot = await this.screenshotRepository.createScreenshot(userId, sessionId, {
      ...screenshotData,
      timestamp: screenshotData.timestamp || new Date().toISOString()
    });

    // Queue for AI analysis
    this.queueForAnalysis(screenshot.id, screenshot.file_storage_key);

    res.status(201).json({
      success: true,
      data: screenshot,
      message: 'Screenshot uploaded successfully'
    });
  });

  // Get screenshots for a session
  getSessionScreenshots = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { sessionId } = req.params;

    const screenshots = await this.screenshotRepository.findBySession(sessionId, userId);

    res.json({
      success: true,
      data: screenshots
    });
  });

  // Get screenshot analysis
  getScreenshotAnalysis = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { screenshotId } = req.params;

    const analysis = await this.analysisRepository.findByScreenshotId(screenshotId, userId);

    res.json({
      success: true,
      data: analysis
    });
  });

  // Trigger AI analysis for a screenshot
  analyzeScreenshot = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { screenshotId } = req.params;

    logger.info('Triggering AI analysis for screenshot', { userId, screenshotId });

    // Get screenshot info
    const screenshot = await this.screenshotRepository.findById(screenshotId, userId);

    if (!screenshot) {
      return res.status(404).json({
        success: false,
        error: { message: 'Screenshot not found' }
      });
    }

    // Check if already analyzed
    const existingAnalysis = await this.analysisRepository.findByScreenshotId(screenshotId, userId);
    if (existingAnalysis) {
      return res.json({
        success: true,
        data: existingAnalysis,
        message: 'Screenshot already analyzed'
      });
    }

    try {
      // Perform AI analysis
      const analysisResult = await this.aiService.analyzeScreenshot(screenshot.file_storage_key, {
        window_title: screenshot.window_title,
        active_app: screenshot.active_app,
        timestamp: screenshot.timestamp
      });

      // Store analysis results
      const analysis = await this.analysisRepository.createAnalysis(screenshotId, userId, analysisResult);

      // Mark screenshot as analyzed
      await this.screenshotRepository.markAnalysisCompleted(screenshotId, userId);

      logger.business('screenshot_analyzed', {
        user_id: userId,
        screenshot_id: screenshotId,
        activity_detected: analysisResult.activity_detected,
        productivity_score: analysisResult.productivity_score
      });

      res.json({
        success: true,
        data: analysis,
        message: 'Screenshot analyzed successfully'
      });

    } catch (error) {
      logger.error('Screenshot analysis failed', {
        error: error.message,
        userId,
        screenshotId
      });

      res.status(500).json({
        success: false,
        error: {
          message: 'AI analysis failed',
          details: error.message
        }
      });
    }
  });

  // Get productivity analytics
  getProductivityAnalytics = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { date_from, date_to } = req.query;

    logger.info('Getting productivity analytics', { userId, date_from, date_to });

    const stats = await this.analysisRepository.getProductivityStats(userId, date_from, date_to);

    // Get trend analysis if we have enough data
    let trendAnalysis = null;
    if (stats.totalAnalyses > 5) {
      const recentAnalyses = await this.analysisRepository.findByDateRange(userId, date_from, date_to);
      trendAnalysis = await this.aiService.analyzeProductivityTrends(recentAnalyses);
    }

    res.json({
      success: true,
      data: {
        stats,
        trends: trendAnalysis
      }
    });
  });

  // Get hourly productivity breakdown
  getHourlyProductivity = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { date_from, date_to } = req.query;

    const hourlyData = await this.analysisRepository.getHourlyProductivity(userId, date_from, date_to);

    res.json({
      success: true,
      data: hourlyData
    });
  });

  // Helper method to queue screenshot for analysis
  async queueForAnalysis(screenshotId, storageKey) {
    try {
      // In a production system, you'd queue this for background processing
      // For now, we'll just log that it should be analyzed
      logger.info('Queuing screenshot for AI analysis', { screenshotId, storageKey });

      // You could implement a job queue here using services like:
      // - Bull Queue (Redis-based)
      // - AWS SQS
      // - Google Cloud Tasks
      // - Or a simple database-based queue

    } catch (error) {
      logger.error('Failed to queue screenshot for analysis', {
        error: error.message,
        screenshotId
      });
    }
  }
}

module.exports = ScreenshotController;