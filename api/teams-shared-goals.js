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
    // Get team ID from query parameter
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({
        success: false,
        error: 'Missing teamId query parameter'
      });
    }

    // Mock shared goals data
    // In a real implementation, this would query your database
    const sharedGoals = [
      {
        id: 'goal_1',
        title: 'Complete Authentication System',
        description: 'Implement secure user authentication with JWT tokens and OAuth integration',
        priority: 'high',
        status: 'in_progress',
        progress: 0.75,
        deadline: '2024-12-31T23:59:59Z',
        assignedTo: ['user_1', 'user_2'],
        createdBy: 'user_1',
        createdAt: '2024-11-01T00:00:00Z',
        updatedAt: new Date().toISOString(),
        milestones: [
          { name: 'JWT Implementation', completed: true },
          { name: 'OAuth Integration', completed: true },
          { name: 'Security Testing', completed: false },
          { name: 'Documentation', completed: false }
        ]
      },
      {
        id: 'goal_2',
        title: 'Dashboard Analytics',
        description: 'Build comprehensive analytics dashboard for user insights',
        priority: 'medium',
        status: 'planning',
        progress: 0.25,
        deadline: '2025-01-15T23:59:59Z',
        assignedTo: ['user_2', 'user_3'],
        createdBy: 'user_3',
        createdAt: '2024-11-05T00:00:00Z',
        updatedAt: new Date().toISOString(),
        milestones: [
          { name: 'Requirements Gathering', completed: true },
          { name: 'UI/UX Design', completed: false },
          { name: 'Backend API', completed: false },
          { name: 'Frontend Implementation', completed: false }
        ]
      }
    ];

    const activeGoals = sharedGoals.filter(goal => goal.status !== 'completed');
    const completedGoals = sharedGoals.filter(goal => goal.status === 'completed');

    return res.status(200).json({
      success: true,
      teamId,
      sharedGoals,
      summary: {
        total: sharedGoals.length,
        active: activeGoals.length,
        completed: completedGoals.length,
        avgProgress: sharedGoals.reduce((sum, goal) => sum + goal.progress, 0) / sharedGoals.length
      },
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    console.error('Shared goals fetch failed:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch shared goals: ${error.message}`
    });
  }
};