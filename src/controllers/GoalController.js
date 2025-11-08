const GoalRepository = require('../repositories/GoalRepository');
const { asyncHandler, validateRequired } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class GoalController {
  constructor() {
    this.goalRepository = new GoalRepository();
  }

  // Create a new goal
  createGoal = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const goalData = req.body;

    logger.info('Creating new goal', { userId, goalData });

    validateRequired(goalData, ['title']);

    const goal = await this.goalRepository.createGoal(userId, goalData);

    res.status(201).json({
      success: true,
      data: goal,
      message: 'Goal created successfully'
    });
  });

  // Get user's goals
  getUserGoals = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { status, include_completed } = req.query;

    const options = {
      status,
      includeCompleted: include_completed === 'true'
    };

    const goals = await this.goalRepository.getUserGoals(userId, options);

    res.json({
      success: true,
      data: goals
    });
  });

  // Get specific goal by ID
  getGoalById = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { goalId } = req.params;

    const goal = await this.goalRepository.findById(goalId, userId);

    if (!goal) {
      return res.status(404).json({
        success: false,
        error: { message: 'Goal not found' }
      });
    }

    // Get progress details
    const progress = await this.goalRepository.getGoalProgress(goalId, userId);

    res.json({
      success: true,
      data: {
        ...goal,
        progress: progress
      }
    });
  });

  // Update goal
  updateGoal = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { goalId } = req.params;
    const updateData = req.body;

    logger.info('Updating goal', { userId, goalId, updateData });

    const updatedGoal = await this.goalRepository.update(goalId, updateData, userId);

    res.json({
      success: true,
      data: updatedGoal,
      message: 'Goal updated successfully'
    });
  });

  // Update goal progress
  updateGoalProgress = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { goalId } = req.params;
    const { progress_percentage } = req.body;

    logger.info('Updating goal progress', { userId, goalId, progress_percentage });

    validateRequired({ progress_percentage }, ['progress_percentage']);

    if (progress_percentage < 0 || progress_percentage > 100) {
      return res.status(400).json({
        success: false,
        error: { message: 'Progress percentage must be between 0 and 100' }
      });
    }

    const updatedGoal = await this.goalRepository.updateGoalProgress(
      goalId,
      userId,
      progress_percentage
    );

    res.json({
      success: true,
      data: updatedGoal,
      message: 'Goal progress updated successfully'
    });
  });

  // Link goal to work session
  linkGoalToSession = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { goalId } = req.params;
    const { session_id } = req.body;

    logger.info('Linking goal to session', { userId, goalId, sessionId: session_id });

    validateRequired({ session_id }, ['session_id']);

    await this.goalRepository.linkGoalToSession(goalId, session_id, userId);

    res.json({
      success: true,
      message: 'Goal linked to session successfully'
    });
  });

  // Delete goal
  deleteGoal = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { goalId } = req.params;

    logger.info('Deleting goal', { userId, goalId });

    await this.goalRepository.delete(goalId, userId);

    res.json({
      success: true,
      message: 'Goal deleted successfully'
    });
  });

  // Get goal statistics
  getGoalStats = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    const stats = await this.goalRepository.getGoalStats(userId);

    res.json({
      success: true,
      data: stats
    });
  });

  // Get goals near deadline
  getGoalsNearDeadline = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { days_ahead = 7 } = req.query;

    const goals = await this.goalRepository.getGoalsNearDeadline(userId, parseInt(days_ahead));

    res.json({
      success: true,
      data: goals
    });
  });
}

module.exports = GoalController;