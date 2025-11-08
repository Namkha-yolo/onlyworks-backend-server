const express = require('express');
const ScreenshotController = require('../controllers/ScreenshotController');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const screenshotController = new ScreenshotController();

// Apply authentication to all screenshot routes
router.use(authenticateUser);

// Upload screenshot metadata
router.post('/upload', screenshotController.uploadScreenshot);

// Get screenshots for a session
router.get('/session/:sessionId', screenshotController.getSessionScreenshots);

// Get screenshot analysis
router.get('/:screenshotId/analysis', screenshotController.getScreenshotAnalysis);

// Trigger AI analysis for a screenshot
router.post('/:screenshotId/analyze', screenshotController.analyzeScreenshot);

// Get productivity analytics
router.get('/analytics/productivity', screenshotController.getProductivityAnalytics);

// Get hourly productivity breakdown
router.get('/analytics/hourly', screenshotController.getHourlyProductivity);

module.exports = router;