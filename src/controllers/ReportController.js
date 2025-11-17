const ReportService = require('../services/ReportService');
const ReportsRepository = require('../repositories/ReportsRepository');
const { asyncHandler, validateRequired } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class ReportController {
  constructor() {
    this.reportService = new ReportService();
    this.reportsRepo = new ReportsRepository();
  }

  // Generate individual user report
  generateIndividualReport = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { timeframe, reportType, sessionIds, goalContext } = req.body;

    logger.info('Generating individual report', { userId, reportType });

    const report = await this.reportService.generateIndividualReport(userId, {
      timeframe: timeframe || 'week',
      reportType: reportType || 'productivity',
      sessionIds,
      goalContext
    });

    res.json({
      success: true,
      data: report,
      message: 'Individual report generated successfully'
    });
  });

  // Generate team intelligence report
  generateTeamIntelligenceReport = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { teamId, sessionIds, reportType, analysisMode, goalContext } = req.body;

    logger.info('Generating team intelligence report', { userId, teamId, reportType });

    validateRequired({ teamId, sessionIds }, ['teamId', 'sessionIds']);

    const report = await this.reportService.generateTeamIntelligenceReport(userId, {
      teamId,
      sessionIds,
      reportType: reportType || 'productivity',
      analysisMode: analysisMode || 'comprehensive',
      goalContext
    });

    res.json({
      success: true,
      data: report,
      message: 'Team intelligence report generated successfully'
    });
  });

  // Generate activity summary report
  generateActivitySummaryReport = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { timeframe, activityTypes } = req.body;

    logger.info('Generating activity summary report', { userId, timeframe });

    const report = await this.reportService.generateActivitySummaryReport(userId, {
      timeframe: timeframe || 'week',
      activityTypes
    });

    res.json({
      success: true,
      data: report,
      message: 'Activity summary report generated successfully'
    });
  });

  // Generate productivity insights report
  generateProductivityInsights = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { timeframe, includeTeamComparison } = req.body;

    logger.info('Generating productivity insights report', { userId, timeframe });

    const report = await this.reportService.generateProductivityInsights(userId, {
      timeframe: timeframe || 'month',
      includeTeamComparison: includeTeamComparison || false
    });

    res.json({
      success: true,
      data: report,
      message: 'Productivity insights report generated successfully'
    });
  });

  // Generate session analysis report
  generateSessionAnalysisReport = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { sessionId } = req.params;
    const { includeScreenshots, analysisDepth } = req.body;

    logger.info('Generating session analysis report', { userId, sessionId });

    const report = await this.reportService.generateSessionAnalysisReport(userId, sessionId, {
      includeScreenshots: includeScreenshots || false,
      analysisDepth: analysisDepth || 'standard'
    });

    res.json({
      success: true,
      data: report,
      message: 'Session analysis report generated successfully'
    });
  });

  // Generate goal progress report
  generateGoalProgressReport = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { goalId } = req.params;
    const { includeTeamContext } = req.query;

    logger.info('Generating goal progress report', { userId, goalId });

    const report = await this.reportService.generateGoalProgressReport(userId, goalId, {
      includeTeamContext: includeTeamContext === 'true'
    });

    res.json({
      success: true,
      data: report,
      message: 'Goal progress report generated successfully'
    });
  });

  // Generate team comparison report
  generateTeamComparisonReport = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { teamIds, timeframe, metrics } = req.body;

    logger.info('Generating team comparison report', { userId, teamIds, timeframe });

    validateRequired({ teamIds }, ['teamIds']);

    const report = await this.reportService.generateTeamComparisonReport(userId, {
      teamIds,
      timeframe: timeframe || 'month',
      metrics: metrics || ['productivity', 'collaboration', 'goals']
    });

    res.json({
      success: true,
      data: report,
      message: 'Team comparison report generated successfully'
    });
  });

  // Get user's session reports
  getUserSessionReports = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { limit = 50, startDate, endDate } = req.query;

    logger.info('Getting user session reports', { userId, limit });

    const reports = await this.reportsRepo.getUserReports(userId, {
      limit: parseInt(limit),
      startDate,
      endDate
    });

    res.json({
      success: true,
      data: reports,
      message: 'User session reports retrieved successfully'
    });
  });

  // Get specific session report
  getSessionReport = asyncHandler(async (req, res) => {
    const { sessionId } = req.params;
    const { userId } = req.user;

    logger.info('Getting session report', { sessionId, userId });

    const report = await this.reportsRepo.getBySessionId(sessionId, userId);

    if (!report) {
      return res.status(404).json({
        success: false,
        error: { message: 'Session report not found' }
      });
    }

    res.json({
      success: true,
      data: report,
      message: 'Session report retrieved successfully'
    });
  });
}

module.exports = ReportController;