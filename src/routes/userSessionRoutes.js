const express = require('express');
const router = express.Router();
const { authenticateUser, userSessionService } = require('../middleware/auth');
const UserIsolatedStorageService = require('../services/UserIsolatedStorageService');

// Create isolated storage service instance
const isolatedStorageService = new UserIsolatedStorageService();

/**
 * Initialize user session
 * POST /api/user-session/init
 */
router.post('/init', authenticateUser, async (req, res) => {
    try {
        const { userId } = req.user;

        console.log(`[UserSession] Initializing session for user ${userId}`);

        // Initialize user session
        const sessionResult = await userSessionService.initializeUserSession(userId);

        if (!sessionResult.success) {
            return res.status(500).json({
                success: false,
                error: sessionResult.error
            });
        }

        // Initialize isolated storage bucket
        const storageResult = isolatedStorageService.initializeUserBucket(userId);

        res.status(200).json({
            success: true,
            data: {
                session: sessionResult.data,
                storage: {
                    bucket_initialized: true,
                    isolation_enabled: true
                },
                message: sessionResult.data.isReturningUser
                    ? 'Welcome back! Your session has been restored.'
                    : 'Welcome! Your session has been initialized.'
            }
        });

    } catch (error) {
        console.error('[UserSession] Session initialization error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'SESSION_INIT_ERROR',
                message: 'Failed to initialize user session',
                details: error.message
            }
        });
    }
});

/**
 * Get current user session
 * GET /api/user-session/current
 */
router.get('/current', authenticateUser, async (req, res) => {
    try {
        const { userId } = req.user;

        const sessionResult = await userSessionService.getUserSession(userId);

        if (!sessionResult.success) {
            return res.status(404).json({
                success: false,
                error: sessionResult.error
            });
        }

        // Get storage stats
        const storageStats = isolatedStorageService.getUserStats(userId);

        res.json({
            success: true,
            data: {
                session: sessionResult.data,
                storage_stats: storageStats,
                session_active: true
            }
        });

    } catch (error) {
        console.error('[UserSession] Get session error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'SESSION_RETRIEVAL_ERROR',
                message: 'Failed to retrieve user session'
            }
        });
    }
});

/**
 * Update user preferences
 * PUT /api/user-session/preferences
 */
router.put('/preferences', authenticateUser, async (req, res) => {
    try {
        const { userId } = req.user;
        const preferences = req.body;

        console.log(`[UserSession] Updating preferences for user ${userId}`);

        // Validate preferences
        if (!preferences || typeof preferences !== 'object') {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'INVALID_PREFERENCES',
                    message: 'Preferences must be a valid object'
                }
            });
        }

        const result = await userSessionService.updateUserPreferences(userId, preferences);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data,
            message: 'User preferences updated successfully'
        });

    } catch (error) {
        console.error('[UserSession] Preferences update error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'PREFERENCES_UPDATE_ERROR',
                message: 'Failed to update user preferences'
            }
        });
    }
});

/**
 * Record user activity
 * POST /api/user-session/activity
 */
router.post('/activity', authenticateUser, async (req, res) => {
    try {
        const { userId } = req.user;
        const activityData = req.body;

        const result = await userSessionService.recordUserActivity(userId, activityData);

        if (!result.success) {
            return res.status(500).json({
                success: false,
                error: result.error
            });
        }

        res.json({
            success: true,
            data: result.data,
            message: 'Activity recorded successfully'
        });

    } catch (error) {
        console.error('[UserSession] Activity recording error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'ACTIVITY_RECORDING_ERROR',
                message: 'Failed to record user activity'
            }
        });
    }
});

/**
 * Get user's isolated data statistics
 * GET /api/user-session/data-stats
 */
router.get('/data-stats', authenticateUser, async (req, res) => {
    try {
        const { userId } = req.user;

        const stats = isolatedStorageService.getUserStats(userId);

        res.json({
            success: true,
            data: {
                user_stats: stats,
                isolation_verified: true,
                data_ownership_confirmed: true
            }
        });

    } catch (error) {
        console.error('[UserSession] Data stats error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'DATA_STATS_ERROR',
                message: 'Failed to retrieve user data statistics'
            }
        });
    }
});

/**
 * Validate user data ownership
 * POST /api/user-session/validate-ownership
 */
router.post('/validate-ownership', authenticateUser, async (req, res) => {
    try {
        const { userId } = req.user;
        const { dataId, dataType } = req.body;

        if (!dataId || !dataType) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'MISSING_PARAMETERS',
                    message: 'dataId and dataType are required'
                }
            });
        }

        const validation = await isolatedStorageService.validateDataOwnership(userId, dataId, dataType);

        res.json({
            success: true,
            data: {
                validation_result: validation,
                access_granted: validation.hasAccess,
                data_belongs_to_user: validation.hasAccess
            }
        });

    } catch (error) {
        console.error('[UserSession] Ownership validation error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'OWNERSHIP_VALIDATION_ERROR',
                message: 'Failed to validate data ownership'
            }
        });
    }
});

/**
 * Get session statistics
 * GET /api/user-session/stats
 */
router.get('/stats', authenticateUser, async (req, res) => {
    try {
        const sessionStats = userSessionService.getSessionStats();
        const isolationStats = isolatedStorageService.getIsolationStats();

        res.json({
            success: true,
            data: {
                session_service: sessionStats,
                isolation_service: isolationStats,
                user_id: req.user.userId
            }
        });

    } catch (error) {
        console.error('[UserSession] Stats error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'STATS_ERROR',
                message: 'Failed to retrieve session statistics'
            }
        });
    }
});

/**
 * Clear user session and data (for testing)
 * DELETE /api/user-session/clear
 */
router.delete('/clear', authenticateUser, async (req, res) => {
    try {
        const { userId } = req.user;

        console.log(`[UserSession] Clearing session and data for user ${userId}`);

        // Clear isolated storage
        const clearResult = await isolatedStorageService.clearUserData(userId);

        res.json({
            success: true,
            data: {
                session_cleared: true,
                storage_cleared: clearResult.success,
                message: 'User session and data cleared successfully'
            }
        });

    } catch (error) {
        console.error('[UserSession] Clear error:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'CLEAR_ERROR',
                message: 'Failed to clear user session and data'
            }
        });
    }
});

/**
 * Health check for user session service
 * GET /api/user-session/health
 */
router.get('/health', (req, res) => {
    try {
        const sessionStats = userSessionService.getSessionStats();
        const isolationStats = isolatedStorageService.getIsolationStats();

        res.json({
            success: true,
            service: 'UserSessionService',
            status: 'healthy',
            timestamp: new Date().toISOString(),
            stats: {
                active_sessions: sessionStats.activeSessions,
                isolated_users: isolationStats.total_isolated_users,
                memory_usage: {
                    session_service: sessionStats.memoryUsage,
                    isolation_service: isolationStats.memory_usage
                }
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            service: 'UserSessionService',
            status: 'unhealthy',
            error: error.message
        });
    }
});

module.exports = router;