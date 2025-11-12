const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { ApiError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');
const ScreenshotRepository = require('../repositories/ScreenshotRepository');

/**
 * Enhanced Screenshot Storage Service with comprehensive metadata and indexing
 * Provides optimized storage, retrieval, and search capabilities for screenshots
 */
class EnhancedScreenshotStorageService {
  constructor() {
    this.screenshotRepository = new ScreenshotRepository();

    // In-memory indexes for fast lookups (would be Redis/database in production)
    this.indexes = {
      byApp: new Map(), // app_name -> screenshot_ids[]
      byActivity: new Map(), // activity_type -> screenshot_ids[]
      byTimeRange: new Map(), // time_key -> screenshot_ids[]
      bySession: new Map(), // session_id -> screenshot_metadata
      byUser: new Map(), // user_id -> screenshot_summaries
      byProductivityRange: new Map(), // score_range -> screenshot_ids[]
      fullTextSearch: new Map() // keywords -> screenshot_ids[]
    };

    // Metadata extraction patterns
    this.metadataPatterns = {
      coding: ['code', 'editor', 'ide', 'terminal', 'github', 'git', 'vs code', 'vim', 'sublime'],
      design: ['figma', 'sketch', 'photoshop', 'illustrator', 'canva', 'design'],
      communication: ['slack', 'teams', 'discord', 'zoom', 'meet', 'email', 'gmail'],
      research: ['browser', 'google', 'wikipedia', 'documentation', 'docs', 'stackoverflow'],
      productivity: ['notion', 'trello', 'asana', 'calendar', 'todoist', 'excel', 'sheets'],
      entertainment: ['youtube', 'netflix', 'spotify', 'twitch', 'gaming', 'social']
    };

    // Initialize storage optimization settings
    this.storageConfig = {
      compressionEnabled: true,
      thumbnailGeneration: true,
      metadataExtraction: true,
      indexingEnabled: true,
      retentionPeriodDays: 90,
      maxFileSize: 10 * 1024 * 1024, // 10MB
      allowedFormats: ['png', 'jpg', 'jpeg', 'webp']
    };

    // Performance metrics
    this.metrics = {
      totalScreenshots: 0,
      totalStorageBytes: 0,
      averageRetrievalTimeMs: 0,
      indexHitRate: 0.0,
      compressionRatio: 0.0
    };
  }

  /**
   * Enhanced screenshot upload with comprehensive metadata extraction
   */
  async uploadScreenshot(userId, sessionId, screenshotData, fileBuffer = null) {
    const startTime = Date.now();

    try {
      logger.info('Starting enhanced screenshot upload', {
        userId,
        sessionId,
        fileSize: screenshotData.file_size_bytes,
        trigger: screenshotData.capture_trigger
      });

      // Validate input
      await this.validateUploadData(screenshotData, fileBuffer);

      // Extract comprehensive metadata
      const enhancedMetadata = await this.extractComprehensiveMetadata(screenshotData, fileBuffer);

      // Generate storage key with enhanced naming
      const storageKey = this.generateEnhancedStorageKey(userId, sessionId, enhancedMetadata);

      // Process and optimize file if buffer provided
      let processedFileInfo = null;
      if (fileBuffer) {
        processedFileInfo = await this.processScreenshotFile(fileBuffer, storageKey);
      }

      // Combine original and enhanced metadata
      const combinedMetadata = {
        ...screenshotData,
        ...enhancedMetadata,
        storage_key: storageKey,
        processed_file_info: processedFileInfo,
        upload_timestamp: new Date().toISOString(),
        metadata_version: 'v2_enhanced'
      };

      // Store in database
      const savedScreenshot = await this.screenshotRepository.createScreenshot(
        userId,
        sessionId,
        combinedMetadata
      );

      // Update indexes
      await this.updateIndexes(savedScreenshot, enhancedMetadata);

      // Update metrics
      this.updateMetrics(savedScreenshot, startTime);

      logger.info('Enhanced screenshot upload completed', {
        screenshotId: savedScreenshot.id,
        storageKey,
        processingTime: Date.now() - startTime,
        metadataFields: Object.keys(enhancedMetadata).length
      });

      return {
        success: true,
        data: {
          screenshot: savedScreenshot,
          metadata: enhancedMetadata,
          storage_info: processedFileInfo
        }
      };

    } catch (error) {
      logger.error('Enhanced screenshot upload failed', {
        userId,
        sessionId,
        error: error.message,
        processingTime: Date.now() - startTime
      });

      return {
        success: false,
        error: {
          code: 'UPLOAD_FAILED',
          message: 'Enhanced screenshot upload failed',
          details: error.message
        }
      };
    }
  }

  /**
   * Extract comprehensive metadata from screenshot
   */
  async extractComprehensiveMetadata(screenshotData, fileBuffer) {
    const metadata = {
      extracted_at: new Date().toISOString(),
      extraction_version: 'v2.0'
    };

    // Enhanced window title analysis
    if (screenshotData.window_title) {
      metadata.window_analysis = this.analyzeWindowTitle(screenshotData.window_title);
    }

    // Enhanced app analysis
    if (screenshotData.active_app) {
      metadata.app_analysis = this.analyzeActiveApp(screenshotData.active_app);
    }

    // Time-based context
    metadata.temporal_context = this.extractTemporalContext(screenshotData.timestamp);

    // Productivity scoring context
    metadata.productivity_context = this.extractProductivityContext(screenshotData);

    // File analysis (if buffer provided)
    if (fileBuffer) {
      metadata.file_analysis = await this.analyzeImageFile(fileBuffer);
    }

    // Generate searchable keywords
    metadata.search_keywords = this.generateSearchKeywords(screenshotData, metadata);

    // Category classification
    metadata.categories = this.classifyScreenshot(screenshotData, metadata);

    return metadata;
  }

  /**
   * Analyze window title for insights
   */
  analyzeWindowTitle(windowTitle) {
    const title = windowTitle.toLowerCase();
    const analysis = {
      original: windowTitle,
      length: windowTitle.length,
      detected_patterns: [],
      likely_activity: 'unknown',
      confidence_score: 0.0,
      extracted_entities: []
    };

    // Pattern matching
    for (const [activity, patterns] of Object.entries(this.metadataPatterns)) {
      const matches = patterns.filter(pattern => title.includes(pattern));
      if (matches.length > 0) {
        analysis.detected_patterns.push({
          activity,
          matches,
          confidence: matches.length / patterns.length
        });
      }
    }

    // Determine most likely activity
    if (analysis.detected_patterns.length > 0) {
      const topPattern = analysis.detected_patterns.sort((a, b) => b.confidence - a.confidence)[0];
      analysis.likely_activity = topPattern.activity;
      analysis.confidence_score = topPattern.confidence;
    }

    // Extract file extensions
    const fileExtensions = title.match(/\.\w{2,4}/g) || [];
    if (fileExtensions.length > 0) {
      analysis.extracted_entities.push({
        type: 'file_extensions',
        values: fileExtensions
      });
    }

    // Extract URLs
    const urls = title.match(/https?:\/\/[^\s]+/g) || [];
    if (urls.length > 0) {
      analysis.extracted_entities.push({
        type: 'urls',
        values: urls
      });
    }

    return analysis;
  }

  /**
   * Analyze active application
   */
  analyzeActiveApp(activeApp) {
    const app = activeApp.toLowerCase();
    const analysis = {
      original: activeApp,
      normalized_name: this.normalizeAppName(activeApp),
      category: 'unknown',
      productivity_score: 50,
      is_work_related: false,
      confidence: 0.0
    };

    // App categorization
    const appCategories = {
      'development': ['code', 'terminal', 'git', 'docker', 'postman', 'insomnia'],
      'design': ['figma', 'sketch', 'photoshop', 'illustrator', 'canva'],
      'communication': ['slack', 'teams', 'discord', 'zoom', 'skype'],
      'browser': ['chrome', 'firefox', 'safari', 'edge', 'brave'],
      'productivity': ['notion', 'obsidian', 'excel', 'word', 'sheets'],
      'entertainment': ['spotify', 'netflix', 'youtube', 'gaming', 'steam']
    };

    for (const [category, apps] of Object.entries(appCategories)) {
      const matches = apps.filter(appPattern => app.includes(appPattern));
      if (matches.length > 0) {
        analysis.category = category;
        analysis.confidence = 0.8;

        // Assign productivity scores based on category
        const productivityScores = {
          'development': 90,
          'design': 85,
          'productivity': 80,
          'communication': 70,
          'browser': 60,
          'entertainment': 20
        };

        analysis.productivity_score = productivityScores[category] || 50;
        analysis.is_work_related = ['development', 'design', 'productivity', 'communication'].includes(category);
        break;
      }
    }

    return analysis;
  }

  /**
   * Extract temporal context from timestamp
   */
  extractTemporalContext(timestamp) {
    const date = new Date(timestamp);
    const hour = date.getHours();
    const dayOfWeek = date.getDay();

    return {
      hour_of_day: hour,
      time_period: this.getTimePeriod(hour),
      day_of_week: dayOfWeek,
      is_weekend: dayOfWeek === 0 || dayOfWeek === 6,
      is_business_hours: hour >= 9 && hour <= 17 && !this.isWeekend(dayOfWeek),
      productivity_time_score: this.calculateTimeProductivityScore(hour, dayOfWeek)
    };
  }

  /**
   * Extract productivity context
   */
  extractProductivityContext(screenshotData) {
    const context = {
      capture_trigger: screenshotData.capture_trigger,
      is_scheduled: screenshotData.capture_trigger?.includes('timer'),
      is_event_driven: screenshotData.capture_trigger?.includes('click') ||
                      screenshotData.capture_trigger?.includes('key'),
      likely_focus_level: 'medium'
    };

    // Infer focus level from capture trigger
    if (context.is_event_driven) {
      context.likely_focus_level = 'high'; // User actively working
    } else if (context.is_scheduled) {
      context.likely_focus_level = 'medium'; // Regular monitoring
    }

    return context;
  }

  /**
   * Generate search keywords for full-text search
   */
  generateSearchKeywords(screenshotData, metadata) {
    const keywords = new Set();

    // Add basic fields
    if (screenshotData.window_title) {
      screenshotData.window_title.split(/\s+/).forEach(word => {
        if (word.length > 2) keywords.add(word.toLowerCase());
      });
    }

    if (screenshotData.active_app) {
      keywords.add(screenshotData.active_app.toLowerCase());
    }

    // Add detected activities
    if (metadata.window_analysis?.likely_activity) {
      keywords.add(metadata.window_analysis.likely_activity);
    }

    if (metadata.app_analysis?.category) {
      keywords.add(metadata.app_analysis.category);
    }

    // Add temporal keywords
    if (metadata.temporal_context) {
      keywords.add(metadata.temporal_context.time_period);
      if (metadata.temporal_context.is_business_hours) {
        keywords.add('business_hours');
      }
      if (metadata.temporal_context.is_weekend) {
        keywords.add('weekend');
      }
    }

    return Array.from(keywords);
  }

  /**
   * Classify screenshot into categories
   */
  classifyScreenshot(screenshotData, metadata) {
    const categories = [];

    // Primary activity category
    if (metadata.window_analysis?.likely_activity) {
      categories.push({
        type: 'activity',
        value: metadata.window_analysis.likely_activity,
        confidence: metadata.window_analysis.confidence_score
      });
    }

    // App category
    if (metadata.app_analysis?.category) {
      categories.push({
        type: 'app_category',
        value: metadata.app_analysis.category,
        confidence: metadata.app_analysis.confidence
      });
    }

    // Productivity level
    const avgProductivity = (
      (metadata.app_analysis?.productivity_score || 50) +
      (metadata.temporal_context?.productivity_time_score || 50)
    ) / 2;

    let productivityLevel = 'medium';
    if (avgProductivity > 70) productivityLevel = 'high';
    else if (avgProductivity < 40) productivityLevel = 'low';

    categories.push({
      type: 'productivity_level',
      value: productivityLevel,
      confidence: 0.7
    });

    // Work/non-work classification
    categories.push({
      type: 'work_classification',
      value: metadata.app_analysis?.is_work_related ? 'work' : 'personal',
      confidence: metadata.app_analysis?.confidence || 0.5
    });

    return categories;
  }

  /**
   * Update all indexes with new screenshot data
   */
  async updateIndexes(screenshot, metadata) {
    const screenshotId = screenshot.id;

    // App index
    if (metadata.app_analysis?.normalized_name) {
      const appName = metadata.app_analysis.normalized_name;
      if (!this.indexes.byApp.has(appName)) {
        this.indexes.byApp.set(appName, []);
      }
      this.indexes.byApp.get(appName).push(screenshotId);
    }

    // Activity index
    if (metadata.window_analysis?.likely_activity) {
      const activity = metadata.window_analysis.likely_activity;
      if (!this.indexes.byActivity.has(activity)) {
        this.indexes.byActivity.set(activity, []);
      }
      this.indexes.byActivity.get(activity).push(screenshotId);
    }

    // Time range index (hourly buckets)
    if (screenshot.timestamp) {
      const hourKey = new Date(screenshot.timestamp).toISOString().slice(0, 13); // YYYY-MM-DDTHH
      if (!this.indexes.byTimeRange.has(hourKey)) {
        this.indexes.byTimeRange.set(hourKey, []);
      }
      this.indexes.byTimeRange.get(hourKey).push(screenshotId);
    }

    // Session index
    if (!this.indexes.bySession.has(screenshot.work_session_id)) {
      this.indexes.bySession.set(screenshot.work_session_id, {
        screenshots: [],
        metadata: {
          started_at: screenshot.timestamp,
          last_screenshot_at: screenshot.timestamp,
          total_screenshots: 0
        }
      });
    }

    const sessionData = this.indexes.bySession.get(screenshot.work_session_id);
    sessionData.screenshots.push(screenshotId);
    sessionData.metadata.last_screenshot_at = screenshot.timestamp;
    sessionData.metadata.total_screenshots = sessionData.screenshots.length;

    // User index
    if (!this.indexes.byUser.has(screenshot.user_id)) {
      this.indexes.byUser.set(screenshot.user_id, {
        total_screenshots: 0,
        categories: new Map(),
        apps: new Map(),
        last_activity: null
      });
    }

    const userData = this.indexes.byUser.get(screenshot.user_id);
    userData.total_screenshots++;
    userData.last_activity = screenshot.timestamp;

    // Full-text search index
    if (metadata.search_keywords) {
      metadata.search_keywords.forEach(keyword => {
        if (!this.indexes.fullTextSearch.has(keyword)) {
          this.indexes.fullTextSearch.set(keyword, []);
        }
        this.indexes.fullTextSearch.get(keyword).push(screenshotId);
      });
    }

    // Productivity range index
    if (metadata.categories) {
      const productivityCategory = metadata.categories.find(cat => cat.type === 'productivity_level');
      if (productivityCategory) {
        const range = productivityCategory.value;
        if (!this.indexes.byProductivityRange.has(range)) {
          this.indexes.byProductivityRange.set(range, []);
        }
        this.indexes.byProductivityRange.get(range).push(screenshotId);
      }
    }

    logger.debug('Updated indexes for screenshot', {
      screenshotId,
      indexesUpdated: ['app', 'activity', 'time', 'session', 'user', 'search', 'productivity']
    });
  }

  /**
   * Enhanced search functionality
   */
  async searchScreenshots(userId, searchOptions = {}) {
    const {
      query,
      app_name,
      activity_type,
      date_from,
      date_to,
      session_id,
      productivity_level,
      limit = 50,
      offset = 0,
      sort_by = 'timestamp',
      sort_direction = 'desc'
    } = searchOptions;

    const startTime = Date.now();
    let candidateIds = new Set();

    try {
      // Full-text search
      if (query) {
        const keywords = query.toLowerCase().split(/\s+/);
        const matchingIds = new Set();

        keywords.forEach(keyword => {
          const ids = this.indexes.fullTextSearch.get(keyword) || [];
          ids.forEach(id => matchingIds.add(id));
        });

        candidateIds = new Set([...matchingIds]);
      }

      // App filter
      if (app_name) {
        const appIds = new Set(this.indexes.byApp.get(app_name) || []);
        candidateIds = candidateIds.size === 0 ? appIds :
          new Set([...candidateIds].filter(id => appIds.has(id)));
      }

      // Activity filter
      if (activity_type) {
        const activityIds = new Set(this.indexes.byActivity.get(activity_type) || []);
        candidateIds = candidateIds.size === 0 ? activityIds :
          new Set([...candidateIds].filter(id => activityIds.has(id)));
      }

      // Productivity filter
      if (productivity_level) {
        const productivityIds = new Set(this.indexes.byProductivityRange.get(productivity_level) || []);
        candidateIds = candidateIds.size === 0 ? productivityIds :
          new Set([...candidateIds].filter(id => productivityIds.has(id)));
      }

      // Session filter
      if (session_id) {
        const sessionData = this.indexes.bySession.get(session_id);
        const sessionIds = new Set(sessionData ? sessionData.screenshots : []);
        candidateIds = candidateIds.size === 0 ? sessionIds :
          new Set([...candidateIds].filter(id => sessionIds.has(id)));
      }

      // Time range filter (fallback to database query for complex time ranges)
      if (date_from || date_to) {
        // Use time index for quick filtering, then fallback to database
        const timeFilteredIds = this.filterByTimeRange(candidateIds, date_from, date_to);
        candidateIds = timeFilteredIds;
      }

      // Convert to array and get from database
      const candidateIdArray = Array.from(candidateIds);

      // If no index matches found, fall back to database query
      if (candidateIdArray.length === 0 && Object.keys(searchOptions).length > 0) {
        return this.fallbackDatabaseSearch(userId, searchOptions);
      }

      // Get screenshots from database
      const screenshots = await this.getScreenshotsByIds(candidateIdArray, userId);

      // Apply sorting and pagination
      const sortedScreenshots = this.sortScreenshots(screenshots, sort_by, sort_direction);
      const paginatedResults = sortedScreenshots.slice(offset, offset + limit);

      const searchTime = Date.now() - startTime;

      logger.info('Enhanced screenshot search completed', {
        userId,
        query: query || 'none',
        filters: Object.keys(searchOptions).length,
        candidatesFound: candidateIdArray.length,
        finalResults: paginatedResults.length,
        searchTimeMs: searchTime,
        indexHitRate: candidateIdArray.length > 0 ? 1.0 : 0.0
      });

      return {
        success: true,
        data: {
          screenshots: paginatedResults,
          total_results: sortedScreenshots.length,
          search_metadata: {
            query,
            filters_applied: Object.keys(searchOptions).filter(key => searchOptions[key]).length,
            search_time_ms: searchTime,
            used_indexes: candidateIdArray.length > 0,
            total_candidates: candidateIdArray.length
          }
        }
      };

    } catch (error) {
      logger.error('Enhanced screenshot search failed', {
        userId,
        searchOptions,
        error: error.message,
        searchTimeMs: Date.now() - startTime
      });

      return {
        success: false,
        error: {
          code: 'SEARCH_FAILED',
          message: 'Enhanced screenshot search failed',
          details: error.message
        }
      };
    }
  }

  /**
   * Get analytics about stored screenshots
   */
  async getStorageAnalytics(userId) {
    try {
      const userData = this.indexes.byUser.get(userId);

      if (!userData) {
        return {
          success: true,
          data: {
            total_screenshots: 0,
            storage_used_bytes: 0,
            top_apps: [],
            top_activities: [],
            productivity_distribution: {},
            temporal_patterns: {}
          }
        };
      }

      // Get top apps
      const topApps = Array.from(this.indexes.byApp.entries())
        .map(([app, ids]) => ({
          app_name: app,
          screenshot_count: ids.filter(id => this.belongsToUser(id, userId)).length
        }))
        .sort((a, b) => b.screenshot_count - a.screenshot_count)
        .slice(0, 10);

      // Get top activities
      const topActivities = Array.from(this.indexes.byActivity.entries())
        .map(([activity, ids]) => ({
          activity_type: activity,
          screenshot_count: ids.filter(id => this.belongsToUser(id, userId)).length
        }))
        .sort((a, b) => b.screenshot_count - a.screenshot_count)
        .slice(0, 10);

      // Productivity distribution
      const productivityDistribution = {};
      ['low', 'medium', 'high'].forEach(level => {
        const ids = this.indexes.byProductivityRange.get(level) || [];
        productivityDistribution[level] = ids.filter(id => this.belongsToUser(id, userId)).length;
      });

      return {
        success: true,
        data: {
          total_screenshots: userData.total_screenshots,
          top_apps: topApps,
          top_activities: topActivities,
          productivity_distribution: productivityDistribution,
          last_activity: userData.last_activity,
          storage_metrics: this.metrics
        }
      };

    } catch (error) {
      return {
        success: false,
        error: {
          code: 'ANALYTICS_FAILED',
          message: 'Storage analytics failed',
          details: error.message
        }
      };
    }
  }

  // Utility methods
  generateEnhancedStorageKey(userId, sessionId, metadata) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const activity = metadata.window_analysis?.likely_activity || 'unknown';
    const app = metadata.app_analysis?.normalized_name || 'unknown';
    const hash = crypto.randomBytes(8).toString('hex');

    return `users/${userId}/sessions/${sessionId}/${timestamp}_${activity}_${app}_${hash}.png`;
  }

  normalizeAppName(appName) {
    return appName.toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .substring(0, 50);
  }

  getTimePeriod(hour) {
    if (hour < 6) return 'night';
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    if (hour < 22) return 'evening';
    return 'night';
  }

  isWeekend(dayOfWeek) {
    return dayOfWeek === 0 || dayOfWeek === 6;
  }

  calculateTimeProductivityScore(hour, dayOfWeek) {
    let score = 50; // Base score

    // Weekend penalty
    if (this.isWeekend(dayOfWeek)) score -= 10;

    // Hour-based adjustments
    if (hour >= 9 && hour <= 11) score += 20; // Peak morning
    else if (hour >= 14 && hour <= 16) score += 10; // Good afternoon
    else if (hour >= 22 || hour <= 6) score -= 20; // Late night/early morning

    return Math.max(0, Math.min(100, score));
  }

  async validateUploadData(screenshotData, fileBuffer) {
    if (!screenshotData.file_storage_key && !fileBuffer) {
      throw new ApiError('INVALID_DATA', 'Either storage key or file buffer required');
    }

    if (fileBuffer && fileBuffer.length > this.storageConfig.maxFileSize) {
      throw new ApiError('FILE_TOO_LARGE', `File size exceeds ${this.storageConfig.maxFileSize} bytes`);
    }
  }

  async processScreenshotFile(fileBuffer, storageKey) {
    // Mock file processing - would implement actual image processing
    return {
      original_size: fileBuffer.length,
      compressed_size: Math.floor(fileBuffer.length * 0.7), // Mock compression
      format: 'png',
      dimensions: { width: 1920, height: 1080 }, // Mock dimensions
      storage_path: storageKey,
      thumbnail_generated: true
    };
  }

  async analyzeImageFile(fileBuffer) {
    // Mock image analysis - would implement actual image processing
    return {
      file_size: fileBuffer.length,
      estimated_text_regions: Math.floor(Math.random() * 5) + 1,
      dominant_colors: ['#ffffff', '#000000', '#cccccc'],
      complexity_score: Math.random(),
      has_ui_elements: Math.random() > 0.3
    };
  }

  filterByTimeRange(candidateIds, dateFrom, dateTo) {
    // Simple time filtering using time index
    // In production, this would be more sophisticated
    return candidateIds;
  }

  async getScreenshotsByIds(ids, userId) {
    // Mock database fetch - would use actual repository
    return [];
  }

  async fallbackDatabaseSearch(userId, searchOptions) {
    // Fallback to database search when indexes don't help
    return this.screenshotRepository.findByTimeRange(userId,
      searchOptions.date_from,
      searchOptions.date_to,
      searchOptions
    );
  }

  sortScreenshots(screenshots, sortBy, direction) {
    return screenshots.sort((a, b) => {
      const aVal = a[sortBy];
      const bVal = b[sortBy];
      const modifier = direction === 'desc' ? -1 : 1;

      if (aVal < bVal) return -1 * modifier;
      if (aVal > bVal) return 1 * modifier;
      return 0;
    });
  }

  belongsToUser(screenshotId, userId) {
    // Mock user check - would implement actual logic
    return true;
  }

  updateMetrics(screenshot, startTime) {
    this.metrics.totalScreenshots++;
    this.metrics.totalStorageBytes += screenshot.file_size_bytes || 0;

    const processingTime = Date.now() - startTime;
    this.metrics.averageRetrievalTimeMs =
      (this.metrics.averageRetrievalTimeMs + processingTime) / 2;
  }

  // Public API methods
  async getIndexStats() {
    return {
      success: true,
      data: {
        indexes: {
          byApp: this.indexes.byApp.size,
          byActivity: this.indexes.byActivity.size,
          byTimeRange: this.indexes.byTimeRange.size,
          bySession: this.indexes.bySession.size,
          byUser: this.indexes.byUser.size,
          byProductivityRange: this.indexes.byProductivityRange.size,
          fullTextSearch: this.indexes.fullTextSearch.size
        },
        metrics: this.metrics,
        config: this.storageConfig
      }
    };
  }

  async clearUserIndexes(userId) {
    // Remove user data from all indexes
    this.indexes.byUser.delete(userId);
    // Would implement full cleanup in production

    logger.info('Cleared user indexes', { userId });

    return { success: true };
  }
}

module.exports = EnhancedScreenshotStorageService;