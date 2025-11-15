const ScreenshotRepository = require('../repositories/ScreenshotRepository');
const ScreenshotAnalysisRepository = require('../repositories/ScreenshotAnalysisRepository');
const AIAnalysisService = require('../services/AIAnalysisService');
const FileStorageService = require('../services/FileStorageService');
const { asyncHandler, validateRequired } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class ScreenshotController {
  constructor() {
    this.screenshotRepository = new ScreenshotRepository();
    this.analysisRepository = new ScreenshotAnalysisRepository();
    this.aiService = new AIAnalysisService();
    this.fileStorage = new FileStorageService();
  }

  // Upload screenshot with optional file
  uploadScreenshot = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { sessionId, ...screenshotData } = req.body;
    const uploadedFile = req.file;

    logger.info('Uploading screenshot', {
      userId,
      sessionId,
      hasFile: !!uploadedFile,
      fileSize: uploadedFile?.size,
      metadata: screenshotData
    });

    let finalScreenshotData = { ...screenshotData };

    // Handle file upload if present
    if (uploadedFile) {
      // Generate unique filename to prevent conflicts - prefer JPEG for efficiency
      const timestamp = Date.now();
      const randomId = Math.random().toString(36).substring(2, 8);
      const fileExtension = uploadedFile.mimetype === 'image/jpeg' ? 'jpg' :
                           uploadedFile.mimetype === 'image/png' ? 'png' : 'jpg';
      const fileName = `screenshot_${timestamp}_${randomId}.${fileExtension}`;

      const uploadResult = await this.fileStorage.uploadFile(
        uploadedFile.buffer,
        fileName,
        {
          contentType: uploadedFile.mimetype,
          userId,
          sessionId
        }
      );

      if (!uploadResult.success) {
        return res.status(500).json({
          success: false,
          error: uploadResult.error
        });
      }

      // Use upload result data and add required database fields
      finalScreenshotData = {
        ...finalScreenshotData,
        file_storage_key: uploadResult.data.path,
        file_size_bytes: uploadedFile.size,
        file_size: uploadedFile.size, // Map to both columns
        public_url: uploadResult.data.publicUrl,
        filename: fileName,
        file_path: uploadResult.data.path, // Use storage path as file_path
        storage_path: uploadResult.data.path,
        file_type: uploadedFile.mimetype
      };
    } else {
      // Validate required fields for metadata-only uploads
      validateRequired(req.body, ['sessionId', 'file_storage_key', 'file_size_bytes']);
    }

    // Validate sessionId is present
    validateRequired(req.body, ['sessionId']);

    // Retry logic for database conflicts
    const maxRetries = 3;
    let screenshot;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Add unique timestamp and attempt suffix to prevent conflicts
        const uniqueData = {
          ...finalScreenshotData,
          timestamp: finalScreenshotData.timestamp || new Date().toISOString(),
        };

        // If retrying, modify the file storage key to be unique
        if (attempt > 1 && uniqueData.file_storage_key) {
          const parts = uniqueData.file_storage_key.split('.');
          if (parts.length > 1) {
            parts[parts.length - 2] += `_retry${attempt}`;
            uniqueData.file_storage_key = parts.join('.');
          } else {
            uniqueData.file_storage_key += `_retry${attempt}`;
          }
        }

        screenshot = await this.screenshotRepository.createScreenshot(userId, sessionId, uniqueData);

        if (attempt > 1) {
          logger.info(`Screenshot upload succeeded on retry ${attempt}`, { userId, sessionId });
        }
        break; // Success, exit retry loop

      } catch (error) {
        lastError = error;
        logger.warn(`Screenshot upload attempt ${attempt} failed`, {
          userId,
          sessionId,
          error: error.message,
          code: error.code
        });

        // If it's a conflict error and we have retries left, continue
        if ((error.code === '23505' || error.message.includes('duplicate') || error.message.includes('conflict')) && attempt < maxRetries) {
          const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000); // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // If not a conflict or no retries left, throw the error
        throw error;
      }
    }

    if (!screenshot) {
      throw new Error(`Failed to upload screenshot after ${maxRetries} attempts: ${lastError?.message}`);
    }

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
      logger.info('Queuing screenshot for AI analysis', { screenshotId, storageKey });

      // Trigger immediate individual analysis for each screenshot
      // This ensures analysis happens even when batch threshold isn't reached
      try {
        const screenshot = await this.screenshotRepository.findById(screenshotId);
        if (screenshot && storageKey) {
          const analysisResult = await this.aiService.analyzeScreenshot(storageKey, {
            window_title: screenshot.metadata?.window_title,
            active_app: screenshot.metadata?.active_app || screenshot.active_app,
            timestamp: screenshot.timestamp
          });

          // Store individual analysis results
          if (analysisResult) {
            await this.analysisRepository.createAnalysis(screenshotId, screenshot.user_id, analysisResult);

            logger.info('Screenshot analyzed successfully', {
              screenshotId,
              activityDetected: analysisResult.activity_detected,
              productivityScore: analysisResult.productivity_score
            });
          }
        }
      } catch (analysisError) {
        logger.warn('Individual screenshot analysis failed, will be included in batch processing', {
          screenshotId,
          error: analysisError.message
        });
      }

    } catch (error) {
      logger.error('Failed to queue screenshot for analysis', {
        error: error.message,
        screenshotId
      });
    }
  }
}

module.exports = ScreenshotController;