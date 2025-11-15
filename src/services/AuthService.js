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
      scope: 'openid email profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
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
        provider,
        timestamp: new Date().toISOString()
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

    // Log the parameters being sent to Google
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || `${process.env.BASE_URL}/api/auth/oauth/google/callback`;
    logger.info('Exchanging code for tokens', {
      clientId: clientId?.substring(0, 20) + '...',
      clientSecret: clientSecret?.substring(0, 10) + '...',
      redirectUri,
      codeLength: code?.length,
      baseUrl: process.env.BASE_URL,
      hasClientSecret: !!clientSecret,
      envGoogleRedirectUri: process.env.GOOGLE_REDIRECT_URI
    });

    // Exchange code for tokens using Node.js HTTPS (more reliable than fetch)
    const https = require('https');
    const querystring = require('querystring');

    const postData = querystring.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri
    });

    const tokens = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'oauth2.googleapis.com',
        port: 443,
        path: '/token',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'onlyworks-backend/1.0.0'
        }
      };

      const req = https.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            logger.info('Google token response', {
              status: res.statusCode,
              hasAccessToken: !!parsed.access_token,
              error: parsed.error,
              errorDescription: parsed.error_description
            });
            resolve({ ok: res.statusCode === 200, status: res.statusCode, data: parsed });
          } catch (parseError) {
            logger.error('Failed to parse Google token response', { error: parseError.message, rawData: data });
            reject(parseError);
          }
        });
      });

      req.on('error', (error) => {
        logger.error('HTTPS request error to Google OAuth', { error: error.message });
        reject(error);
      });

      req.write(postData);
      req.end();
    });

    const tokenResponse = { ok: tokens.ok, status: tokens.status };
    const tokensData = tokens.data;

    if (!tokenResponse.ok) {
      throw new ApiError('OAUTH_TOKEN_EXCHANGE_FAILED', {
        provider: 'google',
        error: tokensData.error,
        error_description: tokensData.error_description
      });
    }

    // Get user info
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokensData.access_token}` }
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
      logger.info('Looking for existing user by email', {
        email: userInfo.email?.substring(0, 10) + '...',
        provider: userInfo.provider
      });

      // Try to find existing user by email
      let user = null;
      try {
        user = await this.userRepository.findByEmail(userInfo.email);
        logger.info('User lookup result', {
          found: !!user,
          userId: user?.id,
          email: userInfo.email?.substring(0, 10) + '...'
        });
      } catch (findError) {
        logger.warn('Error finding user by email, will try to create new user', {
          error: findError.message,
          email: userInfo.email?.substring(0, 10) + '...'
        });
        user = null; // Ensure user is null if lookup fails
      }

      if (user) {
        // Update existing user using our new schema
        logger.info('Updating existing user', { userId: user.id });
        user = await this.userRepository.update(user.id, {
          full_name: userInfo.name,
          picture_url: userInfo.avatar_url,
          provider: userInfo.provider,
          provider_id: userInfo.provider_id,
          email_verified: userInfo.email_verified,
          last_login_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        logger.info('User updated successfully', { userId: user.id });
      } else {
        // Create new user using our new schema structure
        logger.info('Creating new user', { email: userInfo.email?.substring(0, 10) + '...' });

        try {
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

          logger.info('New user created successfully', {
            userId: user.id,
            email: userInfo.email?.substring(0, 10) + '...',
            provider: user.provider
          });
        } catch (createError) {
          // If creation fails due to duplicate, try to find and update the user
          if (createError.code === '23505') { // PostgreSQL unique constraint violation
            logger.warn('User creation failed due to duplicate, attempting to find and update existing user');

            try {
              // Use a small delay to ensure any concurrent operations complete
              await new Promise(resolve => setTimeout(resolve, 100));

              user = await this.userRepository.findByEmail(userInfo.email);
              if (user) {
                logger.info('Found existing user, updating...', { userId: user.id });
                user = await this.userRepository.update(user.id, {
                  full_name: userInfo.name,
                  picture_url: userInfo.avatar_url,
                  provider: userInfo.provider,
                  provider_id: userInfo.provider_id,
                  email_verified: userInfo.email_verified,
                  last_login_at: new Date().toISOString(),
                  updated_at: new Date().toISOString()
                });
                logger.info('Successfully updated user after duplicate creation attempt', { userId: user.id });
              } else {
                // User still not found - try direct database query with admin client
                logger.warn('User not found with repository method, trying direct query');
                const directUser = await this.findUserByEmailDirect(userInfo.email);
                if (directUser) {
                  user = directUser;
                  logger.info('Found user with direct query', { userId: user.id });
                } else {
                  logger.error('User still not found after duplicate constraint error');
                  throw new Error(`User exists (duplicate constraint) but cannot be found: ${userInfo.email}`);
                }
              }
            } catch (findError) {
              logger.error('Failed to find/update user after duplicate creation', {
                error: findError.message,
                email: userInfo.email?.substring(0, 10) + '...'
              });
              throw findError;
            }
          } else {
            throw createError; // Re-throw non-duplicate errors
          }
        }
      }

      return user;
    } catch (error) {
      logger.error('Error in createOrUpdateUser', {
        error: error.message,
        code: error.code,
        email: userInfo?.email?.substring(0, 10) + '...'
      });
      throw error;
    }
  }

  /**
   * Direct database query to find user by email using admin client
   * Used as a fallback when repository methods fail
   * @param {string} email - User email to search for
   * @returns {Object|null} User object or null
   */
  async findUserByEmailDirect(email) {
    try {
      const supabaseAdmin = getSupabaseAdminClient();

      if (!supabaseAdmin) {
        logger.warn('Supabase admin client not available for direct query');
        return null;
      }

      const { data, error } = await supabaseAdmin
        .from('users')
        .select('*')
        .eq('email', email)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 is "not found"
        logger.error('Direct user query failed', { error: error.message, email: email?.substring(0, 5) + '***' });
        return null;
      }

      return data;
    } catch (error) {
      logger.error('Error in findUserByEmailDirect', {
        error: error.message,
        email: email?.substring(0, 5) + '***'
      });
      return null;
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