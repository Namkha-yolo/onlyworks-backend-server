const { getSupabaseAdminClient } = require('../config/database');
const { logger } = require('../utils/logger');

class AdminController {
  async fixAuthUserIds(req, res, next) {
    try {
      const supabaseAdmin = getSupabaseAdminClient();

      if (!supabaseAdmin) {
        return res.status(500).json({
          success: false,
          message: 'Admin client not available'
        });
      }

      logger.info('Starting auth_user_id fix...');

      // Get all users where auth_user_id is null
      const { data: users, error: fetchError } = await supabaseAdmin
        .from('users')
        .select('id, email, auth_user_id')
        .is('auth_user_id', null);

      if (fetchError) {
        logger.error('Error fetching users:', fetchError);
        return res.status(500).json({
          success: false,
          message: 'Failed to fetch users',
          error: fetchError.message
        });
      }

      if (!users || users.length === 0) {
        logger.info('No users found with null auth_user_id');
        return res.json({
          success: true,
          message: 'No users need updating',
          updated: 0
        });
      }

      logger.info(`Found ${users.length} users without auth_user_id`);

      const results = [];

      // Update each user to set auth_user_id = id
      for (const user of users) {
        logger.info(`Updating user ${user.id} (${user.email})...`);

        const { error: updateError } = await supabaseAdmin
          .from('users')
          .update({ auth_user_id: user.id })
          .eq('id', user.id);

        if (updateError) {
          logger.error(`Error updating user ${user.id}:`, updateError);
          results.push({ userId: user.id, success: false, error: updateError.message });
        } else {
          logger.info(`✓ Updated user ${user.id}`);
          results.push({ userId: user.id, success: true });
        }
      }

      const successCount = results.filter(r => r.success).length;

      res.json({
        success: true,
        message: `Updated ${successCount} of ${users.length} users`,
        updated: successCount,
        total: users.length,
        results
      });

    } catch (error) {
      logger.error('Exception in fixAuthUserIds', { error: error.message });
      next(error);
    }
  }
}

module.exports = AdminController;