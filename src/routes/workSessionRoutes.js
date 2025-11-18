const express = require('express');
const WorkSessionController = require('../controllers/WorkSessionController');
const { authenticateUser } = require('../middleware/auth');
const redis = require('../config/redis');
const { getSupabaseClient } = require('../config/database');
const { logger } = require('../utils/logger');

const router = express.Router();
const workSessionController = new WorkSessionController();

// Test endpoint for database schema debugging (no auth required)
router.post('/test-create', async (req, res) => {
  try {
    const WorkSessionRepository = require('../repositories/WorkSessionRepository');
    const { logger } = require('../utils/logger');

    logger.info('Testing work session creation without auth');

    const workSessionRepo = new WorkSessionRepository();
    const testSession = await workSessionRepo.create({
      user_id: '8116fff2-0a45-43a1-a242-9ab7656fd2a8',
      session_name: 'Test Session',
      goal_description: 'Database schema test',
      started_at: new Date().toISOString(),
      status: 'active'
    });

    logger.info('Test session created successfully', { sessionId: testSession.id });

    res.json({
      success: true,
      data: testSession,
      message: 'Test session created successfully'
    });
  } catch (error) {
    console.error('Test session creation failed', {
      error: error.message,
      code: error.code,
      details: error.details
    });

    res.status(500).json({
      success: false,
      error: {
        message: error.message,
        code: error.code,
        details: error.details
      }
    });
  }
});

// Apply authentication to all other work session routes
router.use(authenticateUser);

// Start a new work session
router.post('/start', workSessionController.startSession);

// Create session with goals
router.post('/create-with-goals', workSessionController.createSessionWithGoals);

// Get current active session
router.get('/active', workSessionController.getActiveSession);

// Force end all active sessions (cleanup utility)
router.post('/force-end-all', workSessionController.forceEndAllSessions);

// Get user's work sessions with pagination and filters
router.get('/', workSessionController.getUserSessions);

// Get specific session by ID (with optional analysis)
router.get('/:sessionId', workSessionController.getSessionById);

// Get session details with related data (goals, reports, summaries)
router.get('/:sessionId/details', workSessionController.getSessionDetails);

// Get session core data only (guaranteed non-AI)
router.get('/:sessionId/core', workSessionController.getSessionCoreData);

// Get session analysis only
router.get('/:sessionId/analysis', workSessionController.getSessionAnalysis);

// Get complete session with clear AI/non-AI separation
router.get('/:sessionId/complete', workSessionController.getSessionComplete);

// End work session
router.put('/:sessionId/end', workSessionController.endSession);

// Pause work session
router.put('/:sessionId/pause', workSessionController.pauseSession);

// Resume work session
router.put('/:sessionId/resume', workSessionController.resumeSession);

// Update session scores
router.put('/:sessionId/scores', workSessionController.updateSessionScores);

// Queue session for GPU worker processing
router.post('/:sessionId/queue', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { userId } = req.user;
    const supabase = getSupabaseClient();

    logger.info('Queueing session for GPU processing', { sessionId, userId });

    // Validate session exists and belongs to user
    const { data: session, error: sessionError } = await supabase
      .from('screenshot_sessions')
      .select('id, user_id, status')
      .eq('id', sessionId)
      .eq('user_id', userId)
      .single();

    if (sessionError || !session) {
      logger.warn('Session not found for queuing', { sessionId, userId, error: sessionError?.message });
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Get all screenshots for this session
    const { data: screenshots, error: screenshotsError } = await supabase
      .from('screenshots')
      .select('id')
      .eq('session_id', sessionId)
      .eq('user_id', userId);

    if (screenshotsError) {
      logger.error('Failed to fetch screenshots', { sessionId, userId, error: screenshotsError.message });
      throw screenshotsError;
    }

    if (!screenshots || screenshots.length === 0) {
      logger.warn('No screenshots found in session', { sessionId, userId });
      return res.status(400).json({
        success: false,
        error: 'No screenshots found in session'
      });
    }

    // Check if Redis is available
    if (!redis) {
      logger.error('Redis not configured', { sessionId, userId });
      return res.status(503).json({
        success: false,
        error: 'Queue service not available - Redis not configured'
      });
    }

    // Create task for GPU worker
    const task = {
      session_id: sessionId,
      user_id: userId,
      screenshot_ids: screenshots.map(s => s.id),
      timestamp: new Date().toISOString()
    };

    // Push to Redis queue - GPU worker will BRPOP from 'session_queue'
    await redis.lpush('session_queue', JSON.stringify(task));

    logger.info('Session queued successfully', {
      sessionId,
      userId,
      screenshotCount: screenshots.length
    });

    return res.json({
      success: true,
      session_id: sessionId,
      screenshot_count: screenshots.length,
      queued_at: new Date().toISOString()
    });

  } catch (error) {
    logger.error('Error queuing session', {
      sessionId: req.params.sessionId,
      userId: req.user?.userId,
      error: error.message,
      stack: error.stack
    });

    return res.status(500).json({
      success: false,
      error: 'Failed to queue session',
      message: error.message
    });
  }
});

// Get session statistics
router.get('/stats/summary', workSessionController.getSessionStats);

module.exports = router;