const UserService = require('../services/UserService');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class UserController {
  constructor() {
    this.userService = new UserService();
  }

  // Get current user profile
  getProfile = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    logger.info('Getting user profile', { userId });

    const user = await this.userService.findById(userId);

    // Remove sensitive information
    const { password_hash, ...userProfile } = user;

    res.json({
      success: true,
      data: userProfile
    });
  });

  // Update user profile
  updateProfile = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const profileData = req.body;

    logger.info('Updating user profile', { userId, fields: Object.keys(profileData) });

    const updatedUser = await this.userService.updateProfile(userId, profileData);

    // Remove sensitive information
    const { password_hash, ...userProfile } = updatedUser;

    res.json({
      success: true,
      data: userProfile,
      message: 'Profile updated successfully'
    });
  });

  // Get user by ID (admin function)
  getUserById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { userId } = req.user;

    // Users can only access their own data
    await this.userService.validateUserAccess(userId, id);

    const user = await this.userService.findById(id);

    // Remove sensitive information
    const { password_hash, ...userProfile } = user;

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