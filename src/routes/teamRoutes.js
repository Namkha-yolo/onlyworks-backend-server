const express = require('express');
const TeamController = require('../controllers/TeamController');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const teamController = new TeamController();

// Apply authentication to all team routes
router.use(authenticateUser);

// Create new team
router.post('/', teamController.createTeam);

// Get user's teams
router.get('/', teamController.getUserTeams);

// Join team by invite code
router.post('/join', teamController.joinTeamByInvite);

// Get team details
router.get('/:teamId', teamController.getTeamDetails);

// Update team settings
router.put('/:teamId', teamController.updateTeamSettings);

// Leave team
router.delete('/:teamId/leave', teamController.leaveTeam);

// Remove team member (admin only)
router.delete('/:teamId/members/:memberId', teamController.removeMember);

// Get team progress
router.get('/:teamId/progress', teamController.getTeamProgress);

// Create team goal
router.post('/:teamId/goals', teamController.createTeamGoal);

// Get team goals
router.get('/:teamId/goals', teamController.getTeamGoals);

// Update team goal progress
router.put('/:teamId/goals/:goalId/progress', teamController.updateTeamGoalProgress);

// Regenerate invite code
router.post('/:teamId/invite/regenerate', teamController.regenerateInviteCode);

module.exports = router;