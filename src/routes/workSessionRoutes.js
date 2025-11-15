const express = require('express');
const WorkSessionController = require('../controllers/WorkSessionController');
const { authenticateUser } = require('../middleware/auth');

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

// Get current active session
router.get('/active', workSessionController.getActiveSession);

// Get user's work sessions with pagination and filters
router.get('/', workSessionController.getUserSessions);

// Get specific session by ID (with optional analysis)
router.get('/:sessionId', workSessionController.getSessionById);

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

// Get session statistics
router.get('/stats/summary', workSessionController.getSessionStats);

module.exports = router;