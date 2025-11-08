const WorkSessionService = require('../services/WorkSessionService');
const { asyncHandler, validateRequired } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class WorkSessionController {
  constructor() {
    this.workSessionService = new WorkSessionService();
  }

  // Start a new work session
  startSession = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const sessionData = req.body;

    logger.info('Starting work session', { userId, sessionData });

    const session = await this.workSessionService.startSession(userId, sessionData);

    res.status(201).json({
      success: true,
      data: session,
      message: 'Work session started successfully'
    });
  });

  // End current work session
  endSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { userId } = req.user;

    logger.info('Ending work session', { userId, sessionId });

    const session = await this.workSessionService.endSession(sessionId, userId);

    res.json({
      success: true,
      data: session,
      message: 'Work session ended successfully'
    });
  });

  // Pause current work session
  pauseSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { userId } = req.user;

    logger.info('Pausing work session', { userId, sessionId });

    const session = await this.workSessionService.pauseSession(sessionId, userId);

    res.json({
      success: true,
      data: session,
      message: 'Work session paused successfully'
    });
  });

  // Resume paused work session
  resumeSession = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { userId } = req.user;

    logger.info('Resuming work session', { userId, sessionId });

    const session = await this.workSessionService.resumeSession(sessionId, userId);

    res.json({
      success: true,
      data: session,
      message: 'Work session resumed successfully'
    });
  });

  // Get current active session
  getActiveSession = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    const session = await this.workSessionService.getActiveSession(userId);

    res.json({
      success: true,
      data: session
    });
  });

  // Get specific session by ID with optional analysis
  getSessionById = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { userId } = req.user;
    const { include_analysis, include_ai, include_algorithmic } = req.query;

    const options = {
      includeAnalysis: include_analysis === 'true',
      includeAI: include_ai !== 'false', // default true
      includeAlgorithmic: include_algorithmic !== 'false' // default true
    };

    const session = await this.workSessionService.getSessionById(sessionId, userId, options);

    res.json({
      success: true,
      data: session,
      meta: {
        analysis_requested: options.includeAnalysis,
        ai_requested: options.includeAI,
        algorithmic_requested: options.includeAlgorithmic
      }
    });
  });

  // Get user's work sessions with pagination and filters
  getUserSessions = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const {
      page = 1,
      limit = 20,
      status,
      date_from,
      date_to,
      order_by = 'started_at',
      order_direction = 'desc'
    } = req.query;

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
      dateFrom: date_from,
      dateTo: date_to,
      orderBy: order_by,
      orderDirection: order_direction
    };

    logger.info('Getting user sessions', { userId, options });

    const sessions = await this.workSessionService.getUserSessions(userId, options);

    res.json({
      success: true,
      data: sessions
    });
  });

  // Update session scores
  updateSessionScores = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { userId } = req.user;
    const { productivity_score, focus_score } = req.body;

    logger.info('Updating session scores', { userId, sessionId, productivity_score, focus_score });

    const scores = { productivity_score, focus_score };
    const session = await this.workSessionService.updateSessionScores(sessionId, userId, scores);

    res.json({
      success: true,
      data: session,
      message: 'Session scores updated successfully'
    });
  });

  // Get session statistics
  getSessionStats = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { date_from, date_to } = req.query;

    logger.info('Getting session statistics', { userId, date_from, date_to });

    const stats = await this.workSessionService.getSessionStats(userId, date_from, date_to);

    res.json({
      success: true,
      data: stats
    });
  });

  // Get session core data only (guaranteed non-AI)
  getSessionCoreData = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { userId } = req.user;

    logger.info('Getting session core data', { userId, sessionId });

    const coreData = await this.workSessionService.getSessionCoreData(sessionId, userId);

    res.json({
      success: true,
      data: coreData,
      meta: {
        data_type: 'core_only',
        ai_independent: true,
        note: 'This endpoint returns only core session data without any AI analysis'
      }
    });
  });

  // Get session analysis only
  getSessionAnalysis = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { userId } = req.user;
    const { type = 'both' } = req.query; // 'ai', 'algorithmic', or 'both'

    logger.info('Getting session analysis', { userId, sessionId, type });

    const analysis = await this.workSessionService.getSessionAnalysisOnly(sessionId, userId, type);

    res.json({
      success: true,
      data: analysis,
      meta: {
        data_type: 'analysis_only',
        analysis_type: type,
        note: 'This endpoint returns only analysis results without core session data'
      }
    });
  });

  // Enhanced endpoint that clearly separates core data from AI insights
  getSessionComplete = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { userId } = req.user;

    logger.info('Getting complete session data', { userId, sessionId });

    const session = await this.workSessionService.getSessionById(sessionId, userId, {
      includeAnalysis: true,
      includeAI: true,
      includeAlgorithmic: true
    });

    // Structure response to clearly show what works without AI
    const response = {
      success: true,
      data: {
        // Core data that ALWAYS works without AI
        core_data: session.core || session,

        // Analysis that may or may not be available
        analysis: session.analysis || {
          ai_available: false,
          algorithmic_available: false,
          ai_insights: null,
          algorithmic_insights: null
        }
      },
      meta: {
        data_guarantee: {
          core_data: 'Always available - no AI required',
          algorithmic_analysis: session.analysis?.algorithmic_available ? 'Available' : 'Processing or failed',
          ai_analysis: session.analysis?.ai_available ? 'Available' : 'Not available or disabled'
        },
        reliability: {
          core_functionality: 'Works without AI',
          ai_enhanced_features: 'Optional - degrades gracefully if unavailable'
        }
      }
    };

    res.json(response);
  });
}

module.exports = WorkSessionController;