const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function initializeSupabase() {
  if (!supabase && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );
  }
}

// Handle POST requests from Electron app
async function handleElectronCallback(req, res) {
  try {
    initializeSupabase();

    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'SUPABASE_NOT_CONFIGURED',
          message: 'Supabase not configured',
          timestamp: new Date().toISOString()
        }
      });
    }

    const { code, provider = 'google', code_verifier } = req.body;

    if (!code) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_CODE',
          message: 'Authorization code is required',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Exchange authorization code for session with Supabase
    // Use PKCE if code_verifier is provided, otherwise use standard flow
    let authData;

    if (code_verifier) {
      console.log('[Auth Callback] Using PKCE flow with code verifier');
      // PKCE flow
      authData = await supabase.auth.exchangeCodeForSession(code);
    } else {
      console.log('[Auth Callback] Using standard flow without code verifier');
      // Standard flow
      authData = await supabase.auth.exchangeCodeForSession(code);
    }

    const { data, error } = authData;

    if (error) {
      console.error('Supabase auth error:', error);
      return res.status(400).json({
        success: false,
        error: {
          code: 'SUPABASE_ERROR',
          message: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }

    // Extract user data
    const { session, user } = data;

    if (!session || !user) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'NO_SESSION',
          message: 'Failed to create session',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Return session data in the format expected by the Electron app
    return res.status(200).json({
      success: true,
      data: {
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        expires_at: session.expires_at,
        user: {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.full_name || user.user_metadata?.name,
          avatar_url: user.user_metadata?.avatar_url || user.user_metadata?.picture,
          provider: user.app_metadata?.provider || provider
        }
      }
    });

  } catch (error) {
    console.error('OAuth callback error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      }
    });
  }
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Handle POST requests from Electron app
  if (req.method === 'POST') {
    return handleElectronCallback(req, res, supabase);
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
