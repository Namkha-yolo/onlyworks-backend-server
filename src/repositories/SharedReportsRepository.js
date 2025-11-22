const BaseRepository = require('./BaseRepository');
const { v4: uuidv4 } = require('uuid');

class SharedReportsRepository extends BaseRepository {
  constructor() {
    super('shared_reports');
  }

  /**
   * Create a shared report entry
   * @param {Object} reportData - Shared report data
   * @returns {Promise<Object>} Created shared report
   */
  async createSharedReport(reportData) {
    try {
      const { logger } = require('../utils/logger');

      const {
        userId,
        token,
        storagePath,
        title,
        recipientEmail = null,
        recipientName = null,
        expiresAt = null,
        metadata = {}
      } = reportData;

      // Use admin client for write operations
      const client = this.supabaseAdmin || this.supabase;
      if (!client) {
        throw new Error('No Supabase client available');
      }

      // Set default expiry to 30 days if not provided
      const defaultExpiry = new Date();
      defaultExpiry.setDate(defaultExpiry.getDate() + 30);

      const sharedReportData = {
        id: uuidv4(),
        user_id: userId,
        token: token || uuidv4(),
        storage_path: storagePath,
        title: title || 'OnlyWorks Report',
        recipient_email: recipientEmail,
        recipient_name: recipientName,
        created_at: new Date().toISOString(),
        expires_at: expiresAt || defaultExpiry.toISOString(),
        is_revoked: false,
        view_count: 0,
        last_viewed_at: null,
        metadata: metadata
      };

      logger.info('Creating shared report', {
        userId,
        token: sharedReportData.token,
        storagePath,
        expiresAt: sharedReportData.expires_at
      });

      const { data, error } = await client
        .from(this.tableName)
        .insert(sharedReportData)
        .select()
        .single();

      if (error) {
        logger.error('Failed to create shared report', {
          error: error.message,
          code: error.code,
          userId,
          token: sharedReportData.token
        });
        throw error;
      }

      logger.info('Shared report created successfully', {
        id: data.id,
        token: data.token,
        userId
      });

      return data;

    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Exception in createSharedReport', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get shared report by token
   * @param {string} token - Share token
   * @returns {Promise<Object|null>} Shared report or null
   */
  async getByToken(token) {
    try {
      const client = this.supabaseAdmin || this.supabase;
      if (!client) {
        throw new Error('No Supabase client available');
      }

      const { data, error } = await client
        .from(this.tableName)
        .select('*')
        .eq('token', token)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;

    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Exception in getByToken', {
        error: error.message,
        token
      });
      throw error;
    }
  }

  /**
   * Get shared reports by user ID
   * @param {string} userId - User ID
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Array of shared reports
   */
  async getUserSharedReports(userId, options = {}) {
    try {
      const client = this.supabaseAdmin || this.supabase;
      if (!client) {
        throw new Error('No Supabase client available');
      }

      let query = client
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId);

      if (options.limit) {
        query = query.limit(options.limit);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data || [];

    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Exception in getUserSharedReports', {
        error: error.message,
        userId
      });
      throw error;
    }
  }

  /**
   * Revoke a shared report (disable link)
   * @param {string} reportId - Shared report ID
   * @param {string} userId - User ID (for ownership verification)
   * @returns {Promise<Object>} Updated shared report
   */
  async revokeReport(reportId, userId) {
    try {
      const { logger } = require('../utils/logger');
      const client = this.supabaseAdmin || this.supabase;
      if (!client) {
        throw new Error('No Supabase client available');
      }

      logger.info('Revoking shared report', {
        reportId,
        userId
      });

      const { data, error } = await client
        .from(this.tableName)
        .update({
          is_revoked: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId)
        .eq('user_id', userId) // Security: Only owner can revoke
        .select()
        .single();

      if (error) {
        logger.error('Failed to revoke shared report', {
          error: error.message,
          reportId,
          userId
        });
        throw error;
      }

      logger.info('Shared report revoked successfully', {
        reportId,
        userId
      });

      return data;

    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Exception in revokeReport', {
        error: error.message,
        reportId,
        userId
      });
      throw error;
    }
  }

  /**
   * Update expiry date of a shared report
   * @param {string} reportId - Shared report ID
   * @param {string} userId - User ID (for ownership verification)
   * @param {string} newExpiryDate - New expiry date (ISO string)
   * @returns {Promise<Object>} Updated shared report
   */
  async updateExpiry(reportId, userId, newExpiryDate) {
    try {
      const { logger } = require('../utils/logger');
      const client = this.supabaseAdmin || this.supabase;
      if (!client) {
        throw new Error('No Supabase client available');
      }

      logger.info('Updating shared report expiry', {
        reportId,
        userId,
        newExpiryDate
      });

      const { data, error } = await client
        .from(this.tableName)
        .update({
          expires_at: newExpiryDate,
          updated_at: new Date().toISOString()
        })
        .eq('id', reportId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        logger.error('Failed to update expiry', {
          error: error.message,
          reportId,
          userId
        });
        throw error;
      }

      logger.info('Expiry updated successfully', {
        reportId,
        userId,
        newExpiryDate
      });

      return data;

    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Exception in updateExpiry', {
        error: error.message,
        reportId,
        userId
      });
      throw error;
    }
  }

  /**
   * Increment view count for a shared report
   * @param {string} token - Share token
   * @returns {Promise<boolean>} Success status
   */
  async incrementViewCount(token) {
    try {
      const client = this.supabaseAdmin || this.supabase;
      if (!client) {
        throw new Error('No Supabase client available');
      }

      // First get current count
      const { data: report } = await client
        .from(this.tableName)
        .select('view_count')
        .eq('token', token)
        .single();

      if (!report) {
        return false;
      }

      const { error } = await client
        .from(this.tableName)
        .update({
          view_count: (report.view_count || 0) + 1,
          last_viewed_at: new Date().toISOString()
        })
        .eq('token', token);

      if (error) {
        throw error;
      }

      return true;

    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Exception in incrementViewCount', {
        error: error.message,
        token
      });
      // Don't throw - view counting is non-critical
      return false;
    }
  }

  /**
   * Find shared report by report ID (from metadata)
   * @param {string} reportId - Report ID
   * @param {string} userId - User ID
   * @returns {Promise<Object|null>} Shared report or null
   */
  async findByReportId(reportId, userId) {
    try {
      const client = this.supabaseAdmin || this.supabase;
      if (!client) {
        throw new Error('No Supabase client available');
      }

      // Query using metadata->report_id
      const { data, error } = await client
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .filter('metadata->>report_id', 'eq', reportId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data;

    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Exception in findByReportId', {
        error: error.message,
        reportId,
        userId
      });
      throw error;
    }
  }
}

module.exports = SharedReportsRepository;
