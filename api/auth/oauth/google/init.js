const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
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
    // Initialize Supabase client
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_ANON_KEY
    );

    // Get OAuth URL from Supabase Auth without automatic PKCE
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        skipBrowserRedirect: true,
        redirectTo: `https://onlyworks-backend-server.vercel.app/api/auth/callback`,
        queryParams: {
          access_type: 'offline',
          prompt: 'consent'
        },
      },
    });

    if (error) {
      throw error;
    }

    return res.status(200).json({
      success: true,
      data: {
        auth_url: data.url
      },
      provider: 'google',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Supabase OAuth init error:', error);
    return res.status(500).json({
      success: false,
      error: {
        code: 'OAUTH_INIT_ERROR',
        message: 'Failed to initialize OAuth with Supabase',
        timestamp: new Date().toISOString()
      }
    });
  }
};