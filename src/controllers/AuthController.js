const { asyncHandler } = require('../middleware/errorHandler');
const AuthService = require('../services/AuthService');
const { logger } = require('../utils/logger');

class AuthController {
  constructor() {
    this.authService = new AuthService();
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

  // Handle OAuth callback
  handleOAuthCallback = asyncHandler(async (req, res) => {
    const { provider } = req.params;
    const { code, state, error } = req.query;

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
}

module.exports = AuthController;