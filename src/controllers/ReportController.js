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

  // Generate date range report
  generateDateRangeReport = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { startDate, endDate } = req.body;

    logger.info('Generating date range report', { userId, startDate, endDate });

    validateRequired({ startDate, endDate }, ['startDate', 'endDate']);

    // Find all sessions within the date range
    const sessions = await this.reportService.getSessionsInDateRange(userId, startDate, endDate);

    if (sessions.length === 0) {
      return res.json({
        success: true,
        data: null,
        message: 'No sessions found in the specified date range'
      });
    }

    // Generate comprehensive report for all sessions in the range
    const report = await this.reportService.generateDateRangeReport(userId, {
      startDate,
      endDate,
      sessions
    });

    res.json({
      success: true,
      data: report,
      message: 'Date range report generated successfully'
    });
  });

  // Get report by ID
  getReportById = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { reportId } = req.params;

    logger.info('Fetching report by ID', { userId, reportId });

    validateRequired({ reportId }, ['reportId']);

    const report = await this.reportService.getReportById(userId, reportId);

    res.json({
      success: true,
      data: report,
      message: 'Report retrieved successfully'
    });
  });

  // Download report
  downloadReport = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { reportId } = req.params;

    logger.info('Downloading report', { userId, reportId });

    validateRequired({ reportId }, ['reportId']);

    const report = await this.reportService.getReportById(userId, reportId);

    if (!report) {
      return res.status(404).json({
        success: false,
        error: 'Report not found'
      });
    }

    // For now, return JSON. In future, could generate PDF
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="report_${reportId}_${Date.now()}.json"`);

    res.json({
      success: true,
      report: {
        id: report.id,
        title: report.title,
        session_id: report.session_id,
        created_at: report.created_at,
        comprehensive_report: report.comprehensive_report,
        executive_summary: report.executive_summary,
        productivity_score: report.productivity_score,
        focus_score: report.focus_score,
        session_duration_minutes: report.session_duration_minutes,
        screenshot_count: report.screenshot_count
      }
    });
  });

  // Generate report from selected sessions (NEW - for Reports Page)
  generateFromSessions = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { sessionIds, title, developerName } = req.body;

    logger.info('Generating report from selected sessions', {
      userId,
      sessionCount: sessionIds ? sessionIds.length : 0
    });

    // Validate required fields
    validateRequired({ sessionIds }, ['sessionIds']);

    // Additional validation
    if (!Array.isArray(sessionIds)) {
      return res.status(400).json({
        success: false,
        error: 'sessionIds must be an array'
      });
    }

    if (sessionIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'sessionIds array cannot be empty'
      });
    }

    if (sessionIds.length > 50) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 50 sessions allowed per report'
      });
    }

    // Generate report with sharing enabled
    const result = await this.reportService.generateFromSessions(userId, sessionIds, {
      title,
      developerName
    });

    res.json({
      success: true,
      data: result,
      message: 'Report generated and shareable link created successfully'
    });
  });
}

module.exports = ReportController;