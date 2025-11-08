const express = require('express');
const DashboardController = require('../controllers/DashboardController');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const dashboardController = new DashboardController();

// Apply authentication to all dashboard routes
router.use(authenticateUser);

// Get complete dashboard overview
router.get('/overview', dashboardController.getDashboardOverview);

// Get today's statistics
router.get('/today', dashboardController.getTodayStats);

// Get detailed session summary
router.get('/sessions/:sessionId/summary', dashboardController.getSessionSummary);

module.exports = router;