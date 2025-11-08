const BaseRepository = require('./BaseRepository');

class ScreenshotRepository extends BaseRepository {
  constructor() {
    super('screenshots');
  }

  async createScreenshot(userId, sessionId, screenshotData) {
    return this.create({
      user_id: userId,
      work_session_id: sessionId,
      file_storage_key: screenshotData.file_storage_key,
      file_size_bytes: screenshotData.file_size_bytes,
      timestamp: screenshotData.timestamp || new Date().toISOString(),
      capture_trigger: screenshotData.capture_trigger || 'timer_15s',
      window_title: screenshotData.window_title,
      active_app: screenshotData.active_app,
      ocr_text: screenshotData.ocr_text,
      ai_analysis_completed: false
    });
  }

  async findBySession(sessionId, userId) {
    return this.findByUserId(userId, { work_session_id: sessionId });
  }

  async markAnalysisCompleted(screenshotId, userId) {
    return this.update(screenshotId, {
      ai_analysis_completed: true
    }, userId);
  }

  async findPendingAnalysis(limit = 10) {
    try {
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
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

  async findExpiredScreenshots(retentionDays = 90) {
    try {
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() - retentionDays);

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .lte('retention_expires_at', expirationDate.toISOString());

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      throw error;
    }
  }

  async updateOcrText(screenshotId, userId, ocrText) {
    return this.update(screenshotId, {
      ocr_text: ocrText
    }, userId);
  }

  async getSessionScreenshotCount(sessionId) {
    try {
      const { count, error } = await this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .eq('work_session_id', sessionId);

      if (error) {
        throw error;
      }

      return count || 0;
    } catch (error) {
      throw error;
    }
  }

  async findByTimeRange(userId, startTime, endTime, options = {}) {
    const {
      sessionId,
      captureTriger,
      ...paginationOptions
    } = options;

    let query = this.supabase
      .from(this.tableName)
      .select('*')
      .eq('user_id', userId)
      .gte('timestamp', startTime)
      .lte('timestamp', endTime);

    if (sessionId) {
      query = query.eq('work_session_id', sessionId);
    }

    if (captureTriger) {
      query = query.eq('capture_trigger', captureTriger);
    }

    // Apply pagination
    const {
      page = 1,
      limit = 50,
      orderBy = 'timestamp',
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
}

module.exports = ScreenshotRepository;