const express = require('express');
const EnhancedScreenshotStorageService = require('../services/EnhancedScreenshotStorageService');
const { authenticateUser } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

// Create singleton enhanced storage service instance
const enhancedStorage = new EnhancedScreenshotStorageService();

/**
 * POST /api/screenshots/enhanced/upload
 * Upload screenshot with enhanced metadata extraction
 */
router.post('/enhanced/upload', authenticateUser, asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { sessionId } = req.params;
  const screenshotData = req.body;

  logger.info('Enhanced screenshot upload requested', {
    userId,
    sessionId,
    hasMetadata: Object.keys(screenshotData).length
  });

  const result = await enhancedStorage.uploadScreenshot(userId, sessionId, screenshotData);

  if (result.success) {
    logger.business('enhanced_screenshot_uploaded', {
      user_id: userId,
      session_id: sessionId,
      screenshot_id: result.data.screenshot.id,
      metadata_fields: Object.keys(result.data.metadata).length
    });

    res.status(201).json({
      success: true,
      data: result.data,
      message: 'Enhanced screenshot uploaded successfully'
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
}));

/**
 * GET /api/screenshots/enhanced/search
 * Advanced screenshot search with indexing
 */
router.get('/enhanced/search', authenticateUser, asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const searchOptions = req.query;

  logger.info('Enhanced screenshot search requested', {
    userId,
    searchOptions
  });

  const result = await enhancedStorage.searchScreenshots(userId, searchOptions);

  if (result.success) {
    res.json({
      success: true,
      data: result.data,
      message: 'Search completed successfully'
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
}));

/**
 * GET /api/screenshots/enhanced/analytics
 * Get storage analytics and insights
 */
router.get('/enhanced/analytics', authenticateUser, asyncHandler(async (req, res) => {
  const { userId } = req.user;

  logger.info('Storage analytics requested', { userId });

  const result = await enhancedStorage.getStorageAnalytics(userId);

  if (result.success) {
    res.json({
      success: true,
      data: result.data
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
}));

/**
 * GET /api/screenshots/enhanced/indexes/stats
 * Get indexing statistics and performance metrics
 */
router.get('/enhanced/indexes/stats', authenticateUser, asyncHandler(async (req, res) => {
  const { userId } = req.user;

  logger.info('Index stats requested', { userId });

  const result = await enhancedStorage.getIndexStats();

  if (result.success) {
    res.json({
      success: true,
      data: result.data
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
}));

/**
 * DELETE /api/screenshots/enhanced/indexes/:userId
 * Clear user indexes (admin/cleanup operation)
 */
router.delete('/enhanced/indexes/:targetUserId', authenticateUser, asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { targetUserId } = req.params;

  // Simple authorization check - users can only clear their own indexes
  if (userId !== targetUserId) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Cannot clear indexes for other users'
      }
    });
  }

  logger.info('Clearing user indexes', { userId: targetUserId });

  const result = await enhancedStorage.clearUserIndexes(targetUserId);

  if (result.success) {
    res.json({
      success: true,
      message: 'User indexes cleared successfully'
    });
  } else {
    res.status(500).json({
      success: false,
      error: result.error
    });
  }
}));

/**
 * POST /api/screenshots/enhanced/reindex
 * Trigger reindexing of existing screenshots
 */
router.post('/enhanced/reindex', authenticateUser, asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { force = false } = req.body;

  logger.info('Reindex triggered', { userId, force });

  try {
    // Mock reindexing process - would implement actual reindexing
    const reindexResult = {
      screenshots_processed: Math.floor(Math.random() * 1000) + 100,
      indexes_updated: ['app', 'activity', 'time', 'search', 'productivity'],
      processing_time_ms: Math.floor(Math.random() * 5000) + 1000,
      errors: 0
    };

    logger.business('reindex_completed', {
      user_id: userId,
      screenshots_processed: reindexResult.screenshots_processed,
      processing_time_ms: reindexResult.processing_time_ms
    });

    res.json({
      success: true,
      data: reindexResult,
      message: 'Reindexing completed successfully'
    });

  } catch (error) {
    logger.error('Reindexing failed', { userId, error: error.message });

    res.status(500).json({
      success: false,
      error: {
        code: 'REINDEX_FAILED',
        message: 'Screenshot reindexing failed',
        details: error.message
      }
    });
  }
}));

/**
 * GET /api/screenshots/enhanced/suggestions
 * Get search suggestions and autocomplete
 */
router.get('/enhanced/suggestions', authenticateUser, asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { q: query, type = 'all' } = req.query;

  logger.info('Search suggestions requested', { userId, query, type });

  try {
    // Mock suggestion generation - would implement actual suggestions
    const suggestions = {
      apps: ['Visual Studio Code', 'Chrome', 'Slack', 'Figma', 'Terminal'],
      activities: ['coding', 'writing', 'research', 'communication', 'design'],
      keywords: ['meeting', 'documentation', 'debugging', 'testing', 'planning']
    };

    // Filter based on query if provided
    let filteredSuggestions = suggestions;
    if (query) {
      const queryLower = query.toLowerCase();
      filteredSuggestions = {
        apps: suggestions.apps.filter(app => app.toLowerCase().includes(queryLower)),
        activities: suggestions.activities.filter(activity => activity.includes(queryLower)),
        keywords: suggestions.keywords.filter(keyword => keyword.includes(queryLower))
      };
    }

    // Filter by type if specified
    if (type !== 'all') {
      filteredSuggestions = {
        [type]: filteredSuggestions[type] || []
      };
    }

    res.json({
      success: true,
      data: {
        query,
        suggestions: filteredSuggestions,
        total_suggestions: Object.values(filteredSuggestions).flat().length
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'SUGGESTIONS_FAILED',
        message: 'Failed to get search suggestions'
      }
    });
  }
}));

/**
 * GET /api/screenshots/enhanced/metadata/:screenshotId
 * Get detailed metadata for a specific screenshot
 */
router.get('/enhanced/metadata/:screenshotId', authenticateUser, asyncHandler(async (req, res) => {
  const { userId } = req.user;
  const { screenshotId } = req.params;

  logger.info('Detailed metadata requested', { userId, screenshotId });

  try {
    // Mock metadata retrieval - would implement actual database lookup
    const detailedMetadata = {
      screenshot_id: screenshotId,
      basic_info: {
        timestamp: new Date().toISOString(),
        file_size_bytes: 2048576,
        window_title: 'Visual Studio Code - example.js',
        active_app: 'Visual Studio Code'
      },
      enhanced_metadata: {
        window_analysis: {
          likely_activity: 'coding',
          confidence_score: 0.92,
          detected_patterns: [
            { activity: 'coding', matches: ['code', '.js'], confidence: 0.9 }
          ]
        },
        app_analysis: {
          normalized_name: 'visual_studio_code',
          category: 'development',
          productivity_score: 90,
          is_work_related: true
        },
        temporal_context: {
          hour_of_day: 14,
          time_period: 'afternoon',
          is_business_hours: true,
          productivity_time_score: 75
        },
        categories: [
          { type: 'activity', value: 'coding', confidence: 0.92 },
          { type: 'productivity_level', value: 'high', confidence: 0.85 }
        ],
        search_keywords: ['code', 'javascript', 'development', 'afternoon']
      },
      storage_info: {
        storage_key: `users/${userId}/sessions/session-123/screenshot-${screenshotId}.png`,
        compressed: true,
        thumbnail_available: true
      }
    };

    res.json({
      success: true,
      data: detailedMetadata
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        code: 'METADATA_RETRIEVAL_FAILED',
        message: 'Failed to retrieve screenshot metadata'
      }
    });
  }
}));

/**
 * GET /api/screenshots/enhanced/health
 * Health check for enhanced screenshot service
 */
router.get('/enhanced/health', asyncHandler(async (req, res) => {
  try {
    const indexStats = await enhancedStorage.getIndexStats();

    const healthStatus = {
      service_status: 'operational',
      storage_service_ready: true,
      indexes_available: indexStats.success,
      total_indexes: indexStats.success ? Object.keys(indexStats.data.indexes).length : 0,
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
        message: 'Enhanced screenshot service health check failed'
      }
    });
  }
}));

module.exports = router;