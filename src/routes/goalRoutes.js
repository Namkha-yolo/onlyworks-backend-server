const express = require('express');
const GoalController = require('../controllers/GoalController');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const goalController = new GoalController();

// Apply authentication to all goal routes
router.use(authenticateUser);

// Create new goal
router.post('/', goalController.createGoal);

// Get user's goals
router.get('/', goalController.getUserGoals);

// Get goal statistics
router.get('/stats', goalController.getGoalStats);

// Get goals near deadline
router.get('/deadlines', goalController.getGoalsNearDeadline);

// Get specific goal by ID
router.get('/:goalId', goalController.getGoalById);

// Update goal
router.put('/:goalId', goalController.updateGoal);

// Update goal progress
router.put('/:goalId/progress', goalController.updateGoalProgress);

// Link goal to work session
router.post('/:goalId/link-session', goalController.linkGoalToSession);

// Delete goal
router.delete('/:goalId', goalController.deleteGoal);

module.exports = router;