const express = require('express');
const multer = require('multer');
const ScreenshotController = require('../controllers/ScreenshotController');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const screenshotController = new ScreenshotController();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Accept only image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Apply authentication to all screenshot routes
router.use(authenticateUser);

// Upload screenshot with optional file
router.post('/upload', upload.single('screenshot'), screenshotController.uploadScreenshot);

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