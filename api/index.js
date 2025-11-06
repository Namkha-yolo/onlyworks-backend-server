module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  return res.status(200).json({
    message: 'OnlyWorks Backend API',
    status: 'operational',
    timestamp: new Date().toISOString(),
    endpoints: [
      '/api/health',
      '/api/analyze',
      '/api/analyze-group',
      '/api/analysis/*',
      '/api/teams',
      '/api/reports',
      '/api/auth/login',
      '/api/auth/callback',
      '/api/updates/*'
    ],
    note: 'This server now uses consolidated endpoints to stay within Vercel limits'
  });
};