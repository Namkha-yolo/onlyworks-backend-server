const { asyncHandler, validateRequired, ApiError } = require('../middleware/errorHandler');
const ProfileRepository = require('../repositories/ProfileRepository');
const { logger } = require('../utils/logger');

class OnboardingController {
  constructor() {
    this.profileRepository = new ProfileRepository();
  }

  // Sync onboarding data from desktop app
  syncOnboardingData = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const onboardingData = req.body;

    logger.info('Syncing onboarding data from desktop app', { userId, data: Object.keys(onboardingData) });

    // Extract and update user profile with onboarding data
    const updateData = {};

    // Map onboarding fields to user profile fields
    if (onboardingData.workGoals) updateData.work_goals = onboardingData.workGoals;
    if (onboardingData.company) updateData.company = onboardingData.company;
    if (onboardingData.jobTitle) updateData.job_title = onboardingData.jobTitle;
    if (onboardingData.fieldOfWork) updateData.field_of_work = onboardingData.fieldOfWork;
    if (onboardingData.experienceLevel) updateData.experience_level = onboardingData.experienceLevel;

    // Mark onboarding as completed
    updateData.onboarding_completed = true;

    // Update user profile
    const updatedUser = await this.profileRepository.updateProfile(userId, updateData);

    logger.info('Onboarding data synced successfully', { userId });

    res.json({
      success: true,
      data: updatedUser,
      message: 'Onboarding data synced successfully'
    });
  });

  // Get onboarding status
  getStatus = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    const user = await this.profileRepository.findByUserId(userId);

    if (!user) {
      throw new ApiError('USER_NOT_FOUND');
    }

    const completedSteps = {
      basicInfo: !!(user.full_name && user.email),
      workInfo: !!(user.company || user.job_title || user.field_of_work),
      preferences: !!user.experience_level
    };

    const totalSteps = Object.keys(completedSteps).length;
    const completed = Object.values(completedSteps).filter(Boolean).length;
    const progress = Math.round((completed / totalSteps) * 100);

    res.json({
      success: true,
      data: {
        onboarding_completed: user.onboarding_completed,
        progress,
        completed_steps: completedSteps,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          username: user.username,
          avatar_url: user.avatar_url,
          company: user.company,
          job_title: user.job_title,
          field_of_work: user.field_of_work,
          experience_level: user.experience_level
        }
      }
    });
  });

  // Update basic info (step 1)
  updateBasicInfo = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { full_name, username, avatar_url } = req.body;

    // Validate required fields
    validateRequired(req.body, ['full_name']);

    // Check username uniqueness if provided
    if (username) {
      const existingUser = await this.profileRepository.supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .neq('id', userId)
        .single();

      if (existingUser.data) {
        return res.status(400).json({
          success: false,
          error: {
            code: 'USERNAME_TAKEN',
            message: 'Username is already taken'
          }
        });
      }
    }

    const updatedUser = await this.profileRepository.updateProfile(userId, {
      full_name,
      username,
      avatar_url
    });

    logger.info('Basic info updated', { userId, username });

    res.json({
      success: true,
      data: updatedUser,
      message: 'Basic information updated successfully'
    });
  });

  // Update work info (step 2)
  updateWorkInfo = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { company, job_title, field_of_work, experience_level } = req.body;

    // Validate experience level if provided
    if (experience_level && !['entry', 'junior', 'mid', 'senior', 'lead', 'executive', 'other'].includes(experience_level)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EXPERIENCE_LEVEL',
          message: 'Experience level must be: entry, junior, mid, senior, lead, executive, or other'
        }
      });
    }

    const updatedUser = await this.profileRepository.updateProfile(userId, {
      company,
      job_title,
      field_of_work,
      experience_level
    });

    logger.info('Work info updated', { userId, company, field_of_work });

    res.json({
      success: true,
      data: updatedUser,
      message: 'Work information updated successfully'
    });
  });

  // Update preferences (step 3)
  updatePreferences = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    // Get current user profile
    const user = await this.profileRepository.findByUserId(userId);

    logger.info('Preferences step completed', { userId });

    res.json({
      success: true,
      data: user,
      message: 'Preferences updated successfully'
    });
  });

  // Complete onboarding
  completeOnboarding = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    const updatedUser = await this.profileRepository.updateProfile(userId, {
      onboarding_completed: true
    });

    logger.info('Onboarding completed', { userId });

    res.json({
      success: true,
      data: updatedUser,
      message: 'Onboarding completed successfully!'
    });
  });

  // Skip onboarding (mark as completed without full info)
  skipOnboarding = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    const updatedUser = await this.profileRepository.updateProfile(userId, {
      onboarding_completed: true
    });

    logger.info('Onboarding skipped', { userId });

    res.json({
      success: true,
      data: updatedUser,
      message: 'Onboarding skipped'
    });
  });
}

module.exports = OnboardingController;
