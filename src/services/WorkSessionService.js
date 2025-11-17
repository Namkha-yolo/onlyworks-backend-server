const WorkSessionRepository = require('../repositories/WorkSessionRepository');
const UserService = require('./UserService');
const AlgorithmicAnalysisService = require('./AlgorithmicAnalysisService');
const AIAnalysisService = require('./AIAnalysisService');
const { ApiError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class WorkSessionService {
  constructor() {
    this.workSessionRepository = new WorkSessionRepository();
    this.userService = new UserService();
    this.algorithmicAnalysisService = new AlgorithmicAnalysisService();
    this.aiAnalysisService = new AIAnalysisService();
  }

  async startSession(userId, sessionData) {
    try {
      logger.info('Starting work session', { userId, sessionData });

      // Validate user exists
      logger.info('Validating user exists', { userId });
      await this.userService.findById(userId);
      logger.info('User validated successfully', { userId });

      // Check if user already has an active session
      logger.info('Checking for active sessions', { userId });
      const activeSession = await this.workSessionRepository.findActiveSession(userId);
      if (activeSession) {
        logger.warn('User already has active session', { userId, activeSessionId: activeSession.id });
        throw new ApiError('RESOURCE_CONFLICT', {
          message: 'User already has an active work session',
          active_session_id: activeSession.id
        });
      }
      logger.info('No active session found, proceeding with creation', { userId });

      // Create the session
      logger.info('Creating new session', { userId, sessionData });
      const session = await this.workSessionRepository.startSession(userId, sessionData);
      logger.info('Session created successfully', { userId, sessionId: session.id });

      logger.business('work_session_started', {
        user_id: userId,
        session_id: session.id,
        session_name: sessionData.session_name
      });

      return session;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error starting work session', {
        error: error.message,
        stack: error.stack,
        userId,
        sessionData
      });
      throw new ApiError('INTERNAL_ERROR', { operation: 'start_work_session' });
    }
  }

  async endSession(sessionId, userId) {
    try {
      // Validate session exists and belongs to user
      const session = await this.workSessionRepository.findById(sessionId, userId);
      if (!session) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'work_session' });
      }

      if (session.status === 'completed') {
        throw new ApiError('RESOURCE_CONFLICT', {
          message: 'Work session is already completed'
        });
      }

      const updatedSession = await this.workSessionRepository.endSession(sessionId, userId);

      logger.business('work_session_ended', {
        user_id: userId,
        session_id: sessionId,
        duration_seconds: updatedSession.duration_seconds
      });

      return updatedSession;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error ending work session', { error: error.message, sessionId, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'end_work_session' });
    }
  }

  async pauseSession(sessionId, userId) {
    try {
      const session = await this.workSessionRepository.findById(sessionId, userId);
      if (!session) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'work_session' });
      }

      if (session.status !== 'active') {
        throw new ApiError('RESOURCE_CONFLICT', {
          message: 'Can only pause active sessions',
          current_status: session.status
        });
      }

      const updatedSession = await this.workSessionRepository.pauseSession(sessionId, userId);

      logger.business('work_session_paused', {
        user_id: userId,
        session_id: sessionId
      });

      return updatedSession;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error pausing work session', { error: error.message, sessionId, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'pause_work_session' });
    }
  }

  async resumeSession(sessionId, userId) {
    try {
      const session = await this.workSessionRepository.findById(sessionId, userId);
      if (!session) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'work_session' });
      }

      if (session.status !== 'paused') {
        throw new ApiError('RESOURCE_CONFLICT', {
          message: 'Can only resume paused sessions',
          current_status: session.status
        });
      }

      const updatedSession = await this.workSessionRepository.resumeSession(sessionId, userId);

      logger.business('work_session_resumed', {
        user_id: userId,
        session_id: sessionId
      });

      return updatedSession;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error resuming work session', { error: error.message, sessionId, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'resume_work_session' });
    }
  }

  async getActiveSession(userId) {
    try {
      const session = await this.workSessionRepository.findActiveSession(userId);
      return session;
    } catch (error) {
      logger.error('Error getting active session', { error: error.message, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_active_session' });
    }
  }

  async getUserSessions(userId, options = {}) {
    try {
      const sessions = await this.workSessionRepository.findUserSessions(userId, options);
      return sessions;
    } catch (error) {
      logger.error('Error getting user sessions', { error: error.message, userId, options });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_user_sessions' });
    }
  }

  async getSessionById(sessionId, userId, options = {}) {
    try {
      const session = await this.workSessionRepository.findById(sessionId, userId);
      if (!session) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'work_session' });
      }

      if (options.includeAnalysis) {
        return await this.enrichSessionWithAnalysis(session, options);
      }

      return session;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error getting session by ID', { error: error.message, sessionId, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_session_by_id' });
    }
  }

  async updateSessionScores(sessionId, userId, scores) {
    try {
      // Validate scores
      const { productivity_score, focus_score } = scores;

      if (productivity_score !== undefined && (productivity_score < 0 || productivity_score > 100)) {
        throw new ApiError('VALIDATION_ERROR', {
          field: 'productivity_score',
          message: 'Productivity score must be between 0 and 100'
        });
      }

      if (focus_score !== undefined && (focus_score < 0 || focus_score > 100)) {
        throw new ApiError('VALIDATION_ERROR', {
          field: 'focus_score',
          message: 'Focus score must be between 0 and 100'
        });
      }

      const updatedSession = await this.workSessionRepository.updateScores(sessionId, userId, scores);

      logger.business('session_scores_updated', {
        user_id: userId,
        session_id: sessionId,
        productivity_score,
        focus_score
      });

      return updatedSession;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error updating session scores', { error: error.message, sessionId, userId, scores });
      throw new ApiError('INTERNAL_ERROR', { operation: 'update_session_scores' });
    }
  }

  async getSessionStats(userId, dateFrom, dateTo) {
    try {
      const stats = await this.workSessionRepository.getSessionStats(userId, dateFrom, dateTo);
      return stats;
    } catch (error) {
      logger.error('Error getting session stats', { error: error.message, userId, dateFrom, dateTo });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_session_stats' });
    }
  }

  async enrichSessionWithAnalysis(session, options = {}) {
    try {
      const { includeAI = true, includeAlgorithmic = true } = options;

      // Always include core session data
      const enrichedSession = {
        core: {
          ...session,
          // Core data that exists without any analysis
          computed_metrics: await this.calculateCoreMetrics(session)
        },
        analysis: {
          ai_available: false,
          algorithmic_available: false,
          ai_insights: null,
          algorithmic_insights: null
        }
      };

      // Get activity events for analysis
      const activityEvents = await this.workSessionRepository.getSessionActivityEvents(session.id);

      // Add algorithmic analysis (always available)
      if (includeAlgorithmic) {
        try {
          const algorithmicInsights = await this.generateAlgorithmicAnalysis(session, activityEvents);
          enrichedSession.analysis.algorithmic_available = true;
          enrichedSession.analysis.algorithmic_insights = algorithmicInsights;
        } catch (error) {
          logger.error('Failed to generate algorithmic analysis', { error: error.message, sessionId: session.id });
        }
      }

      // Add AI analysis (optional)
      if (includeAI) {
        try {
          const aiInsights = await this.generateAIAnalysis(session, activityEvents);
          if (aiInsights) {
            enrichedSession.analysis.ai_available = true;
            enrichedSession.analysis.ai_insights = aiInsights;
          }
        } catch (error) {
          logger.warn('AI analysis not available', { error: error.message, sessionId: session.id });
          // Don't throw - AI is optional
        }
      }

      return enrichedSession;
    } catch (error) {
      logger.error('Error enriching session with analysis', { error: error.message, sessionId: session.id });
      // Return core data even if analysis fails
      return {
        core: session,
        analysis: {
          ai_available: false,
          algorithmic_available: false,
          ai_insights: null,
          algorithmic_insights: null,
          error: 'Analysis generation failed'
        }
      };
    }
  }

  async calculateCoreMetrics(session) {
    try {
      // Pure mathematical calculations that don't require AI
      const metrics = {
        duration_minutes: session.duration_seconds ? Math.round(session.duration_seconds / 60) : 0,
        duration_hours: session.duration_seconds ? Math.round((session.duration_seconds / 3600) * 100) / 100 : 0,
        is_completed: session.status === 'completed',
        has_goal: !!session.goal_description,
        calculated_at: new Date().toISOString()
      };

      // Get basic activity counts
      const activitySummary = await this.workSessionRepository.getSessionActivitySummary(session.id);
      if (activitySummary) {
        metrics.total_keystrokes = activitySummary.total_keystrokes || 0;
        metrics.total_clicks = activitySummary.total_clicks || 0;
        metrics.total_activities = metrics.total_keystrokes + metrics.total_clicks;
        metrics.activity_rate_per_minute = metrics.duration_minutes > 0 ?
          Math.round((metrics.total_activities / metrics.duration_minutes) * 100) / 100 : 0;
      }

      return metrics;
    } catch (error) {
      logger.error('Error calculating core metrics', { error: error.message, sessionId: session.id });
      return {
        duration_minutes: 0,
        duration_hours: 0,
        is_completed: false,
        has_goal: false,
        error: 'Metrics calculation failed'
      };
    }
  }

  async generateAlgorithmicAnalysis(session, activityEvents = []) {
    try {
      const productivityAnalysis = this.algorithmicAnalysisService.calculateProductivityScore(session, activityEvents);
      const focusAnalysis = this.algorithmicAnalysisService.calculateFocusScore(session, activityEvents);
      const sessionSummary = this.algorithmicAnalysisService.generateSessionSummary(session, activityEvents);

      return {
        productivity_score: productivityAnalysis.score,
        productivity_factors: productivityAnalysis.factors,
        focus_score: focusAnalysis.score,
        focus_factors: focusAnalysis.factors,
        summary: sessionSummary,
        method: 'algorithmic',
        version: '1.0',
        generated_at: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Error generating algorithmic analysis', { error: error.message, sessionId: session.id });
      throw error;
    }
  }

  async generateAIAnalysis(session, activityEvents = []) {
    try {
      // Check if AI is available
      const aiHealth = await this.aiAnalysisService.healthCheck();
      if (!aiHealth.ai_service_available) {
        return null; // AI not available, return null
      }

      // Try to get existing AI analysis first
      const existingAnalysis = await this.workSessionRepository.getAIAnalysis(session.id);
      if (existingAnalysis) {
        return {
          ...existingAnalysis,
          method: 'ai',
          cached: true
        };
      }

      // Generate new AI analysis if needed
      // Note: This would typically be done asynchronously
      logger.info('AI analysis available but not implemented for real-time generation', { sessionId: session.id });
      return null;
    } catch (error) {
      logger.warn('AI analysis failed', { error: error.message, sessionId: session.id });
      return null; // AI failure is not fatal
    }
  }

  async getSessionCoreData(sessionId, userId) {
    try {
      const session = await this.workSessionRepository.findById(sessionId, userId);
      if (!session) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'work_session' });
      }

      const coreMetrics = await this.calculateCoreMetrics(session);

      return {
        session: {
          ...session,
          computed_metrics: coreMetrics
        },
        note: 'This endpoint returns only core data without any AI analysis'
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error getting session core data', { error: error.message, sessionId, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_session_core_data' });
    }
  }

  async getSessionAnalysisOnly(sessionId, userId, analysisType = 'both') {
    try {
      const session = await this.workSessionRepository.findById(sessionId, userId);
      if (!session) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'work_session' });
      }

      const activityEvents = await this.workSessionRepository.getSessionActivityEvents(session.id);
      const analysis = { available: {}, results: {} };

      if (analysisType === 'algorithmic' || analysisType === 'both') {
        try {
          analysis.results.algorithmic = await this.generateAlgorithmicAnalysis(session, activityEvents);
          analysis.available.algorithmic = true;
        } catch (error) {
          analysis.available.algorithmic = false;
          analysis.results.algorithmic_error = error.message;
        }
      }

      if (analysisType === 'ai' || analysisType === 'both') {
        try {
          analysis.results.ai = await this.generateAIAnalysis(session, activityEvents);
          analysis.available.ai = !!analysis.results.ai;
        } catch (error) {
          analysis.available.ai = false;
          analysis.results.ai_error = error.message;
        }
      }

      return analysis;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error getting session analysis', { error: error.message, sessionId, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_session_analysis' });
    }
  }

  async createSessionWithGoals(userId, sessionData) {
    try {
      logger.info('Creating work session with goals', { userId, sessionData });

      // Validate user exists
      await this.userService.findById(userId);

      // Check if user already has an active session
      const activeSession = await this.workSessionRepository.findActiveSession(userId);
      if (activeSession) {
        logger.warn('User already has active session', { userId, activeSessionId: activeSession.id });
        throw new ApiError('RESOURCE_CONFLICT', {
          operation: 'create_session_with_goals',
          details: 'User already has an active session. End the current session before starting a new one.',
          activeSessionId: activeSession.id
        });
      }

      // Create the session
      const session = await this.workSessionRepository.startSession(userId, {
        session_name: sessionData.session_name,
        goal_description: sessionData.goals.join('; '), // Store goals as semicolon-separated string for now
        status: 'active'
      });

      // Create individual session goals in session_goals table
      if (sessionData.goals && sessionData.goals.length > 0) {
        const SessionGoalRepository = require('../repositories/SessionGoalRepository');
        const sessionGoalRepo = new SessionGoalRepository();

        for (let i = 0; i < sessionData.goals.length; i++) {
          const goalText = sessionData.goals[i];
          await sessionGoalRepo.create({
            user_id: userId,
            session_id: session.id,
            goal_text: goalText,
            status: 'pending',
            priority: 'medium',
            order_index: i + 1
          });
        }
      }

      logger.info('Session with goals created successfully', { userId, sessionId: session.id, goalCount: sessionData.goals.length });

      return session;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error creating session with goals', { error: error.message, userId, sessionData });
      throw new ApiError('INTERNAL_ERROR', { operation: 'create_session_with_goals' });
    }
  }

  async getSessionDetails(userId, sessionId) {
    try {
      logger.info('Fetching session details', { userId, sessionId });

      // Get the base session
      const session = await this.workSessionRepository.findByIdAndUser(sessionId, userId);
      if (!session) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'work_session', sessionId });
      }

      // Get session goals
      let goals = [];
      try {
        const SessionGoalRepository = require('../repositories/SessionGoalRepository');
        const sessionGoalRepo = new SessionGoalRepository();
        goals = await sessionGoalRepo.getSessionGoals(sessionId);
      } catch (error) {
        logger.warn('Could not fetch session goals', { sessionId, error: error.message });
      }

      // Get session reports
      let reports = [];
      try {
        const ReportsRepository = require('../repositories/ReportsRepository');
        const reportsRepo = new ReportsRepository();
        const sessionReports = await reportsRepo.getSessionReports(sessionId);
        reports = sessionReports || [];
      } catch (error) {
        logger.warn('Could not fetch session reports', { sessionId, error: error.message });
      }

      // Get session summaries
      let summaries = [];
      try {
        const { logger: serviceLogger } = require('../utils/logger');
        const supabase = require('../config/supabase');

        const { data: sessionSummaries, error: summariesError } = await supabase.client
          .from('session_summaries')
          .select('*')
          .eq('session_id', sessionId)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (summariesError) {
          serviceLogger.warn('Error fetching session summaries', { sessionId, error: summariesError.message });
        } else {
          summaries = sessionSummaries || [];
        }
      } catch (error) {
        logger.warn('Could not fetch session summaries', { sessionId, error: error.message });
      }

      // Combine all the data
      const sessionDetails = {
        ...session,
        goals: goals,
        reports: reports,
        summaries: summaries
      };

      logger.info('Session details retrieved successfully', {
        userId,
        sessionId,
        goalCount: goals.length,
        reportCount: reports.length,
        summaryCount: summaries.length
      });

      return sessionDetails;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error fetching session details', { error: error.message, userId, sessionId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_session_details' });
    }
  }
}

module.exports = WorkSessionService;