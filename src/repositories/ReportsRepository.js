const BaseRepository = require('./BaseRepository');
const { v4: uuidv4 } = require('uuid');

class ReportsRepository extends BaseRepository {
  constructor() {
    super('reports');
  }

  /**
   * Create a comprehensive session report
   * @param {string} userId - User ID
   * @param {string} sessionId - Session ID
   * @param {Object} reportData - Report data
   * @returns {Object} Created report
   */
  async createSessionReport(userId, sessionId, reportData) {
    try {
      const { logger } = require('../utils/logger');

      // Check if a report already exists for this session
      // Use admin client if available, otherwise fallback to regular client
      const client = this.supabaseAdmin || this.supabase;
      if (!client) {
        throw new Error('No Supabase client available');
      }

      const existingReport = await client
        .from(this.tableName)
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .single();

      if (existingReport.data) {
        logger.info('Report already exists for session, updating existing report', {
          userId,
          sessionId,
          existingReportId: existingReport.data.id
        });
        // Update existing report
        return await this.update(existingReport.data.id, {
          title: reportData.title || `Session Report - ${new Date().toLocaleDateString()}`,
          comprehensive_report: reportData.comprehensiveReport || reportData,
          executive_summary: reportData.executiveSummary || reportData.summary || '',
          productivity_score: reportData.productivityScore || reportData.averageProductivity || null,
          focus_score: reportData.focusScore || reportData.focusPercentage ? (reportData.focusPercentage / 100) : null,
          session_duration_minutes: reportData.sessionDurationMinutes || reportData.durationMinutes || null,
          screenshot_count: reportData.screenshotCount || reportData.totalScreenshots || 0
        }, userId);
      }

      // Prepare report data with required structure
      const reportInsertData = {
        id: uuidv4(), // Generate unique ID
        user_id: userId,
        session_id: sessionId,
        report_date: new Date().toISOString().split('T')[0], // Current date
        title: reportData.title || `Session Report - ${new Date().toLocaleDateString()}`,
        comprehensive_report: reportData.comprehensiveReport || reportData,
        executive_summary: reportData.executiveSummary || reportData.summary || '',
        productivity_score: reportData.productivityScore || reportData.averageProductivity || null,
        focus_score: reportData.focusScore || reportData.focusPercentage ? (reportData.focusPercentage / 100) : null,
        session_duration_minutes: reportData.sessionDurationMinutes || reportData.durationMinutes || null,
        screenshot_count: reportData.screenshotCount || reportData.totalScreenshots || 0
      };

      logger.info('Creating session report', {
        userId,
        sessionId,
        reportTitle: reportInsertData.title,
        screenshotCount: reportInsertData.screenshot_count
      });

      // Insert new report
      const { data, error } = await client
        .from(this.tableName)
        .insert(reportInsertData)
        .select()
        .single();

      if (error) {
        logger.error('Failed to create session report', {
          error: error.message,
          code: error.code,
          userId,
          sessionId
        });
        throw error;
      }

      logger.info('Session report created successfully', {
        userId,
        sessionId,
        reportId: data.id
      });

      return data;
    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Exception in createSessionReport', {
        error: error.message,
        userId,
        sessionId
      });
      throw error;
    }
  }

  /**
   * Get a session report by session ID
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @returns {Object|null} Report or null if not found
   */
  async getBySessionId(sessionId, userId) {
    try {
      // Use admin client if available, otherwise fallback to regular client
      const client = this.supabaseAdmin || this.supabase;
      if (!client) {
        throw new Error('No Supabase client available');
      }

      const { data, error } = await client
        .from(this.tableName)
        .select('*')
        .eq('session_id', sessionId)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Exception in getBySessionId', {
        error: error.message,
        sessionId,
        userId
      });
      throw error;
    }
  }

  /**
   * Get all user reports ordered by date
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Array} Array of reports
   */
  async getUserReports(userId, options = {}) {
    try {
      // Use admin client if available, otherwise fallback to regular client
      const client = this.supabaseAdmin || this.supabase;
      if (!client) {
        throw new Error('No Supabase client available');
      }

      let query = client
        .from(this.tableName)
        .select(`
          id,
          session_id,
          report_date,
          title,
          executive_summary,
          productivity_score,
          focus_score,
          session_duration_minutes,
          screenshot_count,
          created_at,
          updated_at
        `)
        .eq('user_id', userId);

      if (options.startDate) {
        query = query.gte('report_date', options.startDate);
      }

      if (options.endDate) {
        query = query.lte('report_date', options.endDate);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      query = query.order('report_date', { ascending: false });

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Exception in getUserReports', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Get full report with comprehensive data
   * @param {string} reportId - Report ID
   * @param {string} userId - User ID
   * @returns {Object|null} Full report or null if not found
   */
  async getFullReport(reportId, userId) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('id', reportId)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;
    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Exception in getFullReport', {
        error: error.message,
        reportId,
        userId
      });
      throw error;
    }
  }

  /**
   * Update a session report
   * @param {string} reportId - Report ID
   * @param {string} userId - User ID
   * @param {Object} updateData - Data to update
   * @returns {Object} Updated report
   */
  async updateReport(reportId, userId, updateData) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .update(updateData)
        .eq('id', reportId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data;
    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Exception in updateReport', {
        error: error.message,
        reportId,
        userId
      });
      throw error;
    }
  }

  async getSessionReports(sessionId) {
    try {
      const { logger } = require('../utils/logger');
      logger.info(`Getting reports for session ${sessionId}`);

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: false });

      if (error) {
        logger.error(`Error getting session reports`, {
          error: error.message,
          code: error.code,
          sessionId
        });
        throw error;
      }

      return data || [];
    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Failed to get session reports', {
        error: error.message,
        sessionId,
        tableName: this.tableName
      });
      throw error;
    }
  }
}

module.exports = ReportsRepository;