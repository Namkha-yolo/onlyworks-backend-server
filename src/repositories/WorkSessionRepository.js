const BaseRepository = require('./BaseRepository');

class WorkSessionRepository extends BaseRepository {
  constructor() {
    super('work_sessions');
  }

  async findActiveSession(userId) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .in('status', ['active', 'paused'])
        .order('started_at', { ascending: false })
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (error) {
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

  async findUserSessions(userId, options = {}) {
    const {
      status,
      dateFrom,
      dateTo,
      ...paginationOptions
    } = options;

    const filters = {};

    if (status) {
      filters.status = status;
    }

    let query = this.supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId);

    // Apply date range filters
    if (dateFrom) {
      query = query.gte('started_at', dateFrom);
    }

    if (dateTo) {
      query = query.lte('started_at', dateTo);
    }

    // Apply other filters
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        query = query.eq(key, value);
      }
    });

    // Apply pagination
    const {
      page = 1,
      limit = 20,
      orderBy = 'started_at',
      orderDirection = 'desc'
    } = paginationOptions;

    const offset = (page - 1) * limit;
    query = query
      .order(orderBy, { ascending: orderDirection === 'asc' })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return data || [];
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

  async getSessionActivityEvents(sessionId) {
    try {
      const { data, error } = await this.supabase
        .from('activity_events')
        .select('*')
        .eq('work_session_id', sessionId)
        .order('timestamp', { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      throw error;
    }
  }

  async getSessionActivitySummary(sessionId) {
    try {
      const { data, error } = await this.supabase
        .from('activity_events')
        .select('keystroke_count, click_count')
        .eq('work_session_id', sessionId);

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return null;
      }

      const summary = data.reduce((acc, event) => {
        acc.total_keystrokes += event.keystroke_count || 0;
        acc.total_clicks += event.click_count || 0;
        return acc;
      }, { total_keystrokes: 0, total_clicks: 0 });

      return summary;
    } catch (error) {
      throw error;
    }
  }

  async getAIAnalysis(sessionId) {
    try {
      const { data, error } = await this.supabase
        .from('session_summaries')
        .select('*')
        .eq('work_session_id', sessionId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = WorkSessionRepository;