const BaseRepository = require('./BaseRepository');

class SessionGoalRepository extends BaseRepository {
  constructor() {
    super('session_goals');
  }

  async getSessionGoals(sessionId) {
    try {
      const { logger } = require('../utils/logger');
      logger.info(`Getting session goals for session ${sessionId}`);

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('session_id', sessionId)
        .order('order_index', { ascending: true });

      if (error) {
        logger.error(`Error getting session goals`, {
          error: error.message,
          code: error.code,
          sessionId
        });
        throw error;
      }

      return data || [];
    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Failed to get session goals', {
        error: error.message,
        sessionId,
        tableName: this.tableName
      });
      throw error;
    }
  }

  async createSessionGoals(userId, sessionId, goals) {
    try {
      const { logger } = require('../utils/logger');
      logger.info(`Creating ${goals.length} goals for session ${sessionId}`);

      const goalsToInsert = goals.map((goalText, index) => ({
        user_id: userId,
        session_id: sessionId,
        goal_text: goalText,
        status: 'pending',
        priority: 'medium',
        order_index: index + 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));

      const { data, error } = await this.supabase
        .from(this.tableName)
        .insert(goalsToInsert)
        .select();

      if (error) {
        logger.error(`Error creating session goals`, {
          error: error.message,
          code: error.code,
          sessionId,
          goalCount: goals.length
        });
        throw error;
      }

      logger.info(`Created ${data.length} session goals successfully`, { sessionId });
      return data;
    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Failed to create session goals', {
        error: error.message,
        userId,
        sessionId,
        goalCount: goals.length
      });
      throw error;
    }
  }

  async updateGoalStatus(goalId, userId, status) {
    try {
      const { logger } = require('../utils/logger');
      logger.info(`Updating goal ${goalId} status to ${status}`);

      const { data, error } = await this.supabase
        .from(this.tableName)
        .update({
          status,
          updated_at: new Date().toISOString(),
          ...(status === 'completed' && { completed_at: new Date().toISOString() })
        })
        .eq('id', goalId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) {
        logger.error(`Error updating goal status`, {
          error: error.message,
          code: error.code,
          goalId,
          status
        });
        throw error;
      }

      return data;
    } catch (error) {
      const { logger } = require('../utils/logger');
      logger.error('Failed to update goal status', {
        error: error.message,
        goalId,
        userId,
        status
      });
      throw error;
    }
  }
}

module.exports = SessionGoalRepository;