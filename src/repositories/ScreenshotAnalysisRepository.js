const BaseRepository = require('./BaseRepository');

class ScreenshotAnalysisRepository extends BaseRepository {
  constructor() {
    super('screenshot_analysis');
  }

  async createAnalysis(screenshotId, userId, analysisData) {
    return this.create({
      screenshot_id: screenshotId,
      user_id: userId,
      activity_detected: analysisData.activity_detected,
      productivity_score: analysisData.productivity_score,
      confidence_score: analysisData.confidence_score,
      detected_apps: analysisData.detected_apps,
      detected_tasks: analysisData.detected_tasks,
      is_blocked: analysisData.is_blocked,
      blocker_type: analysisData.blocker_type,
      model_version: analysisData.model_version,
      processing_time_ms: analysisData.processing_time_ms
    });
  }

  async findByScreenshotId(screenshotId, userId) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('screenshot_id', screenshotId)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (error) {
      throw error;
    }
  }

  async findByDateRange(userId, startDate, endDate) {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId);

      if (startDate) {
        query = query.gte('created_at', startDate);
      }

      if (endDate) {
        query = query.lte('created_at', endDate);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      throw error;
    }
  }

  async getProductivityStats(userId, dateFrom, dateTo) {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select('productivity_score, activity_detected, is_blocked, blocker_type, created_at')
        .eq('user_id', userId);

      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }

      if (dateTo) {
        query = query.lte('created_at', dateTo);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const analyses = data || [];

      if (analyses.length === 0) {
        return {
          averageProductivity: 0,
          totalAnalyses: 0,
          blockedSessions: 0,
          topActivities: [],
          commonBlockers: []
        };
      }

      const productivityScores = analyses
        .filter(a => a.productivity_score !== null)
        .map(a => a.productivity_score);

      const averageProductivity = productivityScores.length > 0
        ? productivityScores.reduce((sum, score) => sum + score, 0) / productivityScores.length
        : 0;

      const blockedSessions = analyses.filter(a => a.is_blocked).length;

      // Count activity types
      const activityCounts = {};
      analyses.forEach(a => {
        if (a.activity_detected) {
          activityCounts[a.activity_detected] = (activityCounts[a.activity_detected] || 0) + 1;
        }
      });

      const topActivities = Object.entries(activityCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .map(([activity, count]) => ({ activity, count }));

      // Count blocker types
      const blockerCounts = {};
      analyses
        .filter(a => a.is_blocked && a.blocker_type)
        .forEach(a => {
          blockerCounts[a.blocker_type] = (blockerCounts[a.blocker_type] || 0) + 1;
        });

      const commonBlockers = Object.entries(blockerCounts)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([blocker, count]) => ({ blocker, count }));

      return {
        averageProductivity: Math.round(averageProductivity * 100) / 100,
        totalAnalyses: analyses.length,
        blockedSessions,
        topActivities,
        commonBlockers
      };
    } catch (error) {
      throw error;
    }
  }

  async getPendingAnalysis(limit = 10) {
    try {
      // Get screenshots that need analysis by joining with screenshots table
      const { data, error } = await this.supabase
        .from('screenshots')
        .select(`
          id,
          user_id,
          file_storage_key,
          timestamp,
          window_title,
          active_app
        `)
        .eq('ai_analysis_completed', false)
        .order('timestamp', { ascending: true })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      throw error;
    }
  }

  async markAnalysisCompleted(screenshotId) {
    try {
      const { error } = await this.supabase
        .from('screenshots')
        .update({ ai_analysis_completed: true })
        .eq('id', screenshotId);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  async getHourlyProductivity(userId, dateFrom, dateTo) {
    try {
      let query = this.supabase
        .from(this.tableName)
        .select('productivity_score, created_at')
        .eq('user_id', userId);

      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }

      if (dateTo) {
        query = query.lte('created_at', dateTo);
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      const analyses = data || [];
      const hourlyData = {};

      analyses.forEach(analysis => {
        if (analysis.productivity_score !== null) {
          const hour = new Date(analysis.created_at).getHours();
          if (!hourlyData[hour]) {
            hourlyData[hour] = { total: 0, count: 0 };
          }
          hourlyData[hour].total += analysis.productivity_score;
          hourlyData[hour].count += 1;
        }
      });

      return Object.entries(hourlyData).map(([hour, data]) => ({
        hour: parseInt(hour),
        averageProductivity: Math.round((data.total / data.count) * 100) / 100,
        sampleCount: data.count
      }));
    } catch (error) {
      throw error;
    }
  }
}

module.exports = ScreenshotAnalysisRepository;