const { supabaseAdmin } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class BatchReportRepository {
  constructor() {
    this.tableName = 'batch_reports';
  }

  async create(batchReportData) {
    // Support both old and new schema structures
    const {
      session_id,
      user_id,
      screenshot_count,
      analysis_type,
      analysis_result,
      created_at,
      // New schema fields
      batch_number,
      screenshot_ids,
      start_time,
      end_time,
      processing_status,
      gemini_analysis,
      efficiency_score,
      inefficiency_score,
      tasks_identified,
      tasks_completed,
      applications_used,
      activities,
      processed_at
    } = batchReportData;

    // Build insert object based on available fields
    const insertData = {
      id: uuidv4(),
      session_id,
      user_id,
      screenshot_count: screenshot_count || 0,
      created_at: created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Add fields based on your existing schema
    if (batch_number !== undefined) insertData.batch_number = batch_number;
    if (screenshot_ids !== undefined) insertData.screenshot_ids = screenshot_ids;
    if (start_time !== undefined) insertData.start_time = start_time;
    if (end_time !== undefined) insertData.end_time = end_time;
    if (processing_status !== undefined) insertData.processing_status = processing_status;
    if (gemini_analysis !== undefined) {
      insertData.gemini_analysis = typeof gemini_analysis === 'string' ? gemini_analysis : JSON.stringify(gemini_analysis);
    }
    if (efficiency_score !== undefined) insertData.efficiency_score = efficiency_score;
    if (inefficiency_score !== undefined) insertData.inefficiency_score = inefficiency_score;
    if (tasks_identified !== undefined) {
      insertData.tasks_identified = Array.isArray(tasks_identified) ? tasks_identified : [];
    }
    if (tasks_completed !== undefined) {
      insertData.tasks_completed = Array.isArray(tasks_completed) ? tasks_completed : [];
    }
    if (applications_used !== undefined) {
      insertData.applications_used = Array.isArray(applications_used) ? applications_used : [];
    }
    if (activities !== undefined) {
      insertData.activities = typeof activities === 'string' ? activities : JSON.stringify(activities);
    }
    if (processed_at !== undefined) insertData.processed_at = processed_at;

    // Legacy support
    if (analysis_type !== undefined) insertData.analysis_type = analysis_type;
    if (analysis_result !== undefined) {
      insertData.analysis_result = typeof analysis_result === 'string' ? analysis_result : JSON.stringify(analysis_result);
    }

    const { data, error } = await supabaseAdmin
      .from(this.tableName)
      .insert([insertData])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create batch report: ${error.message}`);
    }

    return data;
  }

  async getRecentReports(sessionId, limit = 5) {
    const { data, error } = await supabaseAdmin
      .from(this.tableName)
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get recent reports: ${error.message}`);
    }

    return data.map(report => ({
      ...report,
      analysis_result: typeof report.analysis_result === 'string' ?
        JSON.parse(report.analysis_result) : report.analysis_result
    }));
  }

  async getSessionReports(sessionId, options = {}) {
    const { limit = 10, offset = 0, orderBy = 'created_at', direction = 'DESC' } = options;

    const { data, error } = await supabaseAdmin
      .from(this.tableName)
      .select('*')
      .eq('session_id', sessionId)
      .order(orderBy, { ascending: direction === 'ASC' })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get session reports: ${error.message}`);
    }

    return data.map(report => ({
      ...report,
      analysis_result: typeof report.analysis_result === 'string' ?
        JSON.parse(report.analysis_result) : report.analysis_result
    }));
  }

  async findById(id) {
    const { data, error } = await supabaseAdmin
      .from(this.tableName)
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to find batch report: ${error.message}`);
    }

    return {
      ...data,
      analysis_result: typeof data.analysis_result === 'string' ?
        JSON.parse(data.analysis_result) : data.analysis_result
    };
  }

  async getUserReports(userId, options = {}) {
    const { limit = 20, offset = 0, sessionId } = options;

    let query = supabaseAdmin
      .from(this.tableName)
      .select(`
        *,
        work_sessions!inner(session_name, goal_description)
      `)
      .eq('user_id', userId);

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data, error } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get user reports: ${error.message}`);
    }

    return data.map(report => ({
      ...report,
      analysis_result: typeof report.analysis_result === 'string' ?
        JSON.parse(report.analysis_result) : report.analysis_result
    }));
  }

  async deleteReport(id, userId) {
    const { data, error } = await supabaseAdmin
      .from(this.tableName)
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found or no permission
      }
      throw new Error(`Failed to delete batch report: ${error.message}`);
    }

    return data;
  }

  async getReportStats(userId) {
    const { data, error } = await supabaseAdmin
      .from(this.tableName)
      .select('analysis_type, screenshot_count, created_at')
      .eq('user_id', userId);

    if (error) {
      throw new Error(`Failed to get report stats: ${error.message}`);
    }

    const stats = {
      totalReports: data.length,
      totalScreenshots: data.reduce((sum, report) => sum + report.screenshot_count, 0),
      reportsByType: data.reduce((acc, report) => {
        acc[report.analysis_type] = (acc[report.analysis_type] || 0) + 1;
        return acc;
      }, {}),
      recentActivity: data.filter(report => {
        const reportDate = new Date(report.created_at);
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        return reportDate > weekAgo;
      }).length
    };

    return stats;
  }

  // Create shareable report
  async createShareableReport(shareData) {
    const { session_id, user_id, share_token, summary_data, expires_at, include_private_data, share_with_team } = shareData;

    const { data, error } = await supabaseAdmin
      .from('shared_reports')
      .insert([{
        id: uuidv4(),
        session_id,
        user_id,
        share_token,
        summary_data: typeof summary_data === 'string' ? summary_data : JSON.stringify(summary_data),
        expires_at,
        include_private_data,
        share_with_team,
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create shareable report: ${error.message}`);
    }

    return data;
  }

  // Get shared report by token
  async getByShareToken(shareToken) {
    const { data, error } = await supabaseAdmin
      .from('shared_reports')
      .select('*')
      .eq('share_token', shareToken)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw new Error(`Failed to get shared report: ${error.message}`);
    }

    return {
      ...data,
      summary_data: typeof data.summary_data === 'string' ?
        JSON.parse(data.summary_data) : data.summary_data
    };
  }

  // Delete shared report
  async deleteSharedReport(shareToken, userId) {
    const { data, error } = await supabaseAdmin
      .from('shared_reports')
      .delete()
      .eq('share_token', shareToken)
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found or no permission
      }
      throw new Error(`Failed to delete shared report: ${error.message}`);
    }

    return data;
  }

  // Get user's shared reports
  async getUserSharedReports(userId, options = {}) {
    const { limit = 20, offset = 0 } = options;

    const { data, error } = await supabaseAdmin
      .from('shared_reports')
      .select('share_token, summary_data, created_at, expires_at, include_private_data, share_with_team')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new Error(`Failed to get user shared reports: ${error.message}`);
    }

    return data.map(report => ({
      ...report,
      summary_data: typeof report.summary_data === 'string' ?
        JSON.parse(report.summary_data) : report.summary_data
    }));
  }

  // Clean up expired shared reports (should be called periodically)
  async cleanupExpiredReports() {
    const { data, error } = await supabaseAdmin
      .from('shared_reports')
      .delete()
      .lt('expires_at', new Date().toISOString())
      .select('count');

    if (error) {
      throw new Error(`Failed to cleanup expired reports: ${error.message}`);
    }

    return data?.[0]?.count || 0;
  }
}

module.exports = BatchReportRepository;