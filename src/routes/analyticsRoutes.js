const express = require('express');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();

// Apply authentication to all analytics routes
router.use(authenticateUser);

// Analytics endpoint - redirects to dashboard overview for compatibility
router.get('/', (req, res) => {
  // Redirect to the dashboard overview which contains analytics data
  res.redirect('/api/dashboard/overview');
});

// Alternative analytics endpoint that returns the same data as dashboard
router.get('/overview', async (req, res) => {
  try {
    // Import the dashboard controller
    const DashboardController = require('../controllers/DashboardController');
    const dashboardController = new DashboardController();

    // Use the dashboard overview method to return analytics data
    await dashboardController.getDashboardOverview(req, res);
  } catch (error) {
    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve analytics data',
        details: { operation: 'get_analytics_overview' },
        timestamp: new Date().toISOString()
      }
    });
  }
});

module.exports = router;