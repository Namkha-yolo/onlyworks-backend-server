/**
 * Supabase Compatibility Utilities
 * Handles deprecated methods and provides fallbacks for different client versions
 */

const { logger } = require('./logger');

/**
 * Get user by email with compatibility for both old and new Supabase client versions
 * @param {Object} supabaseAdmin - Supabase admin client
 * @param {string} email - User email to search for
 * @returns {Object} User object or null
 */
async function getUserByEmailCompat(supabaseAdmin, email) {
  try {
    // Try the new method first (Supabase v2.0+)
    if (supabaseAdmin?.auth?.admin?.listUsers) {
      logger.debug('Using new Supabase listUsers method');
      const { data, error } = await supabaseAdmin.auth.admin.listUsers();

      if (error) {
        throw error;
      }

      const user = data.users.find(u => u.email === email);
      return user || null;
    }

    // Fallback to deprecated method (for older deployments)
    if (supabaseAdmin?.auth?.admin?.getUserByEmail) {
      logger.debug('Falling back to deprecated getUserByEmail method');
      const { data: user, error } = await supabaseAdmin.auth.admin.getUserByEmail(email);

      if (error) {
        throw error;
      }

      return user;
    }

    // If neither method is available, throw an error
    throw new Error('No compatible Supabase auth admin method available');

  } catch (error) {
    logger.error('Error in getUserByEmailCompat', {
      error: error.message,
      email: email?.substring(0, 5) + '***' // Log partial email for debugging
    });
    throw error;
  }
}

/**
 * Create or update user using Supabase admin auth
 * @param {Object} supabaseAdmin - Supabase admin client
 * @param {Object} userData - User data to create/update
 * @returns {Object} User object
 */
async function createUserCompat(supabaseAdmin, userData) {
  try {
    // Try the new method first
    if (supabaseAdmin?.auth?.admin?.createUser) {
      const { data, error } = await supabaseAdmin.auth.admin.createUser({
        email: userData.email,
        password: userData.password || generateRandomPassword(),
        email_confirm: true,
        user_metadata: {
          full_name: userData.full_name,
          avatar_url: userData.avatar_url,
          provider: userData.provider
        }
      });

      if (error) {
        throw error;
      }

      return data.user;
    }

    throw new Error('No compatible Supabase user creation method available');

  } catch (error) {
    logger.error('Error in createUserCompat', {
      error: error.message,
      email: userData.email?.substring(0, 5) + '***'
    });
    throw error;
  }
}

/**
 * Generate a random password for OAuth users
 * @returns {string} Random password
 */
function generateRandomPassword() {
  return Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12);
}

/**
 * Update user metadata using Supabase admin
 * @param {Object} supabaseAdmin - Supabase admin client
 * @param {string} userId - User ID
 * @param {Object} metadata - Metadata to update
 * @returns {Object} Updated user object
 */
async function updateUserMetadataCompat(supabaseAdmin, userId, metadata) {
  try {
    if (supabaseAdmin?.auth?.admin?.updateUserById) {
      const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        user_metadata: metadata
      });

      if (error) {
        throw error;
      }

      return data.user;
    }

    throw new Error('No compatible Supabase user update method available');

  } catch (error) {
    logger.error('Error in updateUserMetadataCompat', {
      error: error.message,
      userId
    });
    throw error;
  }
}

module.exports = {
  getUserByEmailCompat,
  createUserCompat,
  updateUserMetadataCompat,
  generateRandomPassword
};