const express = require('express');
const BatchProcessingController = require('../controllers/BatchProcessingController');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const batchController = new BatchProcessingController();

// Apply authentication to all routes
router.use(authenticateUser);

// Trigger batch processing for session screenshots
router.post('/trigger/:sessionId', batchController.triggerBatchProcessing);

// Get batch processing status
router.get('/status/:sessionId', batchController.getBatchStatus);

// Get all batch reports for session
router.get('/reports/:sessionId', batchController.getBatchReports);

// Generate comprehensive session summary
router.get('/summary/:sessionId', batchController.generateSessionSummary);

// Create shareable report
router.post('/share/:sessionId', batchController.createShareableReport);

// Get shared report by token (no authentication required)
router.get('/shared/:shareToken', (req, res, next) => {
  // Skip authentication for shared reports
  next();
}, batchController.getSharedReport);

// Revoke shared report
router.delete('/share/:shareToken', batchController.revokeSharedReport);

// Get user's shared reports
router.get('/my-shares', batchController.getUserSharedReports);

module.exports = router;