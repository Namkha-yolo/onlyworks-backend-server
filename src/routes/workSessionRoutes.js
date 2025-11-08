const express = require('express');
const WorkSessionController = require('../controllers/WorkSessionController');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const workSessionController = new WorkSessionController();

// Apply authentication to all work session routes
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