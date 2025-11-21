const { asyncHandler } = require('../middleware/errorHandler');
const AuthService = require('../services/AuthService');
const ProfileRepository = require('../repositories/ProfileRepository');
const { logger } = require('../utils/logger');

class AuthController {
  constructor() {
    this.authService = new AuthService();
    this.profileRepository = new ProfileRepository();
  }

  // Initialize OAuth flow
  initOAuth = asyncHandler(async (req, res) => {
    const { provider } = req.params;
    const { redirect_uri } = req.query;

    logger.info('OAuth initialization requested', { provider, redirect_uri });

    if (!['google', 'github'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PROVIDER',
          message: 'Supported providers: google, github'
        }
      });
    }

    const authUrl = await this.authService.getOAuthUrl(provider, redirect_uri);

    res.json({
      success: true,
      data: {
        auth_url: authUrl,
        provider,
        expires_in: 600 // 10 minutes
      }
    });
  });

  // Handle OAuth callback (GET - for browser redirects)
  handleOAuthCallback = asyncHandler(async (req, res) => {
    const { provider } = req.params;
    const { code, state, error } = req.query;

    logger.info('OAuth GET callback received', {
      provider,
      hasCode: !!code,
      hasState: !!state,
      codeLength: code?.length,
      error: error
    });

    if (error) {
      logger.warn('OAuth callback error', { provider, error });
      return res.status(400).json({
        success: false,
        error: {
          code: 'OAUTH_ERROR',
          message: error
        }
      });
    }

    if (!code) {
      logger.error('OAuth callback missing code', { provider, queryParams: Object.keys(req.query) });
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CODE',
          message: 'Authorization code is required'
        }
      });
    }

    try {
      logger.info('Starting token exchange', { provider, codePrefix: code.substring(0, 10) + '...' });
      const tokens = await this.authService.exchangeCodeForTokens(provider, code, state);
      logger.info('Token exchange successful', { provider, hasAccessToken: !!tokens.access_token });

      res.json({
        success: true,
        data: tokens
      });
    } catch (exchangeError) {
      logger.error('OAuth token exchange failed in controller', {
        provider,
        error: exchangeError.message,
        stack: exchangeError.stack
      });

      // Re-throw to let asyncHandler handle it
      throw exchangeError;
    }
  });

  // Handle OAuth callback (POST - for desktop app requests)
  handleOAuthCallbackPost = asyncHandler(async (req, res) => {
    const { provider } = req.params;
    const { code, state, error } = req.body;

    logger.info('OAuth POST callback received', { provider, hasCode: !!code, hasState: !!state });

    if (error) {
      logger.warn('OAuth callback error', { provider, error });
      return res.status(400).json({
        success: false,
        error: {
          code: 'OAUTH_ERROR',
          message: error
        }
      });
    }

    if (!code) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CODE',
          message: 'Authorization code is required'
        }
      });
    }

    const tokens = await this.authService.exchangeCodeForTokens(provider, code, state);

    res.json({
      success: true,
      data: tokens
    });
  });

  // Refresh access token
  refreshToken = asyncHandler(async (req, res) => {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_REFRESH_TOKEN',
          message: 'Refresh token is required'
        }
      });
    }

    const tokens = await this.authService.refreshAccessToken(refresh_token);

    res.json({
      success: true,
      data: tokens
    });
  });

  // Logout user
  logout = asyncHandler(async (req, res) => {
    const { refresh_token } = req.body;

    if (refresh_token) {
      await this.authService.revokeRefreshToken(refresh_token);
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });

  // Get current auth status
  getAuthStatus = asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.json({
        success: true,
        data: {
          authenticated: false,
          user: null
        }
      });
    }

    res.json({
      success: true,
      data: {
        authenticated: true,
        user: {
          id: req.user.userId,
          email: req.user.email,
          name: req.user.name,
          avatar_url: req.user.avatar_url,
          provider: req.user.provider
        }
      }
    });
  });

  // Validate token endpoint
  validateToken = asyncHandler(async (req, res) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Token is invalid or expired'
        }
      });
    }

    // Query profiles table to get complete profile data
    const profile = await this.profileRepository.findByUserId(req.user.userId);

    logger.info('Profile data fetched for token validation', {
      userId: req.user.userId,
      hasProfile: !!profile,
      profileData: profile ? {
        email: profile.email,
        username: profile.username,
        field_of_work: profile.field_of_work,
        experience_level: profile.experience_level,
        profile_complete: profile.profile_complete,
        onboarding_completed: profile.onboarding_completed
      } : null
    });

    // Merge auth data with profile data
    const userData = {
      id: req.user.userId,
      email: req.user.email || profile?.email,
      full_name: req.user.name || profile?.full_name,
      picture_url: req.user.avatar_url || profile?.avatar_url,
      provider: req.user.provider,
      // Profile fields
      profile_complete: profile?.profile_complete || false,
      onboarding_completed: profile?.onboarding_completed || false,
      username: profile?.username || null,
      field_of_work: profile?.field_of_work || null,
      experience_level: profile?.experience_level || null,
      company: profile?.company || null,
      job_title: profile?.job_title || null,
      work_goals: profile?.work_goals || null,
      avatar_url: profile?.avatar_url || req.user.avatar_url,
      resume_url: profile?.resume_url || null,
      resume_name: profile?.resume_name || null,
      subscription_type: profile?.subscription_type || 'trial',
      subscription_status: profile?.subscription_status || null,
      trial_ends_at: profile?.trial_ends_at || null
    };

    logger.info('Token validated, returning user data', {
      userId: req.user.userId,
      profile_complete: userData.profile_complete,
      onboarding_completed: userData.onboarding_completed,
      username: userData.username,
      field_of_work: userData.field_of_work
    });

    res.json({
      success: true,
      user: userData
    });
  });
}

module.exports = AuthController;