const UserService = require('../services/UserService');
const ProfileService = require('../services/ProfileService');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class UserController {
  constructor() {
    this.userService = new UserService();
    this.profileService = new ProfileService();
  }

  // Check username availability (public endpoint)
  checkUsernameAvailability = asyncHandler(async (req, res) => {
    const { username } = req.query;

    if (!username || username.length < 3) {
      return res.json({
        available: false,
        error: 'Username must be at least 3 characters'
      });
    }

    logger.info('Checking username availability', { username });

    const existingProfile = await this.profileService.profileRepository.findByUsername(username);

    res.json({ available: !existingProfile });
  });

  // Get current user profile
  getProfile = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    logger.info('Getting user profile', { userId });

    const profile = await this.profileService.getProfile(userId);

    res.json({
      success: true,
      data: profile
    });
  });

  // Update user profile
  updateProfile = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const profileData = req.body;

    logger.info('Updating user profile', { userId, fields: Object.keys(profileData) });

    const updatedProfile = await this.profileService.updateProfile(userId, profileData);

    res.json({
      success: true,
      data: updatedProfile,
      message: 'Profile updated successfully'
    });
  });

  // Get user by ID (admin function)
  getUserById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;

    // Users can only access their own data
    await this.userService.validateUserAccess(userId, id);

    // Get auth data from web_users
    const user = await this.userService.findById(id);

    // Get profile data from profiles table
    const profile = await this.profileService.profileRepository.findByUserId(id);

    // Merge auth data with profile data
    const completeUser = {
      ...user,
      // Profile fields (override auth fields if present in profile)
      profile_complete: profile?.profile_complete || false,
      onboarding_completed: profile?.onboarding_completed || false,
      username: profile?.username || null,
      field_of_work: profile?.field_of_work || null,
      experience_level: profile?.experience_level || null,
      company: profile?.company || null,
      job_title: profile?.job_title || null,
      work_goals: profile?.work_goals || null,
      avatar_url: profile?.avatar_url || user.picture_url,
      resume_url: profile?.resume_url || null,
      resume_name: profile?.resume_name || null,
      subscription_type: profile?.subscription_type || 'trial',
      subscription_status: profile?.subscription_status || null,
      trial_ends_at: profile?.trial_ends_at || null
    };

    // Remove sensitive information
    const { password_hash, ...userProfile } = completeUser;

    res.json({
      success: true,
      data: userProfile
    });
  });

  // Deactivate user account
  deactivateAccount = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    logger.warn('User account deactivation requested', { userId });

    await this.userService.deactivateUser(userId);

    res.json({
      success: true,
      message: 'Account deactivated successfully'
    });
  });

  // Reactivate user account (admin function)
  reactivateAccount = asyncHandler(async (req, res) => {
    const { id } = req.params;

    logger.info('User account reactivation', { userId: id });

    await this.userService.reactivateUser(id);

    res.json({
      success: true,
      message: 'Account reactivated successfully'
    });
  });

  // Get user settings
  getSettings = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    logger.info('Getting user settings', { userId });

    const settings = await this.userService.getSettings(userId);

    res.json({
      success: true,
      data: settings || {}
    });
  });

  // Update user settings
  updateSettings = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const settingsData = req.body;

    logger.info('Updating user settings', { userId, keys: Object.keys(settingsData) });

    const updatedSettings = await this.userService.updateSettings(userId, settingsData);

    res.json({
      success: true,
      data: updatedSettings,
      message: 'Settings updated successfully'
    });
  });
}

module.exports = UserController;