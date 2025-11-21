const UserRepository = require('../repositories/UserRepository');
const { ApiError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class UserService {
  constructor() {
    this.userRepository = new UserRepository();
  }

  async findById(userId) {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'user' });
      }
      return user;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error finding user by ID', { error: error.message, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'find_user_by_id' });
    }
  }

  async findByEmail(email) {
    try {
      return await this.userRepository.findByEmail(email);
    } catch (error) {
      logger.error('Error finding user by email', { error: error.message, email });
      throw new ApiError('INTERNAL_ERROR', { operation: 'find_user_by_email' });
    }
  }

  async createUser(userData) {
    try {
      // Validate required fields
      if (!userData.email || !userData.display_name) {
        throw new ApiError('MISSING_REQUIRED_FIELD', {
          missing_fields: ['email', 'display_name']
        });
      }

      // Check if user already exists
      const existingUser = await this.userRepository.findByEmail(userData.email);
      if (existingUser) {
        throw new ApiError('RESOURCE_CONFLICT', {
          field: 'email',
          message: 'User with this email already exists'
        });
      }

      const user = await this.userRepository.createUser(userData);

      logger.business('user_created', {
        user_id: user.id,
        email: user.email
      });

      return user;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error creating user', { error: error.message, userData });
      throw new ApiError('INTERNAL_ERROR', { operation: 'create_user' });
    }
  }

  // REMOVED: updateProfile method - Use ProfileService instead
  // web_users (UserRepository) is for authentication only
  // Profile updates should use ProfileService and ProfileRepository

  async deactivateUser(userId) {
    try {
      const updatedUser = await this.userRepository.updateStatus(userId, 'suspended');

      logger.security('user_deactivated', {
        user_id: userId,
        action: 'account_deactivation'
      });

      return updatedUser;
    } catch (error) {
      logger.error('Error deactivating user', { error: error.message, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'deactivate_user' });
    }
  }

  async reactivateUser(userId) {
    try {
      const updatedUser = await this.userRepository.updateStatus(userId, 'active');

      logger.business('user_reactivated', {
        user_id: userId,
        action: 'account_reactivation'
      });

      return updatedUser;
    } catch (error) {
      logger.error('Error reactivating user', { error: error.message, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'reactivate_user' });
    }
  }

  async validateUserAccess(userId, requestedUserId) {
    // Users can only access their own data
    if (userId !== requestedUserId) {
      throw new ApiError('PERMISSION_DENIED', {
        message: 'Users can only access their own data'
      });
    }
    return true;
  }

  async getSettings(userId) {
    try {
      const settings = await this.userRepository.getUserSettings(userId);

      if (!settings) {
        // Return default settings if none exist
        return {
          username: '',
          email: '',
          phone: '',
          avatar_url: '',
          theme: 'light',
          language: 'en',
          email_notifications: true,
          push_notifications: true,
          marketing_emails: false
        };
      }

      // Return the individual fields, not the generic settings JSONB
      return {
        username: settings.username || '',
        email: settings.email || '',
        phone: settings.phone || '',
        avatar: settings.avatar_url || '',
        theme: settings.theme || 'light',
        language: settings.language || 'en',
        email_notifications: settings.email_notifications !== undefined ? settings.email_notifications : true,
        push_notifications: settings.push_notifications !== undefined ? settings.push_notifications : true,
        marketing_emails: settings.marketing_emails !== undefined ? settings.marketing_emails : false
      };
    } catch (error) {
      logger.error('Error getting user settings', { error: error.message, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_user_settings' });
    }
  }

  async updateSettings(userId, settingsData) {
    try {
      const updatedSettings = await this.userRepository.updateUserSettings(userId, settingsData);

      // Return the updated settings in the same format as getSettings
      return {
        username: updatedSettings.username || '',
        email: updatedSettings.email || '',
        phone: updatedSettings.phone || '',
        avatar: updatedSettings.avatar_url || '',
        theme: updatedSettings.theme || 'light',
        language: updatedSettings.language || 'en',
        email_notifications: updatedSettings.email_notifications !== undefined ? updatedSettings.email_notifications : true,
        push_notifications: updatedSettings.push_notifications !== undefined ? updatedSettings.push_notifications : true,
        marketing_emails: updatedSettings.marketing_emails !== undefined ? updatedSettings.marketing_emails : false
      };
    } catch (error) {
      logger.error('Error updating user settings', { error: error.message, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'update_user_settings' });
    }
  }
}

module.exports = UserService;