const DashboardService = require('../services/DashboardService');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class DashboardController {
  constructor() {
    this.dashboardService = new DashboardService();
  }

  // Get complete dashboard overview
  getDashboardOverview = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    logger.info('Getting dashboard overview', { userId });

    const overview = await this.dashboardService.getDashboardOverview(userId);

    res.json({
      success: true,
      data: overview
    });
  });

  // Get detailed session summary
  getSessionSummary = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { sessionId } = req.params;

    logger.info('Getting session summary', { userId, sessionId });

    const summary = await this.dashboardService.getDetailedSessionSummary(userId, sessionId);

    res.json({
      success: true,
      data: summary
    });
  });

  // Get today's statistics
  getTodayStats = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    const stats = await this.dashboardService.getTodayStats(userId);

    res.json({
      success: true,
      data: stats
    });
  });
}

module.exports = DashboardController;