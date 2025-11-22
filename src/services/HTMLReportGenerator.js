const pako = require('pako');
const { logger } = require('../utils/logger');

class HTMLReportGenerator {
  /**
   * Generate beautiful HTML from OnlyWorks report data
   * @param {Object} reportData - Report data with OnlyWorks 8 sections
   * @returns {string} HTML string
   */
  generateHTML(reportData) {
    const {
      title = 'OnlyWorks Productivity Report',
      summary,
      goal_alignment,
      blockers,
      recognition,
      automation_opportunities,
      communication_quality,
      next_steps,
      ai_usage_efficiency,
      productivity_score,
      focus_score,
      session_duration_minutes,
      screenshot_count,
      dateRange,
      generatedAt,
      metadata = {}
    } = reportData;

    const formatDate = (date) => {
      if (!date) return 'N/A';
      return new Date(date).toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    };

    const formatScore = (score) => {
      if (score === null || score === undefined) return 'N/A';
      return Math.round(score * 100) / 100;
    };

    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(title)}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #1f2937;
      background: linear-gradient(135deg, #f9fafb 0%, #f3f4f6 100%);
      padding: 20px;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .header {
      background: linear-gradient(135deg, #5c5ce6 0%, #7c5ce6 100%);
      color: white;
      padding: 40px;
      text-align: center;
    }

    .header h1 {
      font-size: 32px;
      font-weight: 700;
      margin-bottom: 10px;
    }

    .header p {
      font-size: 16px;
      opacity: 0.9;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 20px;
      padding: 30px 40px;
      background: #f9fafb;
      border-bottom: 1px solid #e5e7eb;
    }

    .stat {
      text-align: center;
    }

    .stat-label {
      font-size: 13px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-weight: 600;
      margin-bottom: 5px;
    }

    .stat-value {
      font-size: 28px;
      font-weight: 700;
      color: #5c5ce6;
    }

    .content {
      padding: 40px;
    }

    .section {
      margin-bottom: 35px;
    }

    .section:last-child {
      margin-bottom: 0;
    }

    .section-title {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .section-icon {
      font-size: 24px;
    }

    .section-content {
      font-size: 16px;
      line-height: 1.8;
      color: #374151;
      white-space: pre-wrap;
      background: #f9fafb;
      padding: 20px;
      border-radius: 8px;
      border-left: 4px solid #5c5ce6;
    }

    .empty-section {
      color: #9ca3af;
      font-style: italic;
    }

    .footer {
      background: #f9fafb;
      padding: 30px 40px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 14px;
    }

    .footer strong {
      color: #5c5ce6;
      font-weight: 600;
    }

    @media print {
      body {
        background: white;
        padding: 0;
      }

      .container {
        box-shadow: none;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- Header -->
    <div class="header">
      <h1>${this.escapeHtml(title)}</h1>
      <p>Generated on ${formatDate(generatedAt || new Date().toISOString())}</p>
      ${dateRange ? `<p>${formatDate(dateRange.startDate)} – ${formatDate(dateRange.endDate)}</p>` : ''}
    </div>

    <!-- Stats -->
    <div class="stats">
      ${productivity_score !== null && productivity_score !== undefined ? `
      <div class="stat">
        <div class="stat-label">Productivity Score</div>
        <div class="stat-value">${formatScore(productivity_score)}</div>
      </div>` : ''}

      ${focus_score !== null && focus_score !== undefined ? `
      <div class="stat">
        <div class="stat-label">Focus Score</div>
        <div class="stat-value">${formatScore(focus_score)}</div>
      </div>` : ''}

      ${session_duration_minutes ? `
      <div class="stat">
        <div class="stat-label">Total Time</div>
        <div class="stat-value">${Math.round(session_duration_minutes)} min</div>
      </div>` : ''}

      ${screenshot_count ? `
      <div class="stat">
        <div class="stat-label">Screenshots</div>
        <div class="stat-value">${screenshot_count}</div>
      </div>` : ''}
    </div>

    <!-- Content -->
    <div class="content">
      ${this.renderSection('📝', 'Executive Summary', summary)}
      ${this.renderSection('🎯', 'Goal Alignment', goal_alignment)}
      ${this.renderSection('🚧', 'Blockers & Challenges', blockers)}
      ${this.renderSection('🏆', 'Recognition & Wins', recognition)}
      ${this.renderSection('🤖', 'Automation Opportunities', automation_opportunities)}
      ${this.renderSection('💬', 'Communication Quality', communication_quality)}
      ${this.renderSection('📍', 'Next Steps', next_steps)}
      ${ai_usage_efficiency ? this.renderSection('⚡', 'AI Usage Efficiency', ai_usage_efficiency) : ''}
    </div>

    <!-- Footer -->
    <div class="footer">
      <p>Powered by <strong>OnlyWorks</strong> – Tamper-proof productivity tracking</p>
      <p style="margin-top: 10px; font-size: 12px;">This report is cryptographically verified and cannot be modified</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    return html;
  }

  /**
   * Render a section of the report
   * @param {string} icon - Emoji icon
   * @param {string} title - Section title
   * @param {string} content - Section content
   * @returns {string} HTML string
   */
  renderSection(icon, title, content) {
    const hasContent = content && content.trim().length > 0;

    return `
      <div class="section">
        <div class="section-title">
          <span class="section-icon">${icon}</span>
          ${this.escapeHtml(title)}
        </div>
        <div class="section-content ${!hasContent ? 'empty-section' : ''}">
          ${hasContent ? this.escapeHtml(content) : 'No data available for this section'}
        </div>
      </div>
    `;
  }

  /**
   * Escape HTML special characters
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Compress HTML using gzip
   * @param {string} html - HTML string to compress
   * @returns {Buffer} Compressed data as Buffer
   */
  compressHTML(html) {
    try {
      logger.info('Compressing HTML', {
        originalSize: html.length
      });

      const compressed = pako.gzip(html);
      const compressedBuffer = Buffer.from(compressed);

      const compressionRatio = (compressedBuffer.length / html.length) * 100;

      logger.info('HTML compressed successfully', {
        originalSize: html.length,
        compressedSize: compressedBuffer.length,
        compressionRatio: Math.round(compressionRatio * 100) / 100 + '%'
      });

      return compressedBuffer;
    } catch (error) {
      logger.error('Failed to compress HTML', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Generate and compress HTML in one step
   * @param {Object} reportData - Report data
   * @returns {Buffer} Compressed HTML buffer
   */
  generateAndCompress(reportData) {
    const html = this.generateHTML(reportData);
    return this.compressHTML(html);
  }
}

module.exports = HTMLReportGenerator;
