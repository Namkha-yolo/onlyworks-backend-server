const TeamRepository = require('../repositories/TeamRepository');
const { asyncHandler, validateRequired } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class TeamController {
  constructor() {
    this.teamRepository = new TeamRepository();
  }

  // Create a new team
  createTeam = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const teamData = req.body;

    logger.info('Creating new team', { userId, teamData });

    validateRequired(teamData, ['name']);

    const team = await this.teamRepository.createTeam(userId, teamData);

    res.status(201).json({
      success: true,
      data: team,
      message: 'Team created successfully'
    });
  });

  // Get user's teams
  getUserTeams = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    const teams = await this.teamRepository.getUserTeams(userId);

    res.json({
      success: true,
      data: teams
    });
  });

  // Get team details with members and progress
  getTeamDetails = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { teamId } = req.params;

    // Verify user is team member
    const member = await this.teamRepository.getMember(teamId, userId);
    if (!member) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You are not a member of this team.' }
      });
    }

    const [team, members, progress, macroGoals, microGoals] = await Promise.all([
      this.teamRepository.findById(teamId),
      this.teamRepository.getTeamMembers(teamId),
      this.teamRepository.getTeamProgress(teamId),
      this.teamRepository.getTeamGoals(teamId, 'macro'),
      this.teamRepository.getTeamGoals(teamId, 'micro')
    ]);

    res.json({
      success: true,
      data: {
        team,
        members: members.map(m => ({
          id: m.users.id,
          name: m.users.display_name,
          email: m.users.email,
          avatar: m.users.avatar_url,
          role: m.role,
          joinedAt: m.joined_at
        })),
        progress,
        goals: {
          macro: macroGoals,
          micro: microGoals
        },
        userRole: member.role
      }
    });
  });

  // Join team by invite code
  joinTeamByInvite = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { invite_code } = req.body;

    logger.info('User joining team by invite code', { userId, inviteCode: invite_code });

    validateRequired({ invite_code }, ['invite_code']);

    const team = await this.teamRepository.joinTeamByInviteCode(invite_code, userId);

    res.json({
      success: true,
      data: team,
      message: 'Successfully joined team'
    });
  });

  // Leave team
  leaveTeam = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { teamId } = req.params;

    logger.info('User leaving team', { userId, teamId });

    await this.teamRepository.removeMember(teamId, userId, userId);

    res.json({
      success: true,
      message: 'Successfully left team'
    });
  });

  // Remove team member (admin only)
  removeMember = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { teamId, memberId } = req.params;

    logger.info('Removing team member', { userId, teamId, memberId });

    await this.teamRepository.removeMember(teamId, memberId, userId);

    res.json({
      success: true,
      message: 'Member removed successfully'
    });
  });

  // Create team goal
  createTeamGoal = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { teamId } = req.params;
    const goalData = req.body;

    logger.info('Creating team goal', { userId, teamId, goalData });

    validateRequired(goalData, ['title', 'type']);

    if (!['macro', 'micro'].includes(goalData.type)) {
      return res.status(400).json({
        success: false,
        error: { message: 'Goal type must be either "macro" or "micro"' }
      });
    }

    const goal = await this.teamRepository.createTeamGoal(teamId, userId, goalData);

    res.status(201).json({
      success: true,
      data: goal,
      message: 'Team goal created successfully'
    });
  });

  // Get team goals
  getTeamGoals = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { teamId } = req.params;
    const { type } = req.query;

    // Verify user is team member
    const member = await this.teamRepository.getMember(teamId, userId);
    if (!member) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You are not a member of this team.' }
      });
    }

    const goals = await this.teamRepository.getTeamGoals(teamId, type);

    res.json({
      success: true,
      data: goals
    });
  });

  // Update team goal progress
  updateTeamGoalProgress = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { teamId, goalId } = req.params;
    const { progress_percentage } = req.body;

    logger.info('Updating team goal progress', { userId, teamId, goalId, progress_percentage });

    validateRequired({ progress_percentage }, ['progress_percentage']);

    if (progress_percentage < 0 || progress_percentage > 100) {
      return res.status(400).json({
        success: false,
        error: { message: 'Progress percentage must be between 0 and 100' }
      });
    }

    const updatedGoal = await this.teamRepository.updateTeamGoalProgress(
      goalId,
      progress_percentage,
      userId
    );

    res.json({
      success: true,
      data: updatedGoal,
      message: 'Team goal progress updated successfully'
    });
  });

  // Get team progress overview
  getTeamProgress = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { teamId } = req.params;

    // Verify user is team member
    const member = await this.teamRepository.getMember(teamId, userId);
    if (!member) {
      return res.status(403).json({
        success: false,
        error: { message: 'Access denied. You are not a member of this team.' }
      });
    }

    const progress = await this.teamRepository.getTeamProgress(teamId);

    res.json({
      success: true,
      data: progress
    });
  });

  // Regenerate invite code (admin only)
  regenerateInviteCode = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { teamId } = req.params;

    logger.info('Regenerating team invite code', { userId, teamId });

    const team = await this.teamRepository.regenerateInviteCode(teamId, userId);

    res.json({
      success: true,
      data: { invite_code: team.invite_code },
      message: 'Invite code regenerated successfully'
    });
  });

  // Update team settings (admin only)
  updateTeamSettings = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { teamId } = req.params;
    const updateData = req.body;

    logger.info('Updating team settings', { userId, teamId, updateData });

    // Verify user is admin
    const member = await this.teamRepository.getMember(teamId, userId);
    if (!member || member.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: { message: 'Only team admins can update settings' }
      });
    }

    const updatedTeam = await this.teamRepository.update(teamId, updateData);

    res.json({
      success: true,
      data: updatedTeam,
      message: 'Team settings updated successfully'
    });
  });
}

module.exports = TeamController;