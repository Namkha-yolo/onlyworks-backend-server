const { asyncHandler, validateRequired, ApiError } = require('../middleware/errorHandler');
const UserRepository = require('../repositories/UserRepository');
const { logger } = require('../utils/logger');

class OnboardingController {
  constructor() {
    this.userRepository = new UserRepository();
  }

  // Get onboarding status
  getStatus = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    const user = await this.userRepository.findById(userId);

    if (!user) {
      throw new ApiError('USER_NOT_FOUND');
    }

    const completedSteps = {
      basicInfo: !!(user.full_name && user.email),
      workInfo: !!(user.company || user.job_title || user.field_of_work),
      preferences: !!user.experience_level,
      termsAccepted: user.terms_accepted === true
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
          experience_level: user.experience_level,
          age: user.age,
          use_case: user.use_case,
          terms_accepted: user.terms_accepted
        }
      }
    });
  });

  // Update basic info (step 1)
  updateBasicInfo = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { full_name, given_name, family_name, username, avatar_url, age } = req.body;

    // Validate required fields
    validateRequired(req.body, ['full_name']);

    // Check username uniqueness if provided
    if (username) {
      const existingUser = await this.userRepository.supabase
        .from('users')
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

    const updatedUser = await this.userRepository.updateProfile(userId, {
      full_name,
      given_name,
      family_name,
      username,
      avatar_url,
      age
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
    const { company, job_title, field_of_work, occupation, experience_level } = req.body;

    // Validate experience level if provided
    if (experience_level && !['beginner', 'intermediate', 'advanced', 'expert'].includes(experience_level)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_EXPERIENCE_LEVEL',
          message: 'Experience level must be: beginner, intermediate, advanced, or expert'
        }
      });
    }

    const updatedUser = await this.userRepository.updateProfile(userId, {
      company,
      job_title,
      field_of_work,
      occupation,
      experience_level
    });

    logger.info('Work info updated', { userId, company, field_of_work });

    res.json({
      success: true,
      data: updatedUser,
      message: 'Work information updated successfully'
    });
  });

  // Update preferences and use case (step 3)
  updatePreferences = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { use_case } = req.body;

    const updatedUser = await this.userRepository.updateProfile(userId, {
      use_case
    });

    logger.info('Preferences updated', { userId });

    res.json({
      success: true,
      data: updatedUser,
      message: 'Preferences updated successfully'
    });
  });

  // Complete onboarding
  completeOnboarding = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { terms_accepted } = req.body;

    if (!terms_accepted) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'TERMS_NOT_ACCEPTED',
          message: 'You must accept the terms and conditions'
        }
      });
    }

    const updatedUser = await this.userRepository.updateProfile(userId, {
      onboarding_completed: true,
      terms_accepted: true
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

    const updatedUser = await this.userRepository.updateProfile(userId, {
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
