const BaseRepository = require('./BaseRepository');

class ScreenshotRepository extends BaseRepository {
  constructor() {
    super('screenshots');
  }

  async createScreenshot(userId, sessionId, screenshotData) {
    // Use session_id as per actual database schema
    const createData = {
      user_id: userId,
      session_id: sessionId,
      file_storage_key: screenshotData.file_storage_key,
      file_size_bytes: screenshotData.file_size_bytes,
      action_type: screenshotData.action_type || 'manual',
      timestamp: screenshotData.timestamp || new Date().toISOString(),
      window_title: screenshotData.window_title,
      active_app: screenshotData.active_app,
      capture_trigger: screenshotData.capture_trigger || 'timer_15s',
      mouse_x: screenshotData.click_x || screenshotData.mouse_x,
      mouse_y: screenshotData.click_y || screenshotData.mouse_y,
      click_coordinates: screenshotData.click_x && screenshotData.click_y
        ? { x: parseInt(screenshotData.click_x), y: parseInt(screenshotData.click_y) }
        : null,
      screen_width: screenshotData.screen_width,
      screen_height: screenshotData.screen_height,
      interaction_type: screenshotData.interaction_type,
      interaction_data: screenshotData.interaction_data
    };

    // Emergency conflict handling - try with different file storage keys if conflicts occur
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.create(createData);
      } catch (error) {
        // Check if it's a unique constraint violation (likely on file_storage_key)
        if ((error.code === '23505' || error.message.includes('duplicate') || error.message.includes('unique')) && attempt < maxRetries) {
          console.warn(`Unique constraint violation on attempt ${attempt}, retrying with modified key...`);

          // Modify file_storage_key to make it unique
          if (createData.file_storage_key) {
            const parts = createData.file_storage_key.split('.');
            if (parts.length > 1) {
              parts[parts.length - 2] += `_${Date.now()}_${attempt}`;
              createData.file_storage_key = parts.join('.');
            } else {
              createData.file_storage_key += `_${Date.now()}_${attempt}`;
            }
          }

          // Also add slight timestamp variation to ensure uniqueness
          const now = new Date();
          now.setMilliseconds(now.getMilliseconds() + attempt);
          createData.timestamp = now.toISOString();

          continue; // Try again with modified data
        }

        // If not a unique constraint violation or max retries reached, throw the error
        throw error;
      }
    }
  }

  async findBySession(sessionId, userId) {
    // Use session_id (actual database schema)
    return await this.findByUserId(userId, { session_id: sessionId });
  }

  async markAnalysisCompleted(screenshotId, userId) {
    // ai_analysis_completed column doesn't exist in current schema
    // This method is disabled until schema is updated
    console.warn('markAnalysisCompleted: ai_analysis_completed column does not exist in database');
    return { id: screenshotId, warning: 'ai_analysis_completed column missing' };
  }

  async findPendingAnalysis(limit = 10) {
    try {
      // ai_analysis_completed column doesn't exist, return all screenshots
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
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

      // retention_expires_at column doesn't exist, use timestamp instead
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .lte('timestamp', expirationDate.toISOString());

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      throw error;
    }
  }

  async updateOcrText(screenshotId, userId, ocrText) {
    // ocr_text column doesn't exist in current schema
    console.warn('updateOcrText: ocr_text column does not exist in database');
    return { id: screenshotId, warning: 'ocr_text column missing' };
  }

  async getSessionScreenshotCount(sessionId) {
    try {
      const { count, error } = await this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId);

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
      query = query.eq('session_id', sessionId);
    }

    // capture_trigger column doesn't exist in current schema
    // if (captureTriger) {
    //   query = query.eq('capture_trigger', captureTriger);
    // }

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

  // Get recent screenshots for batch processing
  async getRecentScreenshots(sessionId, limit = 30) {
    try {
      // Use session_id and skip ai_analysis_completed filter (column doesn't exist)
      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('session_id', sessionId)
        .order('timestamp', { ascending: false })
        .limit(limit);

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      throw error;
    }
  }

  // Mark screenshots as processed after batch analysis
  async markAsProcessed(screenshotIds, batchReportId = null) {
    try {
      // ai_analysis_completed, processed_at, batch_report_id columns don't exist
      console.warn('markAsProcessed: Required columns do not exist in database schema');
      return { processed_ids: screenshotIds, warning: 'Analysis tracking columns missing' };
    } catch (error) {
      throw error;
    }
  }

  // Get count of unprocessed screenshots for a session
  async getUnprocessedCount(sessionId) {
    try {
      // ai_analysis_completed column doesn't exist, return total count for session
      const { count, error } = await this.supabase
        .from(this.tableName)
        .select('*', { count: 'exact', head: true })
        .eq('session_id', sessionId);

      if (error) {
        throw error;
      }

      return count || 0;
    } catch (error) {
      throw error;
    }
  }
}

module.exports = ScreenshotRepository;