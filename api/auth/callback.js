const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function initializeSupabase() {
  if (!supabase && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );
  }
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    initializeSupabase();

    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Supabase not configured'
      });
    }

    // Extract the code or tokens from query parameters
    const { code, access_token, refresh_token, error, error_description } = req.query;

    if (error) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Authentication Failed</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              text-align: center;
              padding: 40px;
              background: rgba(255, 255, 255, 0.1);
              border-radius: 16px;
              backdrop-filter: blur(10px);
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Authentication Failed</h1>
            <p>${error_description || error}</p>
            <p>You can close this window.</p>
          </div>
          <script>setTimeout(() => window.close(), 3000);</script>
        </body>
        </html>
      `);
    }

    // If we have tokens directly, send them to the app
    if (access_token) {
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>OnlyWorks - Authentication Complete</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              text-align: center;
              padding: 40px;
              background: rgba(255, 255, 255, 0.1);
              border-radius: 16px;
              backdrop-filter: blur(10px);
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Authentication Complete!</h1>
            <p>You can now close this window.</p>
          </div>
          <script>
            // Send message to parent window or opener
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-success',
                access_token: '${access_token}',
                refresh_token: '${refresh_token || ''}'
              }, '*');
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `);
    }

    // If we have a code, exchange it for tokens
    if (code) {
      const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

      if (exchangeError) {
        throw exchangeError;
      }

      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>OnlyWorks - Authentication Complete</title>
          <style>
            body {
              font-family: system-ui, -apple-system, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              text-align: center;
              padding: 40px;
              background: rgba(255, 255, 255, 0.1);
              border-radius: 16px;
              backdrop-filter: blur(10px);
            }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✅ Authentication Complete!</h1>
            <p>You can now close this window.</p>
          </div>
          <script>
            if (window.opener) {
              window.opener.postMessage({
                type: 'oauth-success',
                access_token: '${data.session?.access_token || ''}',
                refresh_token: '${data.session?.refresh_token || ''}'
              }, '*');
            }
            setTimeout(() => window.close(), 2000);
          </script>
        </body>
        </html>
      `);
    }

    // No valid parameters
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Invalid Request</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            backdrop-filter: blur(10px);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>❌ Invalid Request</h1>
          <p>Missing required parameters.</p>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('OAuth callback error:', error);
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Error</title>
        <style>
          body {
            font-family: system-ui, -apple-system, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          }
          .container {
            text-align: center;
            padding: 40px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 16px;
            backdrop-filter: blur(10px);
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>❌ Error</h1>
          <p>${error.message}</p>
        </div>
      </body>
      </html>
    `);
  }
};
