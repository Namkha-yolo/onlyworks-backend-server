const BaseRepository = require('./BaseRepository');

class AnalysisReportRepository extends BaseRepository {
  constructor() {
    super('analysis_reports');
  }

  async createAnalysisReport(userId, sessionId, reportData) {
    const createData = {
      user_id: userId,
      session_id: sessionId,
      analysis_type: reportData.analysis_type || 'standard',
      analysis_data: reportData.analysis_data || {},
      work_completed: reportData.work_completed || [],
      alignment_score: reportData.alignment_score || 0,
      productivity_insights: reportData.productivity_insights,
      focus_analysis: reportData.focus_analysis,
      screenshot_count: reportData.screenshot_count || 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    return await this.create(createData);
  }

  async findBySession(sessionId, userId) {
    return await this.findByUserId(userId, { session_id: sessionId });
  }

  async findByType(userId, analysisType, options = {}) {
    try {
      const startTime = Date.now();
      let query = this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .eq('analysis_type', analysisType)
        .order('created_at', { ascending: false });

      // Apply pagination if provided
      if (options.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      throw error;
    }
  }

  async getBatchAnalyses(sessionId, userId) {
    return await this.findBySession(sessionId, userId);
  }

  async getFinalAnalysis(sessionId, userId) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .eq('analysis_type', 'final')
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        throw error;
      }

      return data && data.length > 0 ? data[0] : null;
    } catch (error) {
      throw error;
    }
  }

  async getSessionAnalysisMetrics(sessionId, userId) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (error) {
        throw error;
      }

      if (!data || data.length === 0) {
        return {
          session_id: sessionId,
          total_analyses: 0,
          total_screenshots_analyzed: 0,
          average_productivity_score: 0,
          average_focus_score: 0,
          average_alignment_score: 0,
          total_work_completed: 0,
          first_analysis_at: null,
          last_analysis_at: null
        };
      }

      const total_analyses = data.length;
      const total_screenshots_analyzed = data.reduce((sum, analysis) => sum + (analysis.screenshot_count || 0), 0);
      const total_alignment_score = data.reduce((sum, analysis) => sum + (analysis.alignment_score || 0), 0);
      const total_work_completed = data.reduce((sum, analysis) => sum + (analysis.work_completed?.length || 0), 0);

      return {
        session_id: sessionId,
        total_analyses,
        total_screenshots_analyzed,
        average_productivity_score: 0, // Would need to calculate from analysis_data
        average_focus_score: 0, // Would need to calculate from analysis_data
        average_alignment_score: total_analyses > 0 ? total_alignment_score / total_analyses : 0,
        total_work_completed,
        first_analysis_at: data[0]?.created_at,
        last_analysis_at: data[data.length - 1]?.created_at
      };
    } catch (error) {
      throw error;
    }
  }

  async getSessionsWithAnalyses(userId) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('session_id, analysis_type, screenshot_count, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      // Group by session_id and calculate metrics
      const sessionMap = new Map();

      data.forEach(analysis => {
        const sessionId = analysis.session_id;
        if (!sessionMap.has(sessionId)) {
          sessionMap.set(sessionId, {
            session_id: sessionId,
            batch_analyses_count: 0,
            has_final_analysis: false,
            total_screenshots: 0,
            last_analysis_at: null
          });
        }

        const session = sessionMap.get(sessionId);
        session.batch_analyses_count += 1;
        session.total_screenshots += analysis.screenshot_count || 0;

        if (analysis.analysis_type === 'final') {
          session.has_final_analysis = true;
        }

        if (!session.last_analysis_at || new Date(analysis.created_at) > new Date(session.last_analysis_at)) {
          session.last_analysis_at = analysis.created_at;
        }
      });

      const sessions = Array.from(sessionMap.values());

      return sessions.sort((a, b) =>
        new Date(b.last_analysis_at) - new Date(a.last_analysis_at)
      );
    } catch (error) {
      throw error;
    }
  }
}

module.exports = AnalysisReportRepository;