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

  async updateProfile(userId, profileData) {
    try {
      // Validate user exists
      await this.findById(userId);

      const updatedUser = await this.userRepository.updateProfile(userId, profileData);

      logger.business('user_profile_updated', {
        user_id: userId,
        updated_fields: Object.keys(profileData)
      });

      return updatedUser;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error updating user profile', { error: error.message, userId, profileData });
      throw new ApiError('INTERNAL_ERROR', { operation: 'update_user_profile' });
    }
  }

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
}

module.exports = UserService;