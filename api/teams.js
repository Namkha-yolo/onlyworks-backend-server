// Active Collaborators Handler
async function handleActiveCollaborators(req, res) {
  try {
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({
        success: false,
        error: 'Missing teamId query parameter'
      });
    }

    const collaborators = [
      {
        userId: 'user_1',
        name: 'John Doe',
        email: 'john@example.com',
        status: 'active',
        lastSeen: new Date(Date.now() - 300000).toISOString(),
        currentTask: 'Working on authentication module',
        productivity: 0.85,
        role: 'developer'
      },
      {
        userId: 'user_2',
        name: 'Jane Smith',
        email: 'jane@example.com',
        status: 'active',
        lastSeen: new Date(Date.now() - 600000).toISOString(),
        currentTask: 'Code review and testing',
        productivity: 0.92,
        role: 'senior_developer'
      },
      {
        userId: 'user_3',
        name: 'Bob Wilson',
        email: 'bob@example.com',
        status: 'away',
        lastSeen: new Date(Date.now() - 3600000).toISOString(),
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
}

// Shared Goals Handler
async function handleSharedGoals(req, res) {
  try {
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({
        success: false,
        error: 'Missing teamId query parameter'
      });
    }

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
}

// Productivity Context Handler
async function handleProductivityContext(req, res) {
  try {
    const { teamId } = req.query;

    if (!teamId) {
      return res.status(400).json({
        success: false,
        error: 'Missing teamId query parameter'
      });
    }

    const productivityContext = {
      teamMetrics: {
        avgProductivity: 0.82,
        avgFocus: 0.76,
        collaborationScore: 0.68,
        burnoutRisk: 0.15,
        teamVelocity: 8.5,
        codeQuality: 0.91
      },
      trends: {
        productivity: {
          current: 0.82,
          previousWeek: 0.78,
          trend: 'improving',
          change: 0.04
        },
        focus: {
          current: 0.76,
          previousWeek: 0.80,
          trend: 'declining',
          change: -0.04
        },
        collaboration: {
          current: 0.68,
          previousWeek: 0.65,
          trend: 'improving',
          change: 0.03
        }
      },
      peakHours: {
        teamPeak: ['09:00-11:00', '14:00-16:00'],
        individualPeaks: {
          'user_1': ['08:00-10:00', '15:00-17:00'],
          'user_2': ['09:00-12:00', '13:00-15:00'],
          'user_3': ['10:00-12:00', '14:00-16:00']
        }
      },
      recommendations: [
        {
          type: 'schedule_optimization',
          title: 'Optimize Meeting Schedule',
          description: 'Move non-critical meetings outside peak productivity hours (9-11 AM)',
          impact: 'high',
          effort: 'low'
        },
        {
          type: 'focus_improvement',
          title: 'Implement Focus Blocks',
          description: 'Schedule 90-minute focus blocks for deep work without interruptions',
          impact: 'high',
          effort: 'medium'
        }
      ]
    };

    return res.status(200).json({
      success: true,
      teamId,
      productivityContext,
      generatedAt: new Date().toISOString(),
      dataFreshness: 'real-time',
      version: '1.0'
    });

  } catch (error) {
    console.error('Productivity context fetch failed:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch productivity context: ${error.message}`
    });
  }
}

// Main handler function
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
    // Route based on URL path or action parameter
    const urlPath = req.url || '';
    const { action } = req.query;

    // Support both old URL structure and new action-based structure
    if (urlPath.includes('active-collaborators') || action === 'active-collaborators') {
      return await handleActiveCollaborators(req, res);
    }

    if (urlPath.includes('shared-goals') || action === 'shared-goals') {
      return await handleSharedGoals(req, res);
    }

    if (urlPath.includes('productivity-context') || action === 'productivity-context') {
      return await handleProductivityContext(req, res);
    }

    // Default fallback
    return res.status(404).json({
      success: false,
      error: 'Teams endpoint not found',
      availableEndpoints: [
        '/api/teams?action=active-collaborators&teamId=123',
        '/api/teams?action=shared-goals&teamId=123',
        '/api/teams?action=productivity-context&teamId=123'
      ]
    });

  } catch (error) {
    console.error('Teams endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: `Teams endpoint error: ${error.message}`
    });
  }
};