const BaseRepository = require('./BaseRepository');

class WorkSessionRepository extends BaseRepository {
  constructor() {
    super('screenshot_sessions');
  }

  async findActiveSession(userId) {
    try {
      const { logger } = require('../utils/logger');
      logger.info(`Finding active session for user ${userId} in table ${this.tableName}`);

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .in('status', ['active', 'paused'])
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error(`Error finding active session`, {
          error: error.message,
          code: error.code,
          details: error.details,
          userId,
          tableName: this.tableName
        });
        throw error;
      }

      logger.info(`Active session query result`, { data, userId });
      return data;
    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error(`Exception in findActiveSession`, {
        error: error.message,
        userId,
        tableName: this.tableName
      });
      throw error;
    }
  }

  async startSession(userId, sessionData) {
    return this.create({
      user_id: userId,
      session_name: sessionData.session_name,
      goal_description: sessionData.goal_description,
      started_at: new Date().toISOString(),
      status: 'active'
    });
  }

  async endSession(sessionId, userId) {
    const endTime = new Date().toISOString();
    return this.update(sessionId, {
      ended_at: endTime,
      status: 'completed'
    }, userId);
  }

  async pauseSession(sessionId, userId) {
    return this.update(sessionId, {
      status: 'paused'
    }, userId);
  }

  async resumeSession(sessionId, userId) {
    return this.update(sessionId, {
      status: 'active'
    }, userId);
  }

  async updateScores(sessionId, userId, scores) {
    const updateData = {};

    if (scores.productivity_score !== undefined) {
      updateData.productivity_score = scores.productivity_score;
    }

    if (scores.focus_score !== undefined) {
      updateData.focus_score = scores.focus_score;
    }

    return this.update(sessionId, updateData, userId);
  }

  async getSessionById(sessionId, userId) {
    try {
      const { logger } = require('../utils/logger');

      // Use admin client for screenshot_sessions table to bypass RLS policies
      const client = this.supabaseAdmin || this.supabase;

      logger.info('Getting session by ID', {
        sessionId,
        userId,
        tableName: this.tableName,
        usingAdminClient: !!(this.supabaseAdmin)
      });

      const { data, error } = await client
        .from(this.tableName)
        .select('*')
        .eq('id', sessionId)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.error('Error in getSessionById', {
          error: error.message,
          code: error.code,
          sessionId,
          userId
        });
        throw error;
      }

      logger.info('Session retrieved successfully', {
        sessionId,
        userId,
        found: !!data
      });
      return data;
    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Exception in getSessionById', {
        error: error.message,
        sessionId,
        userId
      });
      throw error;
    }
  }

  async getUserSessions(userId, options = {}) {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId);

      if (options.startDate) {
        query = query.gte('started_at', options.startDate);
      }

      if (options.endDate) {
        query = query.lte('started_at', options.endDate);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      query = query.order('started_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      throw error;
    }
  }

  async getSessionStats(userId, dateFrom, dateTo) {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select('duration_seconds, productivity_score, focus_score, status')
        .eq('user_id', userId);

      if (dateFrom) {
        query = query.gte('started_at', dateFrom);
      }

      if (dateTo) {
        query = query.lte('started_at', dateTo);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const sessions = data || [];
      const completedSessions = sessions.filter(s => s.status === 'completed' && s.duration_seconds);

      return {
        totalSessions: sessions.length,
        completedSessions: completedSessions.length,
        totalDurationSeconds: completedSessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0),
        averageProductivityScore: completedSessions.length > 0
          ? completedSessions.reduce((sum, s) => sum + (s.productivity_score || 0), 0) / completedSessions.length
          : 0,
        averageFocusScore: completedSessions.length > 0
          ? completedSessions.reduce((sum, s) => sum + (s.focus_score || 0), 0) / completedSessions.length
          : 0
      };
    } catch (error) {
      throw error;
    }
  }

  async updateSessionMetadata(sessionId, metadata) {
    try {
      // Try to store metadata in a simple text field for maximum compatibility
      const updateData = {
        session_notes: typeof metadata === 'string' ? metadata : JSON.stringify(metadata),
        updated_at: new Date().toISOString()
      };

      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updateData)
        .eq('id', sessionId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      // Ignore metadata update errors gracefully
      console.warn('Could not update session metadata:', error.message);
      return null;
    }
  }
}

module.exports = WorkSessionRepository;