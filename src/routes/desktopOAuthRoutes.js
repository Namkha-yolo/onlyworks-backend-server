const express = require('express');
const { logger } = require('../utils/logger');

const router = express.Router();

/**
 * Desktop OAuth callback - just displays the authorization code
 * This endpoint doesn't process the OAuth, just shows the code for the desktop app to extract
 */
router.get('/desktop/callback', (req, res) => {
  const { code, state, error } = req.query;

  logger.info('Desktop OAuth callback received', {
    hasCode: !!code,
    hasState: !!state,
    error: error
  });

  if (error) {
    res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>OAuth Error</title>
        <meta charset="UTF-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; }
          .container { max-width: 400px; margin: 0 auto; text-align: center; }
          .error { color: #dc3545; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2 class="error">OAuth Error</h2>
          <p>Error: ${error}</p>
          <p>Please try again.</p>
        </div>
      </body>
      </html>
    `);
    return;
  }

  if (!code) {
    res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>OAuth Error</title>
        <meta charset="UTF-8">
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 40px; }
          .container { max-width: 400px; margin: 0 auto; text-align: center; }
          .error { color: #dc3545; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2 class="error">Missing Authorization Code</h2>
          <p>No authorization code received.</p>
          <p>Please try again.</p>
        </div>
      </body>
      </html>
    `);
    return;
  }

  // Display a simple page that the desktop app can read from
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>OnlyWorks OAuth Success</title>
      <meta charset="UTF-8">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, sans-serif;
          padding: 40px;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          margin: 0;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .container {
          max-width: 500px;
          text-align: center;
          background: rgba(255,255,255,0.1);
          padding: 40px;
          border-radius: 20px;
          backdrop-filter: blur(10px);
        }
        .success { color: #28a745; }
        .icon { font-size: 48px; margin-bottom: 20px; }
        .code {
          font-family: monospace;
          background: rgba(0,0,0,0.3);
          padding: 15px;
          border-radius: 8px;
          word-break: break-all;
          margin: 20px 0;
          font-size: 12px;
        }
        .message {
          font-size: 18px;
          margin: 20px 0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon">✅</div>
        <h2 class="success">OAuth Authorization Successful!</h2>
        <p class="message">You have successfully authorized OnlyWorks. The application will continue automatically.</p>
        <div id="auth-code" class="code">${code}</div>
        <div id="auth-state" style="display: none;">${state || ''}</div>
        <script>
          // Signal to the desktop app that OAuth is complete
          window.oauthComplete = {
            code: "${code}",
            state: "${state || ''}",
            success: true
          };

          // Auto-close after 3 seconds if in popup
          setTimeout(() => {
            if (window.opener) {
              window.close();
            }
          }, 3000);
        </script>
      </div>
    </body>
    </html>
  `);
});

module.exports = router;