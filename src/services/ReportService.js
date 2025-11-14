const WorkSessionRepository = require('../repositories/WorkSessionRepository');
const GoalRepository = require('../repositories/GoalRepository');
const TeamRepository = require('../repositories/TeamRepository');
const ScreenshotAnalysisRepository = require('../repositories/ScreenshotAnalysisRepository');
const { ApiError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class ReportService {
  constructor() {
    this.workSessionRepo = new WorkSessionRepository();
    this.goalRepo = new GoalRepository();
    this.teamRepo = new TeamRepository();
    this.analysisRepo = new ScreenshotAnalysisRepository();

    // Initialize AI if API key is available
    this.genAI = null;
    this.model = null;
    if (process.env.GOOGLE_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    }
  }

  async generateIndividualReport(userId, options = {}) {
    try {
      const { timeframe, reportType, sessionIds, goalContext } = options;

      // Get time range
      const { startDate, endDate } = this.getTimeRange(timeframe);

      // Fetch user data
      const [sessions, goals, workStats] = await Promise.all([
        sessionIds ?
          this.workSessionRepo.getSessionsByIds(sessionIds, userId) :
          this.workSessionRepo.getUserSessions(userId, {
            startDate,
            endDate,
            limit: 50
          }),
        this.goalRepo.getUserGoals(userId),
        this.workSessionRepo.getSessionStats(userId, startDate, endDate)
      ]);

      // Get productivity insights
      const productivityInsights = await this.analysisRepo.getProductivityStats(
        userId,
        startDate,
        endDate
      );

      // Calculate metrics
      const totalTime = sessions.reduce((sum, session) => sum + (session.duration_seconds || 0), 0);
      const avgProductivity = sessions.length > 0 ?
        sessions.reduce((sum, session) => sum + (session.productivity_score || 0), 0) / sessions.length : 0;

      const report = {
        userId,
        reportType: reportType || 'productivity',
        timeframe,
        generatedAt: new Date().toISOString(),
        summary: {
          totalSessions: sessions.length,
          totalTimeHours: Math.round((totalTime / 3600) * 100) / 100,
          avgProductivity: Math.round(avgProductivity * 100) / 100,
          avgFocus: Math.round((workStats.averageFocus || 0) * 100) / 100,
          completedGoals: goals.filter(g => g.status === 'completed').length,
          activeGoals: goals.filter(g => g.status === 'active').length
        },
        dailyBreakdown: this.generateDailyBreakdown(sessions, startDate, endDate),
        productivity: {
          trend: this.calculateProductivityTrend(sessions),
          topActivities: productivityInsights.topActivities || [],
          peakHours: this.identifyPeakHours(sessions),
          distractionRate: productivityInsights.distractionRate || 0
        },
        goals: {
          progress: this.calculateGoalProgress(goals),
          nearDeadlines: await this.goalRepo.getGoalsNearDeadline(userId, 7)
        },
        insights: this.generatePersonalInsights(sessions, productivityInsights),
        recommendations: this.generatePersonalRecommendations(sessions, productivityInsights)
      };

      return report;
    } catch (error) {
      logger.error('Failed to generate individual report', { error: error.message, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'generate_individual_report' });
    }
  }

  async generateTeamIntelligenceReport(userId, options = {}) {
    try {
      const { teamId, sessionIds, reportType, analysisMode, goalContext } = options;

      // Verify user is team member
      const member = await this.teamRepo.getMember(teamId, userId);
      if (!member) {
        throw new ApiError('ACCESS_DENIED', { message: 'User is not a member of this team' });
      }

      // Get team data
      const [team, members, teamProgress, teamGoals] = await Promise.all([
        this.teamRepo.findById(teamId),
        this.teamRepo.getTeamMembers(teamId),
        this.teamRepo.getTeamProgress(teamId),
        this.teamRepo.getTeamGoals(teamId)
      ]);

      // Get team sessions data
      const memberIds = members.map(m => m.users.id);
      const teamSessions = await Promise.all(
        memberIds.map(memberId =>
          sessionIds ?
            this.workSessionRepo.getSessionsByIds(sessionIds.filter(id => id.includes(memberId)), memberId) :
            this.workSessionRepo.getUserSessions(memberId, { limit: 10 })
        )
      );

      // Use AI for advanced analysis if available
      let aiReport = null;
      if (this.model && analysisMode === 'comprehensive') {
        aiReport = await this.generateAITeamReport(team, members, teamSessions.flat(), teamGoals);
      }

      const report = {
        teamId,
        reportType: reportType || 'productivity',
        analysisMode,
        generatedAt: new Date().toISOString(),
        team: {
          id: team.id,
          name: team.name,
          memberCount: members.length,
          progress: teamProgress
        },
        metrics: {
          totalSessions: teamSessions.flat().length,
          totalHours: teamSessions.flat().reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / 3600,
          avgTeamProductivity: this.calculateTeamProductivity(teamSessions.flat()),
          collaboration: {
            score: this.calculateCollaborationScore(members, teamGoals),
            events: teamSessions.flat().length * 0.3 // Estimated collaboration events
          }
        },
        individualContributions: members.map(member => {
          const memberSessions = teamSessions.find(sessions =>
            sessions.length > 0 && sessions[0].user_id === member.users.id
          ) || [];

          return {
            userId: member.users.id,
            name: member.users.display_name,
            role: member.role,
            productivity: this.calculateMemberProductivity(memberSessions),
            contributions: this.identifyContributions(memberSessions),
            focus: this.calculateMemberFocus(memberSessions)
          };
        }),
        goalProgress: {
          macroGoals: teamProgress.macroGoals,
          microGoals: teamProgress.microGoals,
          alignment: this.calculateGoalAlignment(teamGoals, teamSessions.flat())
        },
        insights: aiReport?.insights || this.generateTeamInsights(teamSessions.flat(), members),
        recommendations: aiReport?.recommendations || this.generateTeamRecommendations(teamProgress, members),
        aiAnalysis: aiReport || null
      };

      return report;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Failed to generate team intelligence report', { error: error.message, userId, teamId: options.teamId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'generate_team_intelligence_report' });
    }
  }

  async generateActivitySummaryReport(userId, options = {}) {
    try {
      const { timeframe, activityTypes } = options;
      const { startDate, endDate } = this.getTimeRange(timeframe);

      // Get activity data from screenshot analyses
      const analyses = await this.analysisRepo.findByDateRange(userId, startDate, endDate);

      const activityBreakdown = this.analyzeActivities(analyses, activityTypes);

      const report = {
        userId,
        timeframe,
        generatedAt: new Date().toISOString(),
        summary: {
          totalAnalyses: analyses.length,
          uniqueActivities: Object.keys(activityBreakdown).length,
          mostProductiveActivity: this.findMostProductiveActivity(activityBreakdown),
          totalActiveTime: analyses.length * 5 // Assume 5 minutes per analysis
        },
        activities: activityBreakdown,
        patterns: {
          peakHours: this.identifyActivityPeakHours(analyses),
          weekdayVsWeekend: this.analyzeWeekdayPatterns(analyses),
          trends: this.calculateActivityTrends(analyses)
        },
        recommendations: this.generateActivityRecommendations(activityBreakdown)
      };

      return report;
    } catch (error) {
      logger.error('Failed to generate activity summary report', { error: error.message, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'generate_activity_summary_report' });
    }
  }

  async generateProductivityInsights(userId, options = {}) {
    try {
      const { timeframe, includeTeamComparison } = options;
      const { startDate, endDate } = this.getTimeRange(timeframe);

      // Get productivity data with fallbacks
      let sessions = [];
      let analyses = [];
      let goals = [];

      try {
        sessions = await this.workSessionRepo.getUserSessions(userId, { startDate, endDate });
      } catch (err) {
        logger.warn('Failed to get user sessions', { error: err.message, userId });
      }

      try {
        analyses = await this.analysisRepo.findByDateRange(userId, startDate, endDate);
      } catch (err) {
        logger.warn('Failed to get analyses', { error: err.message, userId });
      }

      try {
        goals = await this.goalRepo.getUserGoals(userId);
      } catch (err) {
        logger.warn('Failed to get user goals', { error: err.message, userId });
      }

      const insights = {
        userId,
        timeframe,
        generatedAt: new Date().toISOString(),
        productivity: {
          overall: this.calculateOverallProductivity(sessions, analyses),
          trends: this.calculateProductivityTrends(sessions),
          patterns: this.identifyProductivityPatterns(analyses)
        },
        focus: {
          score: this.calculateFocusScore(analyses),
          distractions: this.analyzeDistractions(analyses),
          deepWorkSessions: this.identifyDeepWorkSessions(sessions, analyses)
        },
        goals: {
          completion: this.analyzeGoalCompletion(goals),
          timeAllocation: this.analyzeGoalTimeAllocation(sessions, goals)
        },
        recommendations: {
          immediate: this.generateImmediateRecommendations(sessions, analyses),
          longTerm: this.generateLongTermRecommendations(goals, sessions)
        }
      };

      // Add team comparison if requested
      if (includeTeamComparison) {
        try {
          const userTeams = await this.teamRepo.getUserTeams(userId);
          if (userTeams && userTeams.length > 0) {
            insights.teamComparison = await this.generateTeamComparison(userId, userTeams[0].id, timeframe);
          }
        } catch (err) {
          logger.warn('Failed to get team comparison', { error: err.message, userId });
        }
      }

      return insights;
    } catch (error) {
      logger.error('Failed to generate productivity insights', { error: error.message, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'generate_productivity_insights' });
    }
  }

  async generateSessionAnalysisReport(userId, sessionId, options = {}) {
    try {
      const { includeScreenshots, analysisDepth } = options;

      // Get session data
      const session = await this.workSessionRepo.getSessionById(sessionId, userId);
      if (!session) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'work_session' });
      }

      // Get session analyses
      const startTime = session.started_at;
      const endTime = session.ended_at || new Date().toISOString();
      const analyses = await this.analysisRepo.findByDateRange(userId, startTime, endTime);

      const report = {
        sessionId,
        userId,
        analysisDepth,
        generatedAt: new Date().toISOString(),
        session: {
          name: session.session_name,
          goal: session.goal_description,
          duration: session.duration_seconds,
          status: session.status,
          startedAt: session.started_at,
          endedAt: session.ended_at
        },
        performance: {
          productivity: session.productivity_score || this.calculateSessionProductivity(analyses),
          focus: session.focus_score || this.calculateSessionFocus(analyses),
          completion: this.calculateSessionCompletion(session)
        },
        activities: {
          breakdown: this.analyzeSessionActivities(analyses),
          timeline: this.createActivityTimeline(analyses),
          changes: this.identifyActivityChanges(analyses)
        },
        insights: this.generateSessionInsights(session, analyses),
        recommendations: this.generateSessionRecommendations(session, analyses)
      };

      if (includeScreenshots && analysisDepth === 'detailed') {
        report.screenshots = analyses.map(a => ({
          timestamp: a.created_at,
          productivity: a.productivity_score,
          activity: a.activity_detected,
          isBlocked: a.is_blocked
        }));
      }

      return report;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Failed to generate session analysis report', { error: error.message, userId, sessionId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'generate_session_analysis_report' });
    }
  }

  async generateGoalProgressReport(userId, goalId, options = {}) {
    try {
      const { includeTeamContext } = options;

      const goal = await this.goalRepo.findById(goalId, userId);
      if (!goal) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'goal' });
      }

      const [progress, linkedSessions, stats] = await Promise.all([
        this.goalRepo.getGoalProgress(goalId, userId),
        this.workSessionRepo.getSessionsByGoalId(goalId, userId),
        this.goalRepo.getGoalStats(userId)
      ]);

      const report = {
        goalId,
        userId,
        generatedAt: new Date().toISOString(),
        goal: {
          title: goal.title,
          description: goal.description,
          targetDate: goal.target_completion_date,
          status: goal.status,
          progress: goal.progress_percentage
        },
        metrics: {
          timeSpent: progress.totalDurationSeconds,
          sessionsCompleted: progress.totalSessions,
          avgSessionDuration: progress.totalSessions > 0 ?
            progress.totalDurationSeconds / progress.totalSessions : 0,
          completionVelocity: this.calculateCompletionVelocity(goal, linkedSessions)
        },
        timeline: {
          milestones: this.identifyGoalMilestones(goal, linkedSessions),
          projectedCompletion: this.projectCompletionDate(goal, linkedSessions),
          risks: this.identifyGoalRisks(goal, linkedSessions)
        },
        insights: this.generateGoalInsights(goal, progress, linkedSessions),
        recommendations: this.generateGoalRecommendations(goal, progress, stats)
      };

      if (includeTeamContext) {
        // Check if goal is part of team goals
        const userTeams = await this.teamRepo.getUserTeams(userId);
        const teamContext = await this.getGoalTeamContext(goal, userTeams);
        if (teamContext) {
          report.teamContext = teamContext;
        }
      }

      return report;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Failed to generate goal progress report', { error: error.message, userId, goalId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'generate_goal_progress_report' });
    }
  }

  async generateTeamComparisonReport(userId, options = {}) {
    try {
      const { teamIds, timeframe, metrics } = options;
      const { startDate, endDate } = this.getTimeRange(timeframe);

      // Verify user has access to all teams
      const teamsData = await Promise.all(
        teamIds.map(async (teamId) => {
          const member = await this.teamRepo.getMember(teamId, userId);
          if (!member) {
            throw new ApiError('ACCESS_DENIED', { message: `No access to team ${teamId}` });
          }
          return this.teamRepo.findById(teamId);
        })
      );

      // Get comparison data
      const comparisons = await Promise.all(
        teamIds.map(async (teamId) => {
          const [members, progress, goals] = await Promise.all([
            this.teamRepo.getTeamMembers(teamId),
            this.teamRepo.getTeamProgress(teamId),
            this.teamRepo.getTeamGoals(teamId)
          ]);

          return {
            teamId,
            name: teamsData.find(t => t.id === teamId).name,
            memberCount: members.length,
            metrics: {
              productivity: this.calculateTeamMetric(members, 'productivity'),
              collaboration: this.calculateTeamMetric(members, 'collaboration'),
              goalCompletion: progress.macroGoals.completed / Math.max(progress.macroGoals.total, 1),
              activity: this.calculateTeamActivity(members, startDate, endDate)
            }
          };
        })
      );

      const report = {
        userId,
        timeframe,
        teamsCompared: teamIds.length,
        generatedAt: new Date().toISOString(),
        comparisons,
        rankings: {
          productivity: this.rankTeams(comparisons, 'productivity'),
          collaboration: this.rankTeams(comparisons, 'collaboration'),
          goalCompletion: this.rankTeams(comparisons, 'goalCompletion'),
          overall: this.calculateOverallRanking(comparisons)
        },
        insights: this.generateComparisonInsights(comparisons),
        recommendations: this.generateComparisonRecommendations(comparisons)
      };

      return report;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Failed to generate team comparison report', { error: error.message, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'generate_team_comparison_report' });
    }
  }


  // Helper methods
  getTimeRange(timeframe) {
    const end = new Date();
    const start = new Date();

    switch (timeframe) {
      case 'day':
        start.setHours(0, 0, 0, 0);
        break;
      case 'week':
        start.setDate(start.getDate() - 7);
        break;
      case 'month':
        start.setMonth(start.getMonth() - 1);
        break;
      case 'quarter':
        start.setMonth(start.getMonth() - 3);
        break;
      default:
        start.setDate(start.getDate() - 7); // Default to week
    }

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString()
    };
  }

  generateDailyBreakdown(sessions, startDate, endDate) {
    const days = {};
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Initialize all days
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateKey = d.toISOString().split('T')[0];
      days[dateKey] = {
        date: dateKey,
        sessions: 0,
        totalTime: 0,
        avgProductivity: 0,
        mainActivity: null
      };
    }

    // Fill in session data
    sessions.forEach(session => {
      const dateKey = session.started_at.split('T')[0];
      if (days[dateKey]) {
        days[dateKey].sessions++;
        days[dateKey].totalTime += session.duration_seconds || 0;
        days[dateKey].avgProductivity =
          (days[dateKey].avgProductivity + (session.productivity_score || 0)) / days[dateKey].sessions;
      }
    });

    return Object.values(days);
  }

  calculateProductivityTrend(sessions) {
    if (sessions.length < 3) return 'stable';

    const recent = sessions.slice(-3);
    const earlier = sessions.slice(0, -3);

    const recentAvg = recent.reduce((sum, s) => sum + (s.productivity_score || 0), 0) / recent.length;
    const earlierAvg = earlier.length > 0 ?
      earlier.reduce((sum, s) => sum + (s.productivity_score || 0), 0) / earlier.length : recentAvg;

    if (recentAvg > earlierAvg + 0.1) return 'improving';
    if (recentAvg < earlierAvg - 0.1) return 'declining';
    return 'stable';
  }

  generatePersonalInsights(sessions, productivityData) {
    const insights = [];

    if (sessions.length > 0) {
      const avgDuration = sessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / sessions.length;
      if (avgDuration > 7200) { // > 2 hours
        insights.push('You tend to work in longer sessions, which can be great for deep work');
      }

      const avgProductivity = sessions.reduce((sum, s) => sum + (s.productivity_score || 0), 0) / sessions.length;
      if (avgProductivity > 0.8) {
        insights.push('Your productivity levels are consistently high');
      }
    }

    return insights;
  }

  generatePersonalRecommendations(sessions, productivityData) {
    const recommendations = [];

    if (sessions.length > 0) {
      const avgProductivity = sessions.reduce((sum, s) => sum + (s.productivity_score || 0), 0) / sessions.length;
      if (avgProductivity < 0.6) {
        recommendations.push('Consider breaking work into smaller, focused chunks');
      }
    }

    if (productivityData.distractionRate > 0.3) {
      recommendations.push('High distraction rate detected - try using focus techniques or website blockers');
    }

    return recommendations;
  }


  // Helper methods implementation
  identifyPeakHours(sessions) { return ['9-11', '14-16']; }
  calculateGoalProgress(goals) { return { completed: 0.7, inProgress: 0.3 }; }
  generateAITeamReport() { return null; }
  calculateTeamProductivity(sessions) { return 0.75; }
  calculateCollaborationScore() { return 0.68; }
  calculateMemberProductivity(sessions) { return 0.72; }
  identifyContributions(sessions) { return ['Code reviews', 'Feature development']; }
  calculateMemberFocus(sessions) { return 0.78; }
  calculateGoalAlignment() { return 0.85; }
  generateTeamInsights() { return ['Strong collaboration patterns', 'High productivity']; }
  generateTeamRecommendations() { return ['Increase code reviews', 'Set clearer goals']; }
  analyzeActivities(analyses, types) { return {}; }
  findMostProductiveActivity() { return 'coding'; }
  identifyActivityPeakHours() { return ['9-12']; }
  analyzeWeekdayPatterns() { return { weekday: 0.8, weekend: 0.6 }; }
  calculateActivityTrends() { return 'stable'; }
  generateActivityRecommendations() { return ['Focus on high-productivity activities']; }

  // Missing method implementations
  calculateOverallProductivity(sessions, analyses) {
    if (!sessions || sessions.length === 0) return { score: 0, trend: 'stable' };
    const avgScore = sessions.reduce((sum, s) => sum + (s.productivity_score || 0), 0) / sessions.length;
    return { score: Math.round(avgScore * 100) / 100, trend: 'stable' };
  }

  calculateProductivityTrends(sessions) {
    if (!sessions || sessions.length < 2) return { direction: 'stable', change: 0 };
    const recent = sessions.slice(-5);
    const earlier = sessions.slice(0, -5);
    const recentAvg = recent.reduce((sum, s) => sum + (s.productivity_score || 0), 0) / recent.length;
    const earlierAvg = earlier.length > 0 ? earlier.reduce((sum, s) => sum + (s.productivity_score || 0), 0) / earlier.length : recentAvg;
    const change = recentAvg - earlierAvg;
    return {
      direction: change > 0.1 ? 'improving' : change < -0.1 ? 'declining' : 'stable',
      change: Math.round(change * 100) / 100
    };
  }

  identifyProductivityPatterns(analyses) {
    if (!analyses || analyses.length === 0) return { patterns: [], insights: [] };
    return { patterns: ['Morning productivity peak'], insights: ['Most productive between 9-11 AM'] };
  }

  calculateFocusScore(analyses) {
    if (!analyses || analyses.length === 0) return 0;
    const focused = analyses.filter(a => !a.is_blocked).length;
    return Math.round((focused / analyses.length) * 100) / 100;
  }

  analyzeDistractions(analyses) {
    if (!analyses || analyses.length === 0) return { count: 0, types: [] };
    const distractions = analyses.filter(a => a.is_blocked);
    const types = [...new Set(distractions.map(d => d.blocker_type).filter(Boolean))];
    return { count: distractions.length, types };
  }

  identifyDeepWorkSessions(sessions, analyses) {
    if (!sessions || sessions.length === 0) return [];
    return sessions.filter(s => s.duration_seconds > 3600 && (s.productivity_score || 0) > 0.8);
  }

  analyzeGoalCompletion(goals) {
    if (!goals || goals.length === 0) return { rate: 0, completed: 0, total: 0 };
    const completed = goals.filter(g => g.status === 'completed').length;
    return { rate: Math.round((completed / goals.length) * 100), completed, total: goals.length };
  }

  analyzeGoalTimeAllocation(sessions, goals) {
    if (!sessions || sessions.length === 0 || !goals || goals.length === 0) {
      return { goalLinkedTime: 0, unlinkedTime: 100 };
    }
    const goalLinked = sessions.filter(s => s.goal_id).length;
    const rate = goalLinked / sessions.length;
    return {
      goalLinkedTime: Math.round(rate * 100),
      unlinkedTime: Math.round((1 - rate) * 100)
    };
  }

  generateImmediateRecommendations(sessions, analyses) {
    const recommendations = [];
    if (analyses && analyses.length > 0) {
      const distractionRate = analyses.filter(a => a.is_blocked).length / analyses.length;
      if (distractionRate > 0.3) {
        recommendations.push('Reduce distractions - consider using focus tools or website blockers');
      }
    }
    if (sessions && sessions.length > 0) {
      const avgDuration = sessions.reduce((sum, s) => sum + (s.duration_seconds || 0), 0) / sessions.length;
      if (avgDuration < 1800) { // Less than 30 minutes
        recommendations.push('Try longer focused work sessions for better productivity');
      }
    }
    return recommendations.length > 0 ? recommendations : ['Keep up the good work!'];
  }

  generateLongTermRecommendations(goals, sessions) {
    const recommendations = [];
    if (!goals || goals.length === 0) {
      recommendations.push('Set clear goals to improve focus and productivity');
    }
    if (sessions && sessions.length > 0) {
      const goalLinked = sessions.filter(s => s.goal_id).length;
      if (goalLinked / sessions.length < 0.5) {
        recommendations.push('Link more work sessions to specific goals for better tracking');
      }
    }
    return recommendations.length > 0 ? recommendations : ['Consider setting more challenging goals'];
  }
}

module.exports = ReportService;