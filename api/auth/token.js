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
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      success: false,
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'Method not allowed',
        timestamp: new Date().toISOString()
      }
    });
  }

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

    const { access_token, refresh_token, provider = 'google' } = req.body;

    if (!access_token) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'Access token is required',
          timestamp: new Date().toISOString()
        }
      });
    }

    // Set the session in Supabase to validate the token
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token
    });

    if (error) {
      console.error('Supabase token validation error:', error);
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_TOKEN',
          message: error.message,
          timestamp: new Date().toISOString()
        }
      });
    }

    const { session, user } = data;

    if (!session || !user) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SESSION',
          message: 'Invalid session',
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
    console.error('Token validation error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
        timestamp: new Date().toISOString()
      }
    });
  }
};