const jwt = require('jsonwebtoken');
const UserRepository = require('../repositories/UserRepository');
const { logger } = require('../utils/logger');

/**
 * User Session Persistence Service
 * Handles user session state, preferences, and data isolation
 */
class UserSessionService {
    constructor() {
        this.userRepository = new UserRepository();

        // User-specific data buckets (would be Redis in production)
        this.userSessions = new Map(); // userId -> session data
        this.userPreferences = new Map(); // userId -> preferences
        this.userActivityCache = new Map(); // userId -> recent activity

        // Session configuration
        this.sessionConfig = {
            maxSessionAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            preferencesCacheSize: 1000,
            activityCacheSize: 500,
            autoSaveInterval: 30000 // 30 seconds
        };

        // Start auto-save interval
        this.startAutoSave();
    }

    /**
     * Initialize or restore user session
     */
    async initializeUserSession(userId) {
        try {
            // Get user data from database
            const user = await this.userRepository.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            // Load user preferences from database
            const preferences = await this.loadUserPreferences(userId);

            // Load recent activity cache
            const recentActivity = await this.loadRecentActivity(userId);

            // Create session data
            const sessionData = {
                userId: user.id,
                email: user.email,
                name: user.name,
                avatar_url: user.avatar_url,
                provider: user.oauth_provider,
                organization_id: user.organization_id,
                sessionStarted: new Date().toISOString(),
                lastActivity: new Date().toISOString(),
                preferences,
                recentActivity,
                isInitialized: true
            };

            // Store in memory cache
            this.userSessions.set(userId, sessionData);
            this.userPreferences.set(userId, preferences);
            this.userActivityCache.set(userId, recentActivity);

            logger.info('User session initialized successfully', {
                userId,
                email: user.email,
                hasPreferences: Object.keys(preferences).length > 0
            });

            return {
                success: true,
                data: {
                    user: sessionData,
                    sessionId: userId,
                    preferences,
                    isReturningUser: Object.keys(preferences).length > 0
                }
            };

        } catch (error) {
            logger.error('Failed to initialize user session', {
                userId,
                error: error.message
            });

            return {
                success: false,
                error: {
                    code: 'SESSION_INIT_FAILED',
                    message: 'Failed to initialize user session',
                    details: error.message
                }
            };
        }
    }

    /**
     * Get user session data
     */
    async getUserSession(userId) {
        try {
            let sessionData = this.userSessions.get(userId);

            if (!sessionData || !sessionData.isInitialized) {
                // Session not in cache, initialize it
                const initResult = await this.initializeUserSession(userId);
                if (!initResult.success) {
                    return initResult;
                }
                sessionData = initResult.data.user;
            }

            // Update last activity
            sessionData.lastActivity = new Date().toISOString();
            this.userSessions.set(userId, sessionData);

            return {
                success: true,
                data: sessionData
            };

        } catch (error) {
            logger.error('Failed to get user session', { userId, error: error.message });
            return {
                success: false,
                error: {
                    code: 'SESSION_RETRIEVAL_FAILED',
                    message: 'Failed to retrieve user session'
                }
            };
        }
    }

    /**
     * Update user preferences with persistence
     */
    async updateUserPreferences(userId, preferences) {
        try {
            // Get current preferences
            const currentPrefs = this.userPreferences.get(userId) || {};

            // Merge with new preferences
            const updatedPrefs = { ...currentPrefs, ...preferences };

            // Update memory cache
            this.userPreferences.set(userId, updatedPrefs);

            // Update session data
            const sessionData = this.userSessions.get(userId);
            if (sessionData) {
                sessionData.preferences = updatedPrefs;
                sessionData.lastActivity = new Date().toISOString();
                this.userSessions.set(userId, sessionData);
            }

            // Persist to database (async, don't wait)
            this.persistUserPreferences(userId, updatedPrefs).catch(error => {
                logger.error('Failed to persist user preferences', { userId, error: error.message });
            });

            logger.info('User preferences updated', {
                userId,
                preferencesCount: Object.keys(updatedPrefs).length
            });

            return {
                success: true,
                data: {
                    preferences: updatedPrefs,
                    updated: true
                }
            };

        } catch (error) {
            logger.error('Failed to update user preferences', { userId, error: error.message });
            return {
                success: false,
                error: {
                    code: 'PREFERENCES_UPDATE_FAILED',
                    message: 'Failed to update user preferences'
                }
            };
        }
    }

    /**
     * Record user activity for session persistence
     */
    async recordUserActivity(userId, activityData) {
        try {
            const activity = {
                timestamp: new Date().toISOString(),
                type: activityData.type || 'unknown',
                action: activityData.action || 'unknown',
                details: activityData.details || {},
                sessionId: activityData.sessionId
            };

            // Get current activity cache
            let userActivity = this.userActivityCache.get(userId) || [];

            // Add new activity
            userActivity.unshift(activity);

            // Keep only recent activities (last 50)
            userActivity = userActivity.slice(0, 50);

            // Update cache
            this.userActivityCache.set(userId, userActivity);

            // Update session last activity
            const sessionData = this.userSessions.get(userId);
            if (sessionData) {
                sessionData.lastActivity = new Date().toISOString();
                this.userSessions.set(userId, sessionData);
            }

            return {
                success: true,
                data: {
                    activityRecorded: true,
                    recentActivitiesCount: userActivity.length
                }
            };

        } catch (error) {
            logger.error('Failed to record user activity', { userId, error: error.message });
            return {
                success: false,
                error: {
                    code: 'ACTIVITY_RECORDING_FAILED',
                    message: 'Failed to record user activity'
                }
            };
        }
    }

    /**
     * Get user-specific data namespace for isolation
     */
    getUserDataNamespace(userId) {
        return {
            screenshotBucket: `user_${userId}_screenshots`,
            analysisBucket: `user_${userId}_analysis`,
            sessionBucket: `user_${userId}_sessions`,
            goalsBucket: `user_${userId}_goals`,
            settingsBucket: `user_${userId}_settings`
        };
    }

    /**
     * Create isolated storage keys for user data
     */
    createIsolatedStorageKey(userId, dataType, identifier) {
        const namespace = this.getUserDataNamespace(userId);
        const bucket = namespace[`${dataType}Bucket`];

        if (!bucket) {
            throw new Error(`Unknown data type: ${dataType}`);
        }

        return `${bucket}/${identifier}`;
    }

    /**
     * Validate that data belongs to specific user
     */
    async validateUserDataAccess(userId, dataId, dataType) {
        try {
            const namespace = this.getUserDataNamespace(userId);
            const expectedPrefix = namespace[`${dataType}Bucket`];

            // Check if data ID contains user's namespace prefix
            if (dataId.includes(`user_${userId}_`)) {
                return { success: true, hasAccess: true };
            }

            return {
                success: true,
                hasAccess: false,
                reason: 'Data does not belong to user'
            };

        } catch (error) {
            return {
                success: false,
                error: {
                    code: 'ACCESS_VALIDATION_FAILED',
                    message: 'Failed to validate user data access'
                }
            };
        }
    }

    /**
     * Clean up expired sessions
     */
    async cleanupExpiredSessions() {
        try {
            const now = new Date();
            let cleanedCount = 0;

            for (const [userId, sessionData] of this.userSessions.entries()) {
                const lastActivity = new Date(sessionData.lastActivity);
                const timeSinceActivity = now - lastActivity;

                if (timeSinceActivity > this.sessionConfig.maxSessionAge) {
                    // Persist data before cleanup
                    await this.persistUserData(userId, sessionData);

                    // Remove from memory
                    this.userSessions.delete(userId);
                    this.userPreferences.delete(userId);
                    this.userActivityCache.delete(userId);

                    cleanedCount++;
                }
            }

            logger.info('Cleaned up expired sessions', { cleanedCount });
            return { cleanedCount };

        } catch (error) {
            logger.error('Failed to cleanup expired sessions', { error: error.message });
            return { cleanedCount: 0, error: error.message };
        }
    }

    /**
     * Load user preferences from database
     */
    async loadUserPreferences(userId) {
        try {
            // In production, this would query user_settings table
            // For now, return empty preferences
            return {
                theme: 'light',
                notifications: true,
                defaultDashboard: 'overview',
                timezone: 'UTC',
                language: 'en',
                screenshotInterval: 15,
                aiAnalysisEnabled: true,
                lastSeenFeatures: [],
                onboardingCompleted: false
            };
        } catch (error) {
            logger.error('Failed to load user preferences', { userId, error: error.message });
            return {};
        }
    }

    /**
     * Load recent activity from database
     */
    async loadRecentActivity(userId) {
        try {
            // In production, this would query activity logs
            // For now, return empty array
            return [];
        } catch (error) {
            logger.error('Failed to load recent activity', { userId, error: error.message });
            return [];
        }
    }

    /**
     * Persist user preferences to database
     */
    async persistUserPreferences(userId, preferences) {
        try {
            // In production, this would save to user_settings table
            logger.debug('Persisting user preferences', {
                userId,
                preferencesCount: Object.keys(preferences).length
            });
            return true;
        } catch (error) {
            logger.error('Failed to persist user preferences', { userId, error: error.message });
            throw error;
        }
    }

    /**
     * Persist user session data to database
     */
    async persistUserData(userId, sessionData) {
        try {
            // Persist preferences
            if (sessionData.preferences) {
                await this.persistUserPreferences(userId, sessionData.preferences);
            }

            // Persist recent activity
            if (sessionData.recentActivity) {
                // In production, save activity to database
            }

            logger.debug('Persisted user session data', { userId });
            return true;
        } catch (error) {
            logger.error('Failed to persist user data', { userId, error: error.message });
            throw error;
        }
    }

    /**
     * Start auto-save interval for session persistence
     */
    startAutoSave() {
        setInterval(async () => {
            try {
                for (const [userId, sessionData] of this.userSessions.entries()) {
                    await this.persistUserData(userId, sessionData);
                }
            } catch (error) {
                logger.error('Auto-save failed', { error: error.message });
            }
        }, this.sessionConfig.autoSaveInterval);
    }

    /**
     * Get session statistics
     */
    getSessionStats() {
        return {
            activeSessions: this.userSessions.size,
            cachedPreferences: this.userPreferences.size,
            cachedActivities: this.userActivityCache.size,
            memoryUsage: {
                sessions: JSON.stringify(Array.from(this.userSessions.values())).length,
                preferences: JSON.stringify(Array.from(this.userPreferences.values())).length,
                activities: JSON.stringify(Array.from(this.userActivityCache.values())).length
            }
        };
    }

    /**
     * Force persist all user data (for shutdown)
     */
    async persistAllUserData() {
        try {
            const persistPromises = [];

            for (const [userId, sessionData] of this.userSessions.entries()) {
                persistPromises.push(this.persistUserData(userId, sessionData));
            }

            await Promise.all(persistPromises);
            logger.info('Persisted all user session data', { userCount: persistPromises.length });

        } catch (error) {
            logger.error('Failed to persist all user data', { error: error.message });
            throw error;
        }
    }
}

module.exports = UserSessionService;