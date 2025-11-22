const express = require('express');
const ReportController = require('../controllers/ReportController');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const reportController = new ReportController();

// Apply authentication to all report routes
router.use(authenticateUser);

// Individual user reports
router.post('/individual', reportController.generateIndividualReport);

// Team intelligence reports
router.post('/team-intelligence', reportController.generateTeamIntelligenceReport);

// Activity summary reports
router.post('/activity-summary', reportController.generateActivitySummaryReport);

// Productivity insights report
router.post('/productivity-insights', reportController.generateProductivityInsights);

// Work session analysis report
router.post('/session-analysis/:sessionId', reportController.generateSessionAnalysisReport);

// Goal progress reports
router.get('/goal-progress/:goalId', reportController.generateGoalProgressReport);

// Team performance comparison
router.post('/team-comparison', reportController.generateTeamComparisonReport);

// Session reports endpoints
router.get('/user', reportController.getUserSessionReports);
router.get('/session/:sessionId', reportController.getSessionReport);

// Date range report generation
router.post('/generate-range', reportController.generateDateRangeReport);

// Generate report from selected sessions (for Reports Page)
router.post('/generate-from-sessions', reportController.generateFromSessions);

// Get report by session ID
router.get('/session/:sessionId', reportController.getSessionReport);
router.get('/session/:sessionId/download', reportController.getSessionReport);

// Individual report details and download
router.get('/:reportId', reportController.getReportById);
router.get('/:reportId/download', reportController.downloadReport);

module.exports = router;