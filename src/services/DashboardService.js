const WorkSessionRepository = require('../repositories/WorkSessionRepository');
const GoalRepository = require('../repositories/GoalRepository');
const TeamRepository = require('../repositories/TeamRepository');
const ScreenshotAnalysisRepository = require('../repositories/ScreenshotAnalysisRepository');
const { ApiError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class DashboardService {
  constructor() {
    this.workSessionRepo = new WorkSessionRepository();
    this.goalRepo = new GoalRepository();
    this.teamRepo = new TeamRepository();
    this.analysisRepo = new ScreenshotAnalysisRepository();
  }

  async getDashboardOverview(userId) {
    try {
      logger.info('Getting dashboard overview', { userId });

      // Get all data in parallel for better performance
      const [
        todayStats,
        recentSessions,
        goalStats,
        teamOverview,
        productivityInsights,
        upcomingDeadlines
      ] = await Promise.all([
        this.getTodayStats(userId),
        this.getRecentSessions(userId),
        this.goalRepo.getGoalStats(userId),
        this.getTeamOverview(userId),
        this.getProductivityInsights(userId),
        this.getUpcomingDeadlines(userId)
      ]);

      return {
        todayStats,
        recentSessions,
        goals: goalStats,
        teams: teamOverview,
        productivity: productivityInsights,
        upcomingDeadlines
      };
    } catch (error) {
      logger.error('Failed to get dashboard overview', { error: error.message, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_dashboard_overview' });
    }
  }

  async getTodayStats(userId) {
    try {
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
      const todayEnd = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

      const stats = await this.workSessionRepo.getSessionStats(userId, todayStart, todayEnd);

      // Get active session if any
      const activeSession = await this.workSessionRepo.findActiveSession(userId);

      return {
        ...stats,
        activeSession: activeSession ? {
          id: activeSession.id,
          startedAt: activeSession.started_at,
          sessionName: activeSession.session_name,
          goalDescription: activeSession.goal_description,
          status: activeSession.status,
          duration: activeSession.started_at ?
            Math.floor((Date.now() - new Date(activeSession.started_at).getTime()) / 1000) : 0
        } : null
      };
    } catch (error) {
      logger.error('Failed to get today stats', { error: error.message, userId });
      throw error;
    }
  }

  async getRecentSessions(userId, limit = 5) {
    try {
      const sessions = await this.workSessionRepo.getUserSessions(userId, {
        limit,
        orderBy: 'started_at',
        orderDirection: 'desc'
      });

      return sessions.map(session => ({
        id: session.id,
        sessionName: session.session_name,
        goalDescription: session.goal_description,
        startedAt: session.started_at,
        endedAt: session.ended_at,
        duration: session.duration_seconds,
        status: session.status,
        productivityScore: session.productivity_score,
        focusScore: session.focus_score
      }));
    } catch (error) {
      logger.error('Failed to get recent sessions', { error: error.message, userId });
      throw error;
    }
  }

  async getTeamOverview(userId) {
    try {
      const teams = await this.teamRepo.getUserTeams(userId);

      const teamOverviews = await Promise.all(
        teams.map(async (team) => {
          try {
            const [members, progress] = await Promise.all([
              this.teamRepo.getTeamMembers(team.id),
              this.teamRepo.getTeamProgress(team.id)
            ]);

            return {
              id: team.id,
              name: team.name,
              description: team.description,
              memberRole: team.memberRole,
              memberCount: members.length,
              progress: progress,
              members: members.slice(0, 5).map(m => ({
                id: m.users.id,
                name: m.users.display_name,
                avatar: m.users.avatar_url,
                role: m.role
              }))
            };
          } catch (teamError) {
            logger.error('Failed to get team data', {
              error: teamError.message,
              teamId: team.id,
              userId
            });

            return {
              id: team.id,
              name: team.name,
              description: team.description,
              memberRole: team.memberRole,
              memberCount: 0,
              progress: null,
              members: [],
              error: 'Failed to load team data'
            };
          }
        })
      );

      return teamOverviews;
    } catch (error) {
      logger.error('Failed to get team overview', { error: error.message, userId });
      return [];
    }
  }

  async getProductivityInsights(userId) {
    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const stats = await this.analysisRepo.getProductivityStats(
        userId,
        sevenDaysAgo.toISOString(),
        new Date().toISOString()
      );

      // Get hourly productivity for the last 3 days
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const hourlyData = await this.analysisRepo.getHourlyProductivity(
        userId,
        threeDaysAgo.toISOString(),
        new Date().toISOString()
      );

      // Find peak productivity hours
      const peakHours = hourlyData
        .sort((a, b) => b.averageProductivity - a.averageProductivity)
        .slice(0, 3)
        .map(h => h.hour);

      return {
        weeklyAverage: stats.averageProductivity,
        totalAnalyses: stats.totalAnalyses,
        blockedSessions: stats.blockedSessions,
        topActivities: stats.topActivities,
        commonBlockers: stats.commonBlockers,
        peakHours: peakHours,
        trend: this.calculateTrend(hourlyData)
      };
    } catch (error) {
      logger.error('Failed to get productivity insights', { error: error.message, userId });
      return {
        weeklyAverage: 0,
        totalAnalyses: 0,
        blockedSessions: 0,
        topActivities: [],
        commonBlockers: [],
        peakHours: [],
        trend: 'stable'
      };
    }
  }

  async getUpcomingDeadlines(userId) {
    try {
      const goals = await this.goalRepo.getGoalsNearDeadline(userId, 14); // Next 2 weeks

      return goals.map(goal => ({
        id: goal.id,
        title: goal.title,
        targetDate: goal.target_completion_date,
        progress: goal.progress_percentage,
        daysLeft: Math.ceil(
          (new Date(goal.target_completion_date) - new Date()) / (1000 * 60 * 60 * 24)
        )
      }));
    } catch (error) {
      logger.error('Failed to get upcoming deadlines', { error: error.message, userId });
      return [];
    }
  }

  calculateTrend(hourlyData) {
    if (hourlyData.length < 4) return 'stable';

    const firstHalf = hourlyData.slice(0, Math.floor(hourlyData.length / 2));
    const secondHalf = hourlyData.slice(Math.floor(hourlyData.length / 2));

    const firstAvg = firstHalf.reduce((sum, h) => sum + h.averageProductivity, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, h) => sum + h.averageProductivity, 0) / secondHalf.length;

    if (secondAvg > firstAvg + 10) return 'improving';
    if (secondAvg < firstAvg - 10) return 'declining';
    return 'stable';
  }

  async getDetailedSessionSummary(userId, sessionId) {
    try {
      const session = await this.workSessionRepo.getSessionById(sessionId, userId);
      if (!session) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'work_session' });
      }

      // Get AI analysis for this session's screenshots
      const startTime = session.started_at;
      const endTime = session.ended_at || new Date().toISOString();

      const analyses = await this.analysisRepo.findByDateRange(userId, startTime, endTime);

      // Calculate session insights
      const avgProductivity = analyses.length > 0
        ? analyses.reduce((sum, a) => sum + (a.productivity_score || 0), 0) / analyses.length
        : 0;

      const topActivities = this.getTopActivities(analyses);
      const distractions = analyses.filter(a => a.is_blocked);

      // Generate recommendations
      const recommendations = this.generateSessionRecommendations(session, analyses);

      return {
        session: {
          id: session.id,
          sessionName: session.session_name,
          goalDescription: session.goal_description,
          startedAt: session.started_at,
          endedAt: session.ended_at,
          duration: session.duration_seconds,
          status: session.status
        },
        insights: {
          averageProductivity: Math.round(avgProductivity * 100) / 100,
          totalScreenshots: analyses.length,
          topActivities: topActivities,
          distractionsCount: distractions.length,
          focusedPeriods: this.identifyFocusedPeriods(analyses)
        },
        recommendations
      };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Failed to get detailed session summary', {
        error: error.message,
        userId,
        sessionId
      });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_session_summary' });
    }
  }

  getTopActivities(analyses) {
    const activityCounts = {};
    analyses.forEach(a => {
      if (a.activity_detected) {
        activityCounts[a.activity_detected] = (activityCounts[a.activity_detected] || 0) + 1;
      }
    });

    return Object.entries(activityCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 5)
      .map(([activity, count]) => ({ activity, count }));
  }

  identifyFocusedPeriods(analyses) {
    let focusedPeriods = [];
    let currentPeriod = null;

    analyses.forEach(analysis => {
      const isFocused = analysis.productivity_score > 70 && !analysis.is_blocked;

      if (isFocused) {
        if (!currentPeriod) {
          currentPeriod = {
            start: analysis.created_at,
            end: analysis.created_at,
            averageProductivity: analysis.productivity_score
          };
        } else {
          currentPeriod.end = analysis.created_at;
          currentPeriod.averageProductivity =
            (currentPeriod.averageProductivity + analysis.productivity_score) / 2;
        }
      } else {
        if (currentPeriod) {
          focusedPeriods.push(currentPeriod);
          currentPeriod = null;
        }
      }
    });

    if (currentPeriod) {
      focusedPeriods.push(currentPeriod);
    }

    return focusedPeriods.map(period => ({
      ...period,
      duration: Math.floor((new Date(period.end) - new Date(period.start)) / 1000)
    }));
  }

  generateSessionRecommendations(session, analyses) {
    const recommendations = [];

    if (!analyses.length) {
      return [{
        type: 'info',
        message: 'No activity analysis available for this session.'
      }];
    }

    const avgProductivity = analyses.reduce((sum, a) => sum + (a.productivity_score || 0), 0) / analyses.length;
    const distractionRate = (analyses.filter(a => a.is_blocked).length / analyses.length) * 100;

    if (avgProductivity < 60) {
      recommendations.push({
        type: 'improvement',
        message: 'Consider breaking work into smaller, focused chunks to improve productivity.',
        priority: 'high'
      });
    }

    if (distractionRate > 30) {
      recommendations.push({
        type: 'focus',
        message: 'High distraction rate detected. Try using website blockers or focus techniques.',
        priority: 'high'
      });
    }

    if (session.duration_seconds && session.duration_seconds > 14400) { // 4 hours
      recommendations.push({
        type: 'break',
        message: 'Long session detected. Remember to take regular breaks for better focus.',
        priority: 'medium'
      });
    }

    return recommendations;
  }
}

module.exports = DashboardService;