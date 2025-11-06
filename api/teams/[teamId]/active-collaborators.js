// Note: This should be placed in server/api/teams/[teamId]/active-collaborators.js
// For now, creating a simplified version that works with your current structure

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
    // Extract team ID from URL path
    const teamId = req.url.split('/')[3]; // /api/teams/{teamId}/active-collaborators

    if (!teamId) {
      return res.status(400).json({
        success: false,
        error: 'Missing teamId in URL path'
      });
    }

    // Mock active collaborators data
    // In a real implementation, this would query your database
    const collaborators = [
      {
        userId: 'user_1',
        name: 'John Doe',
        email: 'john@example.com',
        status: 'active',
        lastSeen: new Date(Date.now() - 300000).toISOString(), // 5 minutes ago
        currentTask: 'Working on authentication module',
        productivity: 0.85,
        role: 'developer'
      },
      {
        userId: 'user_2',
        name: 'Jane Smith',
        email: 'jane@example.com',
        status: 'active',
        lastSeen: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
        currentTask: 'Code review and testing',
        productivity: 0.92,
        role: 'senior_developer'
      },
      {
        userId: 'user_3',
        name: 'Bob Wilson',
        email: 'bob@example.com',
        status: 'away',
        lastSeen: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        currentTask: 'Meeting - standup',
        productivity: 0.78,
        role: 'designer'
      }
    ];

    return res.status(200).json({
      success: true,
      teamId,
      collaborators,
      activeCount: collaborators.filter(c => c.status === 'active').length,
      totalCount: collaborators.length,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Active collaborators fetch failed:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch active collaborators: ${error.message}`
    });
  }
};