const BaseRepository = require('./BaseRepository');

class GoalRepository extends BaseRepository {
  constructor() {
    super('goals');
  }

  async createGoal(userId, goalData) {
    return this.create({
      user_id: userId,
      title: goalData.title,
      description: goalData.description,
      target_completion_date: goalData.target_completion_date,
      status: 'active',
      progress_percentage: 0,
      auto_tracked: goalData.auto_tracked !== false,
      completion_criteria: goalData.completion_criteria || null
    });
  }

  async getUserGoals(userId, options = {}) {
    const { status, includeCompleted = false } = options;

    const filters = {};
    if (status) {
      filters.status = status;
    } else if (!includeCompleted) {
      filters.status = 'active';
    }

    return this.findByUserId(userId, filters);
  }

  async updateGoalProgress(goalId, userId, progressPercentage) {
    const updateData = { progress_percentage: progressPercentage };

    // Auto-complete goal if progress reaches 100%
    if (progressPercentage >= 100) {
      updateData.status = 'completed';
    }

    return this.update(goalId, updateData, userId);
  }

  async getGoalStats(userId) {
    try {
      const goals = await this.findByUserId(userId);

      const totalGoals = goals.length;
      const completedGoals = goals.filter(g => g.status === 'completed').length;
      const activeGoals = goals.filter(g => g.status === 'active').length;

      const totalProgress = goals
        .filter(g => g.status === 'active')
        .reduce((sum, goal) => sum + (goal.progress_percentage || 0), 0);

      const averageProgress = activeGoals > 0 ? totalProgress / activeGoals : 0;

      return {
        totalGoals,
        completedGoals,
        activeGoals,
        averageProgress: Math.round(averageProgress * 100) / 100,
        completionRate: totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0
      };
    } catch (error) {
      throw error;
    }
  }

  async getGoalsNearDeadline(userId, daysAhead = 7) {
    try {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);

      const { data, error } = await this.supabase
        .from(this.tableName)
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .not('target_completion_date', 'is', null)
        .lte('target_completion_date', futureDate.toISOString().split('T')[0])
        .order('target_completion_date', { ascending: true });

      if (error) {
        throw error;
      }

      return data || [];
    } catch (error) {
      throw error;
    }
  }

  async linkGoalToSession(goalId, sessionId, userId) {
    try {
      // Update the work session to include the goal reference
      const { error } = await this.supabase
        .from('work_sessions')
        .update({ goal_id: goalId })
        .eq('id', sessionId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  async getGoalProgress(goalId, userId) {
    try {
      // Get sessions linked to this goal
      const { data: sessions, error } = await this.supabase
        .from('work_sessions')
        .select('*')
        .eq('goal_id', goalId)
        .eq('user_id', userId)
        .eq('status', 'completed');

      if (error) {
        throw error;
      }

      const totalSessions = sessions?.length || 0;
      const totalDuration = sessions?.reduce((sum, session) => sum + (session.duration_seconds || 0), 0) || 0;

      return {
        totalSessions,
        totalDurationSeconds: totalDuration,
        totalHours: Math.round((totalDuration / 3600) * 100) / 100,
        sessions: sessions || []
      };
    } catch (error) {
      throw error;
    }
  }
}

module.exports = GoalRepository;