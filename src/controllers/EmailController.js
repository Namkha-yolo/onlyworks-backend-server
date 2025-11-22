const EmailService = require('../services/EmailService');
const { ApiError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');
const asyncHandler = require('express-async-handler');

class EmailController {
  constructor() {
    this.emailService = new EmailService();
  }

  /**
   * Send report share link via email
   * POST /api/reports/share-via-email
   */
  shareViaEmail = asyncHandler(async (req, res) => {
    const { userId } = req.user;

    const {
      shareUrl,
      recipients,
      title,
      expiresAt,
      message,
      senderName
    } = req.body;

    // Validate request
    if (!shareUrl) {
      throw new ApiError('VALIDATION_ERROR', {
        message: 'Share URL is required',
        field: 'shareUrl'
      });
    }

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      throw new ApiError('VALIDATION_ERROR', {
        message: 'At least one recipient is required',
        field: 'recipients'
      });
    }

    // Validate recipients format
    for (const recipient of recipients) {
      if (!recipient.email || !this.isValidEmail(recipient.email)) {
        throw new ApiError('VALIDATION_ERROR', {
          message: `Invalid email address: ${recipient.email}`,
          field: 'recipients'
        });
      }
    }

    if (!this.emailService.isConfigured()) {
      throw new ApiError('SERVICE_UNAVAILABLE', {
        message: 'Email service is not configured. Please contact support.',
        details: 'RESEND_API_KEY not set'
      });
    }

    logger.info('Sending report share emails', {
      userId,
      recipientCount: recipients.length,
      shareUrl,
      title
    });

    // Send emails
    const result = await this.emailService.sendReportShareEmail({
      recipients,
      shareUrl,
      title: title || 'OnlyWorks Productivity Report',
      expiresAt,
      message,
      senderName: senderName || 'A teammate'
    });

    // Return response
    if (result.success) {
      res.json({
        success: true,
        message: `Email sent successfully to ${result.sent.length} recipient(s)`,
        data: {
          sent: result.sent,
          failed: result.failed,
          total: result.total
        }
      });
    } else {
      // Some emails failed
      res.status(207).json({ // 207 Multi-Status
        success: false,
        message: `Email sent to ${result.sent.length} of ${result.total} recipients`,
        data: {
          sent: result.sent,
          failed: result.failed,
          total: result.total
        }
      });
    }
  });

  /**
   * Validate email format
   * @private
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
}

module.exports = EmailController;
