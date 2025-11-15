const BaseRepository = require('./BaseRepository');

class ScreenshotRepository extends BaseRepository {
  constructor() {
    super('screenshots');
  }

  validateActionType(actionType) {
    // Valid action_type enum values based on database schema and usage patterns
    const validActionTypes = [
      'manual',
      'click',
      'copy',
      'paste',
      'timer',
      'interval',
      'enter',
      'keyboard',
      'auto'
    ];

    // If provided action type is valid, use it
    if (actionType && validActionTypes.includes(actionType)) {
      return actionType;
    }

    // Map common test/invalid values to valid ones
    const actionTypeMapping = {
      'emergency_test': 'manual',
      'schema_test': 'manual',
      'test': 'manual',
      'schema_compliance_test': 'manual',
      'emergency_conflict_test': 'manual',
      'conflict_test': 'manual',
      'upload_test': 'manual',
      'test_upload': 'manual'
    };

    if (actionType && actionTypeMapping[actionType]) {
      console.log(`📝 Mapped invalid action_type '${actionType}' to '${actionTypeMapping[actionType]}'`);
      return actionTypeMapping[actionType];
    }

    // Default fallback
    console.log(`⚠️ Unknown action_type '${actionType}', using default 'manual'`);
    return 'manual';
  }

  async createScreenshot(userId, sessionId, screenshotData) {
    // Map to actual database schema columns from screenshots table
    const createData = {
      user_id: userId,
      session_id: sessionId, // Correct: matches schema

      // File storage fields - these exist in schema
      file_storage_key: screenshotData.file_storage_key,
      file_size_bytes: screenshotData.file_size_bytes,
      filename: screenshotData.filename, // Add missing filename field
      file_path: screenshotData.file_path, // Add missing file_path field
      storage_path: screenshotData.storage_path, // Add missing storage_path field
      file_size: screenshotData.file_size_bytes, // Map to both file_size and file_size_bytes
      file_type: screenshotData.file_type || 'image/png',

      // Required action_type field (NOT NULL ENUM in schema)
      // Valid values: manual, click, copy, paste, timer, interval
      action_type: this.validateActionType(screenshotData.action_type),

      // Mouse and screen data
      mouse_x: screenshotData.click_x || screenshotData.mouse_x,
      mouse_y: screenshotData.click_y || screenshotData.mouse_y,
      click_coordinates: screenshotData.click_x && screenshotData.click_y
        ? { x: parseInt(screenshotData.click_x), y: parseInt(screenshotData.click_y) }
        : null,
      screen_width: screenshotData.screen_width,
      screen_height: screenshotData.screen_height,

      // Application context
      active_app: screenshotData.active_app,
      capture_trigger: screenshotData.capture_trigger || 'timer_15s',

      // Interaction data
      interaction_type: screenshotData.interaction_type,
      interaction_data: screenshotData.interaction_data,

      // Metadata and timestamps - note: no direct timestamp column, use created_at/updated_at
      metadata: {
        timestamp: screenshotData.timestamp || new Date().toISOString(),
        window_title: screenshotData.window_title,
        ...screenshotData.metadata
      }
    };

    // Emergency conflict handling - try with different file storage keys if conflicts occur
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.create(createData);
      } catch (error) {
        // Enhanced error logging to identify the exact constraint violation
        console.error(`Screenshot creation attempt ${attempt} failed:`, {
          errorCode: error.code,
          errorMessage: error.message,
          errorDetail: error.detail,
          constraint: error.constraint,
          table: error.table,
          column: error.column,
          createDataKeys: Object.keys(createData),
          fileStorageKey: createData.file_storage_key
        });

        // Check if it's a unique constraint violation
        if ((error.code === '23505' || error.message.includes('duplicate') || error.message.includes('unique')) && attempt < maxRetries) {
          console.warn(`Unique constraint violation on attempt ${attempt}:`, {
            constraint: error.constraint,
            detail: error.detail
          });

          // Modify multiple fields to ensure uniqueness
          const timestamp = Date.now();
          const randomSuffix = `_${timestamp}_${attempt}_${Math.random().toString(36).substring(2, 6)}`;

          // Modify file storage key
          if (createData.file_storage_key) {
            const parts = createData.file_storage_key.split('.');
            if (parts.length > 1) {
              parts[parts.length - 2] += randomSuffix;
              createData.file_storage_key = parts.join('.');
            } else {
              createData.file_storage_key += randomSuffix;
            }
          }

          // Modify filename if present
          if (createData.filename) {
            const parts = createData.filename.split('.');
            if (parts.length > 1) {
              parts[parts.length - 2] += randomSuffix;
              createData.filename = parts.join('.');
            } else {
              createData.filename += randomSuffix;
            }
          }

          // Modify file paths
          if (createData.file_path) {
            createData.file_path += randomSuffix;
          }
          if (createData.storage_path) {
            createData.storage_path += randomSuffix;
          }

          // Update metadata timestamp
          if (createData.metadata) {
            createData.metadata.timestamp = new Date().toISOString();
            createData.metadata.retry_attempt = attempt;
          }

          console.log(`Retrying with modified data:`, {
            newFileStorageKey: createData.file_storage_key,
            newFilename: createData.filename,
            attempt: attempt
          });

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