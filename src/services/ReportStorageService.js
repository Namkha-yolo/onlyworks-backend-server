const { createClient } = require('@supabase/supabase-js');
const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class ReportStorageService {
  constructor() {
    // Initialize Supabase client with service role key for storage access
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      logger.warn('Supabase credentials not configured for storage service');
      this.supabase = null;
    } else {
      this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
    }

    this.bucketName = 'reports';
  }

  /**
   * Upload compressed HTML report to Supabase Storage
   * @param {Buffer} compressedHTML - Compressed HTML buffer
   * @param {string} userId - User ID
   * @param {string} reportId - Report ID (optional, will generate if not provided)
   * @returns {Promise<Object>} { storagePath, publicUrl }
   */
  async uploadReport(compressedHTML, userId, reportId = null) {
    try {
      if (!this.supabase) {
        throw new Error('Supabase storage not configured - missing credentials');
      }

      // Generate report ID if not provided
      const id = reportId || uuidv4();

      // Create storage path: reports/userId/reportId.html.gz
      const storagePath = `${userId}/${id}.html.gz`;

      logger.info('Uploading report to storage', {
        userId,
        reportId: id,
        storagePath,
        size: compressedHTML.length,
        bucketName: this.bucketName
      });

      // Upload to Supabase Storage
      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(storagePath, compressedHTML, {
          contentType: 'application/gzip',
          cacheControl: '3600',
          upsert: true // Allow overwriting if exists
        });

      if (error) {
        logger.error('Failed to upload report to storage', {
          error: error.message,
          code: error.statusCode,
          userId,
          reportId: id,
          storagePath
        });
        throw new Error(`Storage upload failed: ${error.message}`);
      }

      logger.info('Report uploaded successfully', {
        userId,
        reportId: id,
        storagePath: data.path,
        size: compressedHTML.length
      });

      // Generate public URL (signed URL valid for 1 year)
      const { data: urlData } = await this.supabase.storage
        .from(this.bucketName)
        .createSignedUrl(storagePath, 31536000); // 1 year in seconds

      return {
        storagePath: data.path,
        publicUrl: urlData?.signedUrl || null,
        reportId: id
      };

    } catch (error) {
      logger.error('Exception in uploadReport', {
        error: error.message,
        userId,
        reportId
      });
      throw error;
    }
  }

  /**
   * Delete report from Supabase Storage
   * @param {string} storagePath - Storage path to delete
   * @returns {Promise<boolean>} Success status
   */
  async deleteReport(storagePath) {
    try {
      if (!this.supabase) {
        throw new Error('Supabase storage not configured');
      }

      logger.info('Deleting report from storage', {
        storagePath,
        bucketName: this.bucketName
      });

      const { error } = await this.supabase.storage
        .from(this.bucketName)
        .remove([storagePath]);

      if (error) {
        logger.error('Failed to delete report from storage', {
          error: error.message,
          storagePath
        });
        throw new Error(`Storage deletion failed: ${error.message}`);
      }

      logger.info('Report deleted successfully', {
        storagePath
      });

      return true;

    } catch (error) {
      logger.error('Exception in deleteReport', {
        error: error.message,
        storagePath
      });
      throw error;
    }
  }

  /**
   * Check if storage bucket exists and is accessible
   * @returns {Promise<boolean>}
   */
  async checkBucketAccess() {
    try {
      if (!this.supabase) {
        return false;
      }

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .list('', { limit: 1 });

      if (error) {
        logger.warn('Storage bucket not accessible', {
          bucket: this.bucketName,
          error: error.message
        });
        return false;
      }

      logger.info('Storage bucket accessible', {
        bucket: this.bucketName
      });

      return true;

    } catch (error) {
      logger.error('Exception checking bucket access', {
        error: error.message,
        bucket: this.bucketName
      });
      return false;
    }
  }

  /**
   * Get signed URL for a report (valid for specified duration)
   * @param {string} storagePath - Storage path
   * @param {number} expiresIn - Expiry in seconds (default: 7 days)
   * @returns {Promise<string>} Signed URL
   */
  async getSignedUrl(storagePath, expiresIn = 604800) {
    try {
      if (!this.supabase) {
        throw new Error('Supabase storage not configured');
      }

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .createSignedUrl(storagePath, expiresIn);

      if (error || !data) {
        throw new Error(`Failed to generate signed URL: ${error?.message || 'Unknown error'}`);
      }

      return data.signedUrl;

    } catch (error) {
      logger.error('Exception in getSignedUrl', {
        error: error.message,
        storagePath
      });
      throw error;
    }
  }
}

module.exports = ReportStorageService;
