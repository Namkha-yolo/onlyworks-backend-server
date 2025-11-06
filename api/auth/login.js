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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST' && req.method !== 'GET') {
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

    // Get provider from query or body
    const provider = req.query.provider || req.body?.provider || 'google';

    // Get the base URL for the callback
    const baseUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : req.headers.origin || 'http://localhost:3000';

    const redirectTo = `${baseUrl}/api/auth/callback`;

    // Initiate OAuth flow
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider,
      options: {
        redirectTo: redirectTo,
        skipBrowserRedirect: true
      }
    });

    if (error) {
      throw error;
    }

    if (!data?.url) {
      throw new Error('No OAuth URL returned from Supabase');
    }

    // Return the OAuth URL for the client to open
    return res.status(200).json({
      success: true,
      url: data.url,
      provider: provider
    });

  } catch (error) {
    console.error('OAuth login error:', error);
    return res.status(500).json({
      success: false,
      error: `OAuth login failed: ${error.message}`
    });
  }
};
