const { Resend } = require('resend');
const { logger } = require('../utils/logger');

class EmailService {
  constructor() {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      logger.warn('RESEND_API_KEY not configured - email sending disabled');
      this.resend = null;
    } else {
      this.resend = new Resend(apiKey);
      logger.info('Email service initialized with Resend');
    }

    this.fromEmail = process.env.RESEND_FROM_EMAIL || 'OnlyWorks <onboarding@resend.dev>';
  }

  /**
   * Send report share link via email
   * @param {Object} options - Email options
   * @param {Array} options.recipients - Array of {email, name}
   * @param {string} options.shareUrl - The shareable report URL
   * @param {string} options.title - Report title
   * @param {string} options.expiresAt - Expiry date ISO string
   * @param {string} options.message - Optional personal message
   * @param {string} options.senderName - Name of the person sharing
   * @returns {Promise<Object>} Result with sent and failed emails
   */
  async sendReportShareEmail(options) {
    try {
      if (!this.resend) {
        throw new Error('Email service not configured - missing RESEND_API_KEY');
      }

      const {
        recipients,
        shareUrl,
        title,
        expiresAt,
        message = null,
        senderName = 'A teammate'
      } = options;

      if (!recipients || recipients.length === 0) {
        throw new Error('At least one recipient is required');
      }

      if (!shareUrl) {
        throw new Error('Share URL is required');
      }

      const expiryDate = expiresAt ? new Date(expiresAt).toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      }) : 'Never';

      logger.info('Sending report share emails', {
        recipientCount: recipients.length,
        title,
        senderName
      });

      const emailPromises = recipients.map(recipient =>
        this.sendSingleEmail(recipient, {
          shareUrl,
          title,
          expiryDate,
          message,
          senderName
        })
      );

      const results = await Promise.allSettled(emailPromises);

      const sent = [];
      const failed = [];

      results.forEach((result, index) => {
        const recipient = recipients[index];
        if (result.status === 'fulfilled') {
          sent.push(recipient.email);
          logger.info('Email sent successfully', {
            to: recipient.email,
            messageId: result.value?.id
          });
        } else {
          failed.push({
            email: recipient.email,
            error: result.reason?.message || 'Unknown error'
          });
          logger.error('Failed to send email', {
            to: recipient.email,
            error: result.reason?.message
          });
        }
      });

      return {
        success: failed.length === 0,
        sent,
        failed,
        total: recipients.length
      };

    } catch (error) {
      logger.error('Exception in sendReportShareEmail', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Send email to a single recipient
   * @private
   */
  async sendSingleEmail(recipient, data) {
    const { email, name } = recipient;
    const { shareUrl, title, expiryDate, message, senderName } = data;

    const recipientName = name || email.split('@')[0];

    const htmlContent = this.generateEmailHTML({
      recipientName,
      shareUrl,
      title,
      expiryDate,
      message,
      senderName
    });

    const textContent = this.generateEmailText({
      recipientName,
      shareUrl,
      title,
      expiryDate,
      message,
      senderName
    });

    const result = await this.resend.emails.send({
      from: this.fromEmail,
      to: [email],
      subject: `${senderName} shared an OnlyWorks Report: ${title}`,
      html: htmlContent,
      text: textContent
    });

    return result;
  }

  /**
   * Generate HTML email template
   * @private
   */
  generateEmailHTML({ recipientName, shareUrl, title, expiryDate, message, senderName }) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif; background-color: #f5f5f7;">
  <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f5f5f7;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);">

          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #5c5ce6 0%, #7c5ce6 100%); padding: 40px; text-align: center; border-radius: 12px 12px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">OnlyWorks</h1>
              <p style="margin: 10px 0 0 0; color: #ffffff; opacity: 0.9; font-size: 14px;">Productivity Report Sharing</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                Hi ${recipientName},
              </p>

              <p style="margin: 0 0 20px 0; color: #1f2937; font-size: 16px; line-height: 1.6;">
                <strong>${senderName}</strong> has shared a productivity report with you:
              </p>

              <div style="background: #f9fafb; border-left: 4px solid #5c5ce6; padding: 16px; margin: 0 0 30px 0; border-radius: 4px;">
                <p style="margin: 0; color: #374151; font-size: 18px; font-weight: 600;">
                  ${title}
                </p>
              </div>

              ${message ? `
              <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 0 0 30px 0; border-radius: 4px;">
                <p style="margin: 0 0 8px 0; color: #92400e; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
                  Personal Message
                </p>
                <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
                  ${message}
                </p>
              </div>
              ` : ''}

              <div style="text-align: center; margin: 0 0 30px 0;">
                <a href="${shareUrl}" style="display: inline-block; background: linear-gradient(135deg, #5c5ce6 0%, #7c5ce6 100%); color: #ffffff; text-decoration: none; padding: 16px 32px; border-radius: 8px; font-size: 16px; font-weight: 600; box-shadow: 0 4px 12px rgba(92, 92, 230, 0.3);">
                  View Report
                </a>
              </div>

              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 14px; text-align: center;">
                Or copy and paste this link:
              </p>
              <p style="margin: 0 0 30px 0; color: #5c5ce6; font-size: 14px; text-align: center; word-break: break-all;">
                ${shareUrl}
              </p>

              <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 16px; margin: 0 0 0 0; border-radius: 4px;">
                <p style="margin: 0; color: #991b1b; font-size: 13px;">
                  <strong>⏰ Link expires:</strong> ${expiryDate}
                </p>
              </div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background: #f9fafb; padding: 30px; text-align: center; border-radius: 0 0 12px 12px; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0 0 10px 0; color: #6b7280; font-size: 13px;">
                Sent via <strong style="color: #5c5ce6;">OnlyWorks</strong>
              </p>
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                Tamper-proof productivity tracking
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();
  }

  /**
   * Generate plain text email (fallback)
   * @private
   */
  generateEmailText({ recipientName, shareUrl, title, expiryDate, message, senderName }) {
    let text = `Hi ${recipientName},\n\n`;
    text += `${senderName} has shared a productivity report with you:\n\n`;
    text += `${title}\n\n`;

    if (message) {
      text += `Personal Message:\n${message}\n\n`;
    }

    text += `View the report here:\n${shareUrl}\n\n`;
    text += `⏰ Link expires: ${expiryDate}\n\n`;
    text += `---\n`;
    text += `Sent via OnlyWorks - Tamper-proof productivity tracking\n`;

    return text;
  }

  /**
   * Check if email service is configured
   * @returns {boolean}
   */
  isConfigured() {
    return this.resend !== null;
  }
}

module.exports = EmailService;
