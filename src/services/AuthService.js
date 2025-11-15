const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { ApiError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');
const { getUserByEmailCompat, createUserCompat } = require('../utils/supabaseCompat');
const { getSupabaseAdminClient } = require('../config/database');
const UserRepository = require('../repositories/UserRepository');

class AuthService {
  constructor() {
    this.userRepository = new UserRepository();
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.jwtExpiry = process.env.JWT_EXPIRY || '1h';
    this.refreshTokenExpiry = process.env.REFRESH_TOKEN_EXPIRY || '7d';
  }

  // Generate OAuth URL for different providers
  async getOAuthUrl(provider, redirectUri) {
    try {
      const state = this.generateState();

      switch (provider) {
        case 'google':
          return this.getGoogleOAuthUrl(redirectUri, state);
        case 'github':
          return this.getGitHubOAuthUrl(redirectUri, state);
        default:
          throw new ApiError('INVALID_PROVIDER', { provider });
      }
    } catch (error) {
      logger.error('Error generating OAuth URL', { error: error.message, provider });
      throw error;
    }
  }

  getGoogleOAuthUrl(redirectUri, state) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) {
      throw new ApiError('OAUTH_NOT_CONFIGURED', { provider: 'google' });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri || process.env.GOOGLE_REDIRECT_URI || `${process.env.BASE_URL}/api/auth/oauth/google/callback`,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'consent',
      state
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  getGitHubOAuthUrl(redirectUri, state) {
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      throw new ApiError('OAUTH_NOT_CONFIGURED', { provider: 'github' });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri || `${process.env.BASE_URL}/api/auth/oauth/github/callback`,
      scope: 'user:email',
      state
    });

    return `https://github.com/login/oauth/authorize?${params.toString()}`;
  }

  // Exchange authorization code for tokens
  async exchangeCodeForTokens(provider, code, state) {
    try {
      let userInfo;

      switch (provider) {
        case 'google':
          userInfo = await this.exchangeGoogleCode(code);
          break;
        case 'github':
          userInfo = await this.exchangeGitHubCode(code);
          break;
        default:
          throw new ApiError('INVALID_PROVIDER', { provider });
      }

      // Create or update user in database
      const user = await this.createOrUpdateUser(userInfo);

      // Generate JWT tokens
      const accessToken = this.generateAccessToken(user);
      const refreshToken = this.generateRefreshToken(user);

      // Store refresh token (in a real app, you'd store this in a database)
      await this.storeRefreshToken(user.id, refreshToken);

      logger.info('User authenticated successfully', {
        userId: user.id,
        email: user.email,
        provider
      });

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: 3600, // 1 hour
        user: {
          id: user.id,
          email: user.email,
          name: user.full_name, // Use 'full_name' from our schema
          avatar_url: user.picture_url, // Use 'picture_url' from our schema
          provider: user.provider // Use 'provider' from our schema
        }
      };
    } catch (error) {
      logger.error('Token exchange failed', { error: error.message, provider });
      throw error;
    }
  }

  async exchangeGoogleCode(code) {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new ApiError('OAUTH_NOT_CONFIGURED', { provider: 'google' });
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.GOOGLE_REDIRECT_URI || `${process.env.BASE_URL}/api/auth/oauth/google/callback`
      })
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new ApiError('OAUTH_TOKEN_EXCHANGE_FAILED', {
        provider: 'google',
        error: tokens.error
      });
    }

    // Get user info
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    const userInfo = await userResponse.json();

    if (!userResponse.ok) {
      throw new ApiError('OAUTH_USER_INFO_FAILED', { provider: 'google' });
    }

    return {
      provider: 'google',
      provider_id: userInfo.id,
      email: userInfo.email,
      name: userInfo.name,
      avatar_url: userInfo.picture,
      email_verified: userInfo.verified_email
    };
  }

  async exchangeGitHubCode(code) {
    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new ApiError('OAUTH_NOT_CONFIGURED', { provider: 'github' });
    }

    // Exchange code for tokens
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code
      })
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok || tokens.error) {
      throw new ApiError('OAUTH_TOKEN_EXCHANGE_FAILED', {
        provider: 'github',
        error: tokens.error
      });
    }

    // Get user info
    const userResponse = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    const userInfo = await userResponse.json();

    if (!userResponse.ok) {
      throw new ApiError('OAUTH_USER_INFO_FAILED', { provider: 'github' });
    }

    // Get primary email
    const emailResponse = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    const emails = await emailResponse.json();
    const primaryEmail = emails.find(email => email.primary)?.email || userInfo.email;

    return {
      provider: 'github',
      provider_id: userInfo.id.toString(),
      email: primaryEmail,
      name: userInfo.name || userInfo.login,
      avatar_url: userInfo.avatar_url,
      email_verified: true // GitHub emails are verified
    };
  }

  async createOrUpdateUser(userInfo) {
    try {
      // Try to find existing user by email
      let user = await this.userRepository.findByEmail(userInfo.email);

      if (user) {
        // Update existing user using our new schema
        user = await this.userRepository.update(user.id, {
          full_name: userInfo.name,
          picture_url: userInfo.avatar_url,
          provider: userInfo.provider,
          provider_id: userInfo.provider_id,
          email_verified: userInfo.email_verified,
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      } else {
        // Create new user using our new schema structure
        user = await this.userRepository.create({
          email: userInfo.email,
          full_name: userInfo.name,
          picture_url: userInfo.avatar_url,
          provider: userInfo.provider,
          provider_id: userInfo.provider_id,
          email_verified: userInfo.email_verified,
          last_login_at: new Date().toISOString()
          // Note: auth_user_id will be set by the database trigger
        });

        logger.info('New user created using desktop app schema', {
          userId: user.id,
          email: user.email,
          provider: user.provider
        });
      }

      return user;
    } catch (error) {
      logger.error('Error creating/updating user', { error: error.message, userInfo });
      throw error;
    }
  }

  /**
   * Safe method to find user by email using Supabase admin
   * This method provides compatibility for different Supabase client versions
   * @param {string} email - User email to search for
   * @returns {Object|null} User object or null
   */
  async findUserByEmailSafe(email) {
    try {
      const supabaseAdmin = getSupabaseAdminClient();

      if (!supabaseAdmin) {
        logger.warn('Supabase admin client not available, falling back to repository');
        return await this.userRepository.findByEmail(email);
      }

      return await getUserByEmailCompat(supabaseAdmin, email);
    } catch (error) {
      logger.error('Error in findUserByEmailSafe, falling back to repository', {
        error: error.message,
        email: email?.substring(0, 5) + '***'
      });

      // Fallback to repository method
      try {
        return await this.userRepository.findByEmail(email);
      } catch (fallbackError) {
        logger.error('Fallback method also failed', { error: fallbackError.message });
        throw fallbackError;
      }
    }
  }

  generateAccessToken(user) {
    return jwt.sign(
      {
        userId: user.id,
        email: user.email,
        name: user.full_name, // Use 'full_name' from our schema
        avatar_url: user.picture_url, // Use 'picture_url' from our schema
        provider: user.provider // Use 'provider' from our schema
      },
      this.jwtSecret,
      { expiresIn: this.jwtExpiry }
    );
  }

  generateRefreshToken(user) {
    return jwt.sign(
      { userId: user.id, type: 'refresh' },
      this.jwtSecret,
      { expiresIn: this.refreshTokenExpiry }
    );
  }

  async refreshAccessToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret);

      if (decoded.type !== 'refresh') {
        throw new ApiError('INVALID_REFRESH_TOKEN');
      }

      // Get user from database
      const user = await this.userRepository.findById(decoded.userId);
      if (!user) {
        throw new ApiError('USER_NOT_FOUND');
      }

      // Generate new access token
      const accessToken = this.generateAccessToken(user);

      return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600
      };
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        throw new ApiError('INVALID_REFRESH_TOKEN');
      }
      throw error;
    }
  }

  verifyAccessToken(token) {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        throw new ApiError('INVALID_ACCESS_TOKEN');
      }
      throw error;
    }
  }

  async storeRefreshToken(userId, refreshToken) {
    // In a real application, store refresh tokens in database
    // For now, we'll just validate them using JWT
    logger.debug('Refresh token generated for user', { userId });
  }

  async revokeRefreshToken(refreshToken) {
    // In a real application, mark refresh token as revoked in database
    logger.debug('Refresh token revoked');
  }

  generateState() {
    return crypto.randomBytes(32).toString('hex');
  }
}

module.exports = AuthService;