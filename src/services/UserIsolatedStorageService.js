const crypto = require('crypto');
const { logger } = require('../utils/logger');
const ScreenshotRepository = require('../repositories/ScreenshotRepository');
const AnalysisReportRepository = require('../repositories/AnalysisReportRepository');

/**
 * User-Isolated Storage Service
 * Ensures complete data isolation between users to prevent cross-contamination
 */
class UserIsolatedStorageService {
    constructor() {
        this.screenshotRepository = new ScreenshotRepository();
        this.analysisReportRepository = new AnalysisReportRepository();

        // User-specific in-memory caches (completely isolated)
        this.userStorageBuckets = new Map(); // userId -> user-specific storage

        // Configuration
        this.isolationConfig = {
            strictIsolation: true,
            cacheTimeout: 30 * 60 * 1000, // 30 minutes
            maxUserCacheSize: 1000,
            enableDataValidation: true,
            logDataAccess: true
        };

        // Performance metrics per user
        this.userMetrics = new Map();

        // Start cleanup interval
        this.startCleanupInterval();
    }

    /**
     * Initialize isolated storage bucket for user
     */
    initializeUserBucket(userId) {
        if (!this.userStorageBuckets.has(userId)) {
            const userBucket = {
                userId,
                initialized: new Date().toISOString(),
                lastAccess: new Date().toISOString(),

                // User-specific indexes (completely isolated)
                indexes: {
                    byApp: new Map(),
                    byActivity: new Map(),
                    byTimeRange: new Map(),
                    bySession: new Map(),
                    byProductivity: new Map(),
                    searchKeywords: new Map()
                },

                // User-specific caches
                caches: {
                    screenshots: new Map(),
                    analyses: new Map(),
                    sessions: new Map(),
                    recentActivity: []
                },

                // User-specific metrics
                metrics: {
                    totalScreenshots: 0,
                    totalAnalyses: 0,
                    totalSessions: 0,
                    storageBytes: 0,
                    lastActivity: new Date().toISOString()
                }
            };

            this.userStorageBuckets.set(userId, userBucket);
            this.userMetrics.set(userId, {
                bucketsCreated: 1,
                dataAccesses: 0,
                lastAccess: new Date().toISOString()
            });

            logger.info('Initialized isolated storage bucket for user', {
                userId,
                totalBuckets: this.userStorageBuckets.size
            });
        }

        return this.userStorageBuckets.get(userId);
    }

    /**
     * Get user's isolated storage bucket
     */
    getUserBucket(userId) {
        this.validateUserId(userId);

        let bucket = this.userStorageBuckets.get(userId);
        if (!bucket) {
            bucket = this.initializeUserBucket(userId);
        }

        // Update access time
        bucket.lastAccess = new Date().toISOString();

        // Update user metrics
        const metrics = this.userMetrics.get(userId) || { dataAccesses: 0 };
        metrics.dataAccesses++;
        metrics.lastAccess = new Date().toISOString();
        this.userMetrics.set(userId, metrics);

        if (this.isolationConfig.logDataAccess) {
            logger.debug('User bucket accessed', {
                userId,
                bucketsTotal: this.userStorageBuckets.size,
                userMetrics: metrics
            });
        }

        return bucket;
    }

    /**
     * Store screenshot with complete user isolation
     */
    async storeUserScreenshot(userId, sessionId, screenshotData, fileBuffer = null) {
        try {
            this.validateUserId(userId);

            const bucket = this.getUserBucket(userId);
            const screenshotId = crypto.randomUUID();

            // Create isolated storage key
            const storageKey = this.createIsolatedStorageKey(userId, 'screenshot', screenshotId);

            // Enhanced screenshot data with isolation metadata
            const isolatedScreenshotData = {
                ...screenshotData,
                id: screenshotId,
                user_id: userId,
                session_id: sessionId,
                storage_key: storageKey,
                isolation_metadata: {
                    bucket_id: userId,
                    created_at: new Date().toISOString(),
                    isolation_version: '2.0',
                    data_owner: userId,
                    access_restrictions: ['owner_only']
                },
                metadata_version: 'isolated_v2'
            };

            // Store in database with user isolation
            const savedScreenshot = await this.screenshotRepository.createScreenshot(
                userId,
                sessionId,
                isolatedScreenshotData
            );

            // Update user's isolated cache
            bucket.caches.screenshots.set(screenshotId, savedScreenshot);

            // Update user-specific indexes
            this.updateUserIndexes(userId, savedScreenshot, screenshotData);

            // Update user metrics
            bucket.metrics.totalScreenshots++;
            bucket.metrics.storageBytes += screenshotData.file_size_bytes || 0;
            bucket.metrics.lastActivity = new Date().toISOString();

            logger.info('Screenshot stored with user isolation', {
                userId,
                screenshotId,
                sessionId,
                storageKey,
                userScreenshots: bucket.metrics.totalScreenshots
            });

            return {
                success: true,
                data: {
                    screenshot: savedScreenshot,
                    storage_info: {
                        isolated: true,
                        bucket_id: userId,
                        storage_key: storageKey
                    }
                }
            };

        } catch (error) {
            logger.error('Failed to store user screenshot', {
                userId,
                sessionId,
                error: error.message
            });

            return {
                success: false,
                error: {
                    code: 'ISOLATED_STORAGE_FAILED',
                    message: 'Failed to store screenshot with user isolation',
                    details: error.message
                }
            };
        }
    }

    /**
     * Get user's screenshots with strict isolation
     */
    async getUserScreenshots(userId, filters = {}) {
        try {
            this.validateUserId(userId);

            const bucket = this.getUserBucket(userId);
            const {
                session_id,
                date_from,
                date_to,
                limit = 50,
                offset = 0,
                app_name,
                activity_type
            } = filters;

            // Apply user-specific filtering using isolated indexes
            let screenshotIds = [];

            if (session_id && bucket.indexes.bySession.has(session_id)) {
                screenshotIds = bucket.indexes.bySession.get(session_id);
            } else if (app_name && bucket.indexes.byApp.has(app_name)) {
                screenshotIds = bucket.indexes.byApp.get(app_name);
            } else if (activity_type && bucket.indexes.byActivity.has(activity_type)) {
                screenshotIds = bucket.indexes.byActivity.get(activity_type);
            } else {
                // Get all user screenshots from database with strict user filtering
                const screenshots = await this.screenshotRepository.findByUserId(userId, filters);
                return {
                    success: true,
                    data: {
                        screenshots,
                        total: screenshots.length,
                        isolation_verified: true,
                        bucket_id: userId
                    }
                };
            }

            // Get screenshots from cache or database
            const screenshots = [];
            for (const id of screenshotIds.slice(offset, offset + limit)) {
                let screenshot = bucket.caches.screenshots.get(id);
                if (!screenshot) {
                    // Fallback to database with strict user validation
                    screenshot = await this.screenshotRepository.findByIdAndUser(id, userId);
                    if (screenshot) {
                        bucket.caches.screenshots.set(id, screenshot);
                    }
                }
                if (screenshot) {
                    screenshots.push(screenshot);
                }
            }

            return {
                success: true,
                data: {
                    screenshots,
                    total: screenshotIds.length,
                    isolation_verified: true,
                    bucket_id: userId,
                    cached_results: screenshots.length
                }
            };

        } catch (error) {
            logger.error('Failed to get user screenshots', {
                userId,
                filters,
                error: error.message
            });

            return {
                success: false,
                error: {
                    code: 'ISOLATED_RETRIEVAL_FAILED',
                    message: 'Failed to retrieve user screenshots'
                }
            };
        }
    }

    /**
     * Store analysis with user isolation
     */
    async storeUserAnalysis(userId, sessionId, analysisData) {
        try {
            this.validateUserId(userId);

            const bucket = this.getUserBucket(userId);
            const analysisId = crypto.randomUUID();

            // Enhanced analysis data with isolation
            const isolatedAnalysisData = {
                ...analysisData,
                isolation_metadata: {
                    bucket_id: userId,
                    created_at: new Date().toISOString(),
                    data_owner: userId,
                    isolation_version: '2.0'
                }
            };

            // Store in database
            const savedAnalysis = await this.analysisReportRepository.createAnalysisReport(
                userId,
                sessionId,
                isolatedAnalysisData
            );

            // Update user's isolated cache
            bucket.caches.analyses.set(analysisId, savedAnalysis);

            // Update user metrics
            bucket.metrics.totalAnalyses++;
            bucket.metrics.lastActivity = new Date().toISOString();

            logger.info('Analysis stored with user isolation', {
                userId,
                analysisId: savedAnalysis.id,
                sessionId,
                userAnalyses: bucket.metrics.totalAnalyses
            });

            return {
                success: true,
                data: {
                    analysis: savedAnalysis,
                    isolation_verified: true,
                    bucket_id: userId
                }
            };

        } catch (error) {
            logger.error('Failed to store user analysis', {
                userId,
                sessionId,
                error: error.message
            });

            return {
                success: false,
                error: {
                    code: 'ANALYSIS_STORAGE_FAILED',
                    message: 'Failed to store analysis with user isolation'
                }
            };
        }
    }

    /**
     * Get user's analyses with strict isolation
     */
    async getUserAnalyses(userId, sessionId = null) {
        try {
            this.validateUserId(userId);

            const bucket = this.getUserBucket(userId);

            // Get analyses from database with strict user filtering
            const analyses = sessionId
                ? await this.analysisReportRepository.findBySession(sessionId, userId)
                : await this.analysisReportRepository.findByUserId(userId);

            // Update cache
            analyses.forEach(analysis => {
                bucket.caches.analyses.set(analysis.id, analysis);
            });

            return {
                success: true,
                data: {
                    analyses,
                    total: analyses.length,
                    isolation_verified: true,
                    bucket_id: userId
                }
            };

        } catch (error) {
            logger.error('Failed to get user analyses', {
                userId,
                sessionId,
                error: error.message
            });

            return {
                success: false,
                error: {
                    code: 'ANALYSIS_RETRIEVAL_FAILED',
                    message: 'Failed to retrieve user analyses'
                }
            };
        }
    }

    /**
     * Update user-specific indexes
     */
    updateUserIndexes(userId, screenshot, metadata) {
        const bucket = this.getUserBucket(userId);
        const screenshotId = screenshot.id;

        // App index
        if (screenshot.active_app) {
            const appName = screenshot.active_app.toLowerCase();
            if (!bucket.indexes.byApp.has(appName)) {
                bucket.indexes.byApp.set(appName, []);
            }
            bucket.indexes.byApp.get(appName).push(screenshotId);
        }

        // Session index
        if (screenshot.session_id) {
            if (!bucket.indexes.bySession.has(screenshot.session_id)) {
                bucket.indexes.bySession.set(screenshot.session_id, []);
            }
            bucket.indexes.bySession.get(screenshot.session_id).push(screenshotId);
        }

        // Time index
        if (screenshot.timestamp) {
            const hourKey = new Date(screenshot.timestamp).toISOString().slice(0, 13);
            if (!bucket.indexes.byTimeRange.has(hourKey)) {
                bucket.indexes.byTimeRange.set(hourKey, []);
            }
            bucket.indexes.byTimeRange.get(hourKey).push(screenshotId);
        }

        // Activity index
        if (screenshot.window_title) {
            const activity = this.extractActivityFromTitle(screenshot.window_title);
            if (!bucket.indexes.byActivity.has(activity)) {
                bucket.indexes.byActivity.set(activity, []);
            }
            bucket.indexes.byActivity.get(activity).push(screenshotId);
        }
    }

    /**
     * Create isolated storage key that includes user namespace
     */
    createIsolatedStorageKey(userId, dataType, identifier) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const hash = crypto.randomBytes(8).toString('hex');

        return `isolated/${userId}/${dataType}/${timestamp}_${identifier}_${hash}`;
    }

    /**
     * Validate user ID to prevent injection
     */
    validateUserId(userId) {
        if (!userId || typeof userId !== 'string') {
            throw new Error('Invalid user ID: must be a non-empty string');
        }

        if (!/^[a-zA-Z0-9-_]{8,}$/.test(userId)) {
            throw new Error('Invalid user ID format: contains invalid characters or too short');
        }

        return true;
    }

    /**
     * Validate that data belongs to user (security check)
     */
    async validateDataOwnership(userId, dataId, dataType) {
        try {
            let hasAccess = false;

            switch (dataType) {
                case 'screenshot':
                    const screenshot = await this.screenshotRepository.findByIdAndUser(dataId, userId);
                    hasAccess = !!screenshot;
                    break;
                case 'analysis':
                    const analysis = await this.analysisReportRepository.findByIdAndUser(dataId, userId);
                    hasAccess = !!analysis;
                    break;
                default:
                    hasAccess = false;
            }

            return {
                success: true,
                hasAccess,
                userId,
                dataId,
                dataType
            };

        } catch (error) {
            logger.error('Data ownership validation failed', {
                userId,
                dataId,
                dataType,
                error: error.message
            });

            return {
                success: false,
                hasAccess: false,
                error: error.message
            };
        }
    }

    /**
     * Get user bucket statistics
     */
    getUserStats(userId) {
        this.validateUserId(userId);

        const bucket = this.getUserBucket(userId);
        const userMetrics = this.userMetrics.get(userId) || {};

        return {
            userId,
            bucket_initialized: bucket.initialized,
            last_access: bucket.lastAccess,
            metrics: bucket.metrics,
            cache_stats: {
                screenshots: bucket.caches.screenshots.size,
                analyses: bucket.caches.analyses.size,
                sessions: bucket.caches.sessions.size,
                recent_activity: bucket.caches.recentActivity.length
            },
            index_stats: {
                byApp: bucket.indexes.byApp.size,
                byActivity: bucket.indexes.byActivity.size,
                bySession: bucket.indexes.bySession.size,
                byTimeRange: bucket.indexes.byTimeRange.size
            },
            access_metrics: userMetrics,
            isolation_verified: true
        };
    }

    /**
     * Clear user's isolated data (for testing or cleanup)
     */
    async clearUserData(userId) {
        try {
            this.validateUserId(userId);

            // Remove from memory
            this.userStorageBuckets.delete(userId);
            this.userMetrics.delete(userId);

            logger.info('Cleared user isolated data', {
                userId,
                remainingBuckets: this.userStorageBuckets.size
            });

            return {
                success: true,
                message: 'User data cleared from isolated storage'
            };

        } catch (error) {
            logger.error('Failed to clear user data', {
                userId,
                error: error.message
            });

            return {
                success: false,
                error: {
                    code: 'CLEAR_FAILED',
                    message: 'Failed to clear user data'
                }
            };
        }
    }

    /**
     * Get system-wide isolation stats
     */
    getIsolationStats() {
        const totalUsers = this.userStorageBuckets.size;
        const totalMetrics = Array.from(this.userStorageBuckets.values()).reduce((acc, bucket) => {
            acc.totalScreenshots += bucket.metrics.totalScreenshots;
            acc.totalAnalyses += bucket.metrics.totalAnalyses;
            acc.totalSessions += bucket.metrics.totalSessions;
            acc.storageBytes += bucket.metrics.storageBytes;
            return acc;
        }, { totalScreenshots: 0, totalAnalyses: 0, totalSessions: 0, storageBytes: 0 });

        return {
            total_isolated_users: totalUsers,
            total_buckets: totalUsers,
            system_metrics: totalMetrics,
            isolation_config: this.isolationConfig,
            memory_usage: {
                buckets_size: JSON.stringify([...this.userStorageBuckets.values()]).length,
                metrics_size: JSON.stringify([...this.userMetrics.values()]).length
            }
        };
    }

    /**
     * Extract activity type from window title
     */
    extractActivityFromTitle(windowTitle) {
        const title = windowTitle.toLowerCase();

        if (title.includes('code') || title.includes('terminal') || title.includes('git')) {
            return 'coding';
        } else if (title.includes('figma') || title.includes('design') || title.includes('photoshop')) {
            return 'design';
        } else if (title.includes('slack') || title.includes('teams') || title.includes('zoom')) {
            return 'communication';
        } else if (title.includes('browser') || title.includes('chrome') || title.includes('google')) {
            return 'research';
        }

        return 'general';
    }

    /**
     * Start cleanup interval for expired user buckets
     */
    startCleanupInterval() {
        setInterval(async () => {
            try {
                await this.cleanupExpiredBuckets();
            } catch (error) {
                logger.error('Bucket cleanup failed', { error: error.message });
            }
        }, 60000); // Run every minute
    }

    /**
     * Clean up expired user buckets
     */
    async cleanupExpiredBuckets() {
        const now = new Date();
        let cleanedCount = 0;

        for (const [userId, bucket] of this.userStorageBuckets.entries()) {
            const lastAccess = new Date(bucket.lastAccess);
            const timeSinceAccess = now - lastAccess;

            if (timeSinceAccess > this.isolationConfig.cacheTimeout) {
                // Persist critical data before cleanup
                // Note: In production, you might want to save important cache data to database

                this.userStorageBuckets.delete(userId);
                this.userMetrics.delete(userId);
                cleanedCount++;
            }
        }

        if (cleanedCount > 0) {
            logger.info('Cleaned up expired user buckets', {
                cleanedCount,
                remainingBuckets: this.userStorageBuckets.size
            });
        }
    }
}

module.exports = UserIsolatedStorageService;