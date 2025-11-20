const { getSupabaseClient } = require('../config/database');
const { logger } = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

class FileStorageService {
  constructor(bucketName = 'screenshots') {
    this.bucketName = bucketName;
    this.supabase = getSupabaseClient();
  }

  async uploadFile(fileBuffer, fileName, metadata = {}) {
    try {
      if (!this.supabase) {
        logger.warn('Supabase client not available, using mock upload');
        return {
          success: true,
          data: {
            path: `mock/${fileName}`,
            publicUrl: `https://mock.supabase.com/storage/v1/object/public/${this.bucketName}/mock/${fileName}`,
            fullPath: `${this.bucketName}/mock/${fileName}`
          }
        };
      }

      const fileExtension = fileName.split('.').pop() || 'png';
      const uniqueFileName = `${uuidv4()}.${fileExtension}`;
      const filePath = `uploads/${new Date().toISOString().split('T')[0]}/${uniqueFileName}`;

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filePath, fileBuffer, {
          contentType: metadata.contentType || 'image/png',
          metadata: {
            originalName: fileName,
            uploadTimestamp: new Date().toISOString(),
            ...metadata
          }
        });

      if (error) {
        logger.error('File upload failed', { error: error.message, fileName });
        return {
          success: false,
          error: {
            code: 'UPLOAD_FAILED',
            message: 'Failed to upload file to storage',
            details: error.message
          }
        };
      }

      // Get public URL
      const { data: publicUrlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filePath);

      logger.info('File uploaded successfully', {
        fileName,
        filePath,
        fileSize: fileBuffer.length
      });

      return {
        success: true,
        data: {
          path: data.path,
          publicUrl: publicUrlData.publicUrl,
          fullPath: data.fullPath,
          metadata: {
            originalName: fileName,
            size: fileBuffer.length,
            contentType: metadata.contentType
          }
        }
      };

    } catch (error) {
      logger.error('File storage error', { error: error.message, fileName });
      return {
        success: false,
        error: {
          code: 'STORAGE_ERROR',
          message: 'File storage operation failed',
          details: error.message
        }
      };
    }
  }

  async uploadBase64File(base64Data, userId, fileName, contentType) {
    try {
      if (!this.supabase) {
        logger.warn('Supabase client not available, using mock upload');
        return {
          success: true,
          data: {
            path: `mock/${fileName}`,
            publicUrl: `https://mock.supabase.com/storage/v1/object/public/${this.bucketName}/mock/${fileName}`
          }
        };
      }

      // Remove data URI prefix if present
      const base64String = base64Data.replace(/^data:[^;]+;base64,/, '');
      const buffer = Buffer.from(base64String, 'base64');

      // Generate unique file path
      const fileExtension = this.getFileExtension(fileName, contentType);
      const uniqueFileName = `${userId}-${Date.now()}-${uuidv4()}.${fileExtension}`;
      const filePath = `${userId}/${uniqueFileName}`;

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .upload(filePath, buffer, {
          contentType,
          upsert: true,
          metadata: {
            originalName: fileName,
            uploadTimestamp: new Date().toISOString(),
            userId
          }
        });

      if (error) {
        logger.error('Base64 file upload failed', {
          error: error.message,
          bucket: this.bucketName,
          fileName,
          userId
        });
        return {
          success: false,
          error: {
            code: 'UPLOAD_FAILED',
            message: 'Failed to upload file to storage',
            details: error.message
          }
        };
      }

      // Get public URL
      const { data: publicUrlData } = this.supabase.storage
        .from(this.bucketName)
        .getPublicUrl(filePath);

      logger.info('Base64 file uploaded successfully', {
        bucket: this.bucketName,
        fileName,
        filePath,
        fileSize: buffer.length,
        userId
      });

      return {
        success: true,
        data: {
          path: data.path,
          publicUrl: publicUrlData.publicUrl
        }
      };

    } catch (error) {
      logger.error('Base64 file storage error', {
        error: error.message,
        bucket: this.bucketName,
        fileName,
        userId
      });
      return {
        success: false,
        error: {
          code: 'STORAGE_ERROR',
          message: 'File storage operation failed',
          details: error.message
        }
      };
    }
  }

  getFileExtension(fileName, contentType) {
    const extensionFromName = fileName.split('.').pop();
    if (extensionFromName && extensionFromName.length <= 5) {
      return extensionFromName;
    }

    const extensionMap = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'application/pdf': 'pdf',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx'
    };

    return extensionMap[contentType] || 'bin';
  }

  async deleteFile(filePath) {
    try {
      if (!this.supabase) {
        logger.warn('Supabase client not available, using mock delete');
        return { success: true, data: { deleted: true } };
      }

      const { data, error } = await this.supabase.storage
        .from(this.bucketName)
        .remove([filePath]);

      if (error) {
        logger.error('File deletion failed', { error: error.message, filePath });
        return {
          success: false,
          error: {
            code: 'DELETE_FAILED',
            message: 'Failed to delete file from storage',
            details: error.message
          }
        };
      }

      logger.info('File deleted successfully', { filePath });
      return {
        success: true,
        data: { deleted: true }
      };

    } catch (error) {
      logger.error('File deletion error', { error: error.message, filePath });
      return {
        success: false,
        error: {
          code: 'DELETE_ERROR',
          message: 'File deletion operation failed',
          details: error.message
        }
      };
    }
  }

  generateStorageKey(userId, sessionId, timestamp = null) {
    const date = timestamp ? new Date(timestamp) : new Date();
    const dateStr = date.toISOString().split('T')[0];
    const timeStr = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    return `users/${userId}/sessions/${sessionId}/${dateStr}/${timeStr}.png`;
  }
}

module.exports = FileStorageService;