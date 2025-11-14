const BatchProcessingService = require('../services/BatchProcessingService');
const { asyncHandler, validateRequired } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class BatchProcessingController {
  constructor() {
    this.batchService = new BatchProcessingService();
  }

  // Trigger batch processing for session screenshots
  triggerBatchProcessing = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { sessionId } = req.params;
    const { batchSize, analysisType } = req.body;

    logger.info('Triggering batch processing', {
      userId,
      sessionId,
      batchSize: batchSize || 30,
      analysisType: analysisType || 'standard'
    });

    validateRequired({ sessionId }, ['sessionId']);

    const result = await this.batchService.triggerBatchProcessing(userId, sessionId, {
      batchSize: batchSize || 30,
      analysisType: analysisType || 'standard'
    });

    res.json({
      success: true,
      data: result,
      message: 'Batch processing triggered successfully'
    });
  });

  // Get batch processing status
  getBatchStatus = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { sessionId } = req.params;

    logger.info('Getting batch status', { userId, sessionId });

    const status = await this.batchService.getBatchStatus(userId, sessionId);

    res.json({
      success: true,
      data: status,
      message: 'Batch status retrieved successfully'
    });
  });

  // Get all batch reports for session
  getBatchReports = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { sessionId } = req.params;
    const { limit, offset } = req.query;

    logger.info('Getting batch reports', { userId, sessionId, limit, offset });

    const reports = await this.batchService.getBatchReports(userId, sessionId, {
      limit: parseInt(limit) || 10,
      offset: parseInt(offset) || 0
    });

    res.json({
      success: true,
      data: reports,
      message: 'Batch reports retrieved successfully'
    });
  });

  // Generate comprehensive session summary
  generateSessionSummary = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { sessionId } = req.params;

    logger.info('Generating session summary', { userId, sessionId });

    const summary = await this.batchService.generateSessionSummary(userId, sessionId);

    res.json({
      success: true,
      data: summary,
      message: 'Session summary generated successfully'
    });
  });

  // Create shareable session summary
  createShareableReport = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { sessionId } = req.params;
    const { includePrivateData = false, shareWithTeam = false, expiresInDays = 7 } = req.body;

    logger.info('Creating shareable report', { userId, sessionId, includePrivateData, shareWithTeam });

    const shareableReport = await this.batchService.generateShareableSessionSummary(userId, sessionId, {
      includePrivateData,
      shareWithTeam,
      expiresInDays
    });

    res.json({
      success: true,
      data: shareableReport,
      message: 'Shareable report created successfully'
    });
  });

  // Get shared report by token
  getSharedReport = asyncHandler(async (req, res) => {
    const { shareToken } = req.params;

    logger.info('Getting shared report', { shareToken });

    const sharedReport = await this.batchService.getSharedReport(shareToken);

    if (!sharedReport) {
      return res.status(404).json({
        success: false,
        message: 'Shared report not found or has expired'
      });
    }

    res.json({
      success: true,
      data: sharedReport,
      message: 'Shared report retrieved successfully'
    });
  });

  // Revoke shared report
  revokeSharedReport = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { shareToken } = req.params;

    logger.info('Revoking shared report', { userId, shareToken });

    const result = await this.batchService.revokeSharedReport(shareToken, userId);

    if (!result) {
      return res.status(404).json({
        success: false,
        message: 'Shared report not found or you do not have permission to revoke it'
      });
    }

    res.json({
      success: true,
      message: 'Shared report revoked successfully'
    });
  });

  // Get user's shared reports
  getUserSharedReports = asyncHandler(async (req, res) => {
    const { userId } = req.user;
    const { limit, offset } = req.query;

    logger.info('Getting user shared reports', { userId, limit, offset });

    const sharedReports = await this.batchService.getUserSharedReports(userId, {
      limit: parseInt(limit) || 20,
      offset: parseInt(offset) || 0
    });

    res.json({
      success: true,
      data: sharedReports,
      message: 'User shared reports retrieved successfully'
    });
  });
}

module.exports = BatchProcessingController;