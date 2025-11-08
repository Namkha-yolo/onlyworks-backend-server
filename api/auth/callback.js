const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function initializeSupabase() {
  if (!supabase && process.env.SUPABASE_URL) {
    // Use service role key if available, otherwise fall back to anon key
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

    if (supabaseKey) {
      supabase = createClient(
        process.env.SUPABASE_URL,
        supabaseKey,
        {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        }
      );
      console.log('[Supabase] Initialized with', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service role' : 'anon key');
    }
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

    // Since Supabase PKCE is causing issues, let's try direct Google OAuth exchange
    console.log('[Auth Callback] Attempting direct Google OAuth token exchange...');

    let data, error;

    try {
      // Exchange code directly with Google
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: '1098053497294-5nufru8qoiuoimleqrec2rjkgvv3cs5n.apps.googleusercontent.com',
          client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: 'https://onlyworks-backend-server.vercel.app/api/auth/callback'
        })
      });

      if (!tokenResponse.ok) {
        throw new Error(`Google OAuth failed: ${tokenResponse.status}`);
      }

      const tokens = await tokenResponse.json();
      console.log('[Auth Callback] Received tokens from Google:', { access_token: !!tokens.access_token, refresh_token: !!tokens.refresh_token });

      // Get user info from Google
      const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`
        }
      });

      if (!userResponse.ok) {
        throw new Error(`Google user info failed: ${userResponse.status}`);
      }

      const googleUser = await userResponse.json();
      console.log('[Auth Callback] Received user info from Google:', { id: googleUser.id, email: googleUser.email });

      // Create a session object in the expected format
      data = {
        session: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: Date.now() + (tokens.expires_in * 1000)
        },
        user: {
          id: googleUser.id,
          email: googleUser.email,
          user_metadata: {
            full_name: googleUser.name,
            avatar_url: googleUser.picture,
            provider: 'google'
          },
          app_metadata: {
            provider: 'google'
          }
        }
      };

      error = null;
    } catch (directError) {
      console.error('[Auth Callback] Direct OAuth failed, falling back to Supabase:', directError);

      // Fallback to Supabase (will likely fail due to PKCE)
      const supabaseResult = await supabase.auth.exchangeCodeForSession(code);
      data = supabaseResult.data;
      error = supabaseResult.error;
    }

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
