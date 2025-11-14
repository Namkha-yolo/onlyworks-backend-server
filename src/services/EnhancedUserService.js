const UserRepository = require('../repositories/UserRepository');
const { ApiError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class EnhancedUserService {
  constructor() {
    this.userRepository = new UserRepository();
  }

  async findById(userId) {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'user' });
      }
      return this.formatUserProfile(user);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error finding user by ID', { error: error.message, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'find_user_by_id' });
    }
  }

  async findByEmail(email) {
    try {
      const user = await this.userRepository.findByEmail(email);
      return user ? this.formatUserProfile(user) : null;
    } catch (error) {
      logger.error('Error finding user by email', { error: error.message, email });
      throw new ApiError('INTERNAL_ERROR', { operation: 'find_user_by_email' });
    }
  }

  async createUser(userData) {
    try {
      // Validate required fields
      const validationResult = this.validateUserData(userData);
      if (!validationResult.isValid) {
        throw new ApiError('VALIDATION_ERROR', {
          message: 'Invalid user data',
          errors: validationResult.errors
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

      // Prepare user data with proper defaults
      const processedUserData = this.prepareUserData(userData);

      // Create user
      const user = await this.userRepository.create(processedUserData);

      logger.info('User created successfully', {
        user_id: user.id,
        email: user.email,
        onboarding_step: user.onboarding_step
      });

      return this.formatUserProfile(user);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error creating user', { error: error.message, userData });
      throw new ApiError('INTERNAL_ERROR', { operation: 'create_user' });
    }
  }

  async updateUser(userId, updateData) {
    try {
      // Validate update data
      const validationResult = this.validateUpdateData(updateData);
      if (!validationResult.isValid) {
        throw new ApiError('VALIDATION_ERROR', {
          message: 'Invalid update data',
          errors: validationResult.errors
        });
      }

      // Check if user exists
      const existingUser = await this.userRepository.findById(userId);
      if (!existingUser) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'user' });
      }

      // Process update data
      const processedUpdateData = this.processUpdateData(updateData);

      // Update user
      const updatedUser = await this.userRepository.update(userId, processedUpdateData);

      logger.info('User updated successfully', {
        user_id: userId,
        fields_updated: Object.keys(processedUpdateData)
      });

      return this.formatUserProfile(updatedUser);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error updating user', { error: error.message, userId, updateData });
      throw new ApiError('INTERNAL_ERROR', { operation: 'update_user' });
    }
  }

  async completeOnboardingStep(userId, stepData) {
    try {
      const user = await this.findById(userId);

      const currentStep = user.onboarding_step || 0;
      const nextStep = currentStep + 1;

      // Validate step data based on step number
      const stepValidation = this.validateOnboardingStep(nextStep, stepData);
      if (!stepValidation.isValid) {
        throw new ApiError('VALIDATION_ERROR', {
          message: `Invalid data for onboarding step ${nextStep}`,
          errors: stepValidation.errors
        });
      }

      // Update user with step data
      const updateData = {
        ...stepData,
        onboarding_step: nextStep,
        updated_at: new Date().toISOString()
      };

      // Check if onboarding is complete
      const isComplete = this.isOnboardingComplete(nextStep, { ...user, ...stepData });
      if (isComplete) {
        updateData.onboarding_completed = true;
        updateData.onboarding_completed_at = new Date().toISOString();
      }

      const updatedUser = await this.updateUser(userId, updateData);

      logger.info('Onboarding step completed', {
        user_id: userId,
        step: nextStep,
        onboarding_complete: isComplete
      });

      return {
        user: updatedUser,
        onboarding_complete: isComplete,
        current_step: nextStep,
        next_step: isComplete ? null : nextStep + 1
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error completing onboarding step', { error: error.message, userId, stepData });
      throw new ApiError('INTERNAL_ERROR', { operation: 'complete_onboarding_step' });
    }
  }

  async updatePreferences(userId, preferences) {
    try {
      const user = await this.findById(userId);

      const currentPreferences = user.preferences || {};
      const updatedPreferences = {
        ...currentPreferences,
        ...preferences
      };

      const updatedUser = await this.updateUser(userId, {
        preferences: updatedPreferences
      });

      logger.info('User preferences updated', {
        user_id: userId,
        preferences_updated: Object.keys(preferences)
      });

      return updatedUser;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error updating preferences', { error: error.message, userId, preferences });
      throw new ApiError('INTERNAL_ERROR', { operation: 'update_preferences' });
    }
  }

  async updateNotificationSettings(userId, notificationSettings) {
    try {
      const user = await this.findById(userId);

      const currentSettings = user.notification_settings || {};
      const updatedSettings = {
        ...currentSettings,
        ...notificationSettings
      };

      const updatedUser = await this.updateUser(userId, {
        notification_settings: updatedSettings
      });

      return updatedUser;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Error updating notification settings', { error: error.message, userId, notificationSettings });
      throw new ApiError('INTERNAL_ERROR', { operation: 'update_notification_settings' });
    }
  }

  // Private helper methods

  validateUserData(userData) {
    const errors = [];

    if (!userData.email) {
      errors.push('Email is required');
    } else if (!this.isValidEmail(userData.email)) {
      errors.push('Invalid email format');
    }

    if (!userData.first_name && !userData.display_name) {
      errors.push('Either first_name or display_name is required');
    }

    if (userData.company_size && !this.isValidCompanySize(userData.company_size)) {
      errors.push('Invalid company size');
    }

    if (userData.work_arrangement && !this.isValidWorkArrangement(userData.work_arrangement)) {
      errors.push('Invalid work arrangement');
    }

    if (userData.user_role && !this.isValidUserRole(userData.user_role)) {
      errors.push('Invalid user role');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateUpdateData(updateData) {
    const errors = [];

    if (updateData.email && !this.isValidEmail(updateData.email)) {
      errors.push('Invalid email format');
    }

    if (updateData.company_size && !this.isValidCompanySize(updateData.company_size)) {
      errors.push('Invalid company size');
    }

    if (updateData.work_arrangement && !this.isValidWorkArrangement(updateData.work_arrangement)) {
      errors.push('Invalid work arrangement');
    }

    if (updateData.user_role && !this.isValidUserRole(updateData.user_role)) {
      errors.push('Invalid user role');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  validateOnboardingStep(stepNumber, stepData) {
    const errors = [];

    switch (stepNumber) {
      case 1: // Personal information
        if (!stepData.first_name) errors.push('First name is required');
        if (!stepData.last_name) errors.push('Last name is required');
        break;
      case 2: // Company information
        if (!stepData.company_name) errors.push('Company name is required');
        if (!stepData.job_title) errors.push('Job title is required');
        break;
      case 3: // Work preferences
        if (!stepData.work_arrangement) errors.push('Work arrangement is required');
        break;
      case 4: // Goals and preferences
        // Optional step - no required fields
        break;
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  prepareUserData(userData) {
    return {
      email: userData.email,
      first_name: userData.first_name || null,
      last_name: userData.last_name || null,
      display_name: userData.display_name ||
        (userData.first_name && userData.last_name
          ? `${userData.first_name} ${userData.last_name}`
          : userData.first_name || userData.email),
      company_name: userData.company_name || null,
      job_title: userData.job_title || null,
      department: userData.department || null,
      company_size: userData.company_size || null,
      industry: userData.industry || null,
      work_arrangement: userData.work_arrangement || null,
      phone_number: userData.phone_number || null,
      timezone: userData.timezone || 'UTC',
      avatar_url: userData.avatar_url || null,
      bio: userData.bio || null,
      location: userData.location || null,
      user_role: userData.user_role || 'individual',
      subscription_tier: userData.subscription_tier || 'free',
      onboarding_completed: false,
      onboarding_step: 0,
      preferences: userData.preferences || this.getDefaultPreferences(),
      privacy_settings: userData.privacy_settings || this.getDefaultPrivacySettings(),
      notification_settings: userData.notification_settings || this.getDefaultNotificationSettings(),
      productivity_goals: userData.productivity_goals || this.getDefaultProductivityGoals(),
      work_schedule: userData.work_schedule || this.getDefaultWorkSchedule(),
      login_count: 0,
      total_sessions: 0,
      total_focus_time_minutes: 0,
      features_used: {},
      referral_source: userData.referral_source || null,
      utm_source: userData.utm_source || null,
      utm_campaign: userData.utm_campaign || null,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  }

  processUpdateData(updateData) {
    const processed = { ...updateData };

    // Auto-update display_name if first_name or last_name changed
    if (updateData.first_name || updateData.last_name) {
      if (updateData.first_name && updateData.last_name) {
        processed.display_name = `${updateData.first_name} ${updateData.last_name}`;
      }
    }

    // Always update the timestamp
    processed.updated_at = new Date().toISOString();

    return processed;
  }

  formatUserProfile(user) {
    return {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      full_name: user.first_name && user.last_name
        ? `${user.first_name} ${user.last_name}`
        : user.display_name || user.email,
      display_name: user.display_name,
      company_name: user.company_name,
      job_title: user.job_title,
      department: user.department,
      company_size: user.company_size,
      industry: user.industry,
      work_arrangement: user.work_arrangement,
      phone_number: user.phone_number,
      timezone: user.timezone,
      avatar_url: user.avatar_url,
      bio: user.bio,
      location: user.location,
      user_role: user.user_role,
      subscription_tier: user.subscription_tier,
      onboarding_completed: user.onboarding_completed,
      onboarding_step: user.onboarding_step,
      preferences: user.preferences,
      privacy_settings: user.privacy_settings,
      notification_settings: user.notification_settings,
      productivity_goals: user.productivity_goals,
      work_schedule: user.work_schedule,
      status: user.status,
      created_at: user.created_at,
      updated_at: user.updated_at,
      last_login_at: user.last_login_at
    };
  }

  isOnboardingComplete(step, userData) {
    return step >= 4 &&
           userData.first_name &&
           userData.last_name &&
           userData.company_name &&
           userData.job_title;
  }

  // Validation helpers
  isValidEmail(email) {
    const emailRegex = /^[A-Za-z0-9._%-]+@[A-Za-z0-9.-]+\.[A-Za-z]+$/;
    return emailRegex.test(email);
  }

  isValidCompanySize(size) {
    const validSizes = ['1-10', '11-50', '51-200', '201-1000', '1000+', 'freelancer', 'other'];
    return validSizes.includes(size);
  }

  isValidWorkArrangement(arrangement) {
    const validArrangements = ['office', 'remote', 'hybrid', 'other'];
    return validArrangements.includes(arrangement);
  }

  isValidUserRole(role) {
    const validRoles = ['individual', 'team_member', 'team_lead', 'manager', 'admin', 'owner'];
    return validRoles.includes(role);
  }

  // Default settings
  getDefaultPreferences() {
    return {
      theme: 'light',
      language: 'en',
      dashboard_layout: 'default'
    };
  }

  getDefaultPrivacySettings() {
    return {
      profile_visibility: 'private',
      data_sharing: false,
      analytics_tracking: true,
      marketing_emails: false
    };
  }

  getDefaultNotificationSettings() {
    return {
      email_notifications: true,
      push_notifications: true,
      session_reminders: true,
      weekly_reports: true,
      achievement_notifications: true
    };
  }

  getDefaultProductivityGoals() {
    return {
      daily_focus_hours: 6,
      weekly_focus_hours: 30,
      break_frequency: 60,
      deep_work_preference: true
    };
  }

  getDefaultWorkSchedule() {
    return {
      start_time: '09:00',
      end_time: '17:00',
      break_duration: 60,
      timezone: 'UTC',
      working_days: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
    };
  }
}

module.exports = EnhancedUserService;