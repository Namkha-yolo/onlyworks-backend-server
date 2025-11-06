// Note: This should be placed in server/api/teams/[teamId]/productivity-context.js

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
    const teamId = req.url.split('/')[3]; // /api/teams/{teamId}/productivity-context

    if (!teamId) {
      return res.status(400).json({
        success: false,
        error: 'Missing teamId in URL path'
      });
    }

    // Mock productivity context data
    // In a real implementation, this would aggregate data from your analytics database
    const productivityContext = {
      teamMetrics: {
        avgProductivity: 0.82,
        avgFocus: 0.76,
        collaborationScore: 0.68,
        burnoutRisk: 0.15,
        teamVelocity: 8.5, // story points per sprint
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
      distractions: {
        commonDistractions: [
          { type: 'meetings', frequency: 0.25, impact: 'medium' },
          { type: 'notifications', frequency: 0.40, impact: 'low' },
          { type: 'context_switching', frequency: 0.30, impact: 'high' }
        ],
        distractionScore: 0.35 // lower is better
      },
      workPatterns: {
        deepWorkSessions: {
          avgDuration: 95, // minutes
          frequency: 3.2, // per day
          quality: 0.85
        },
        meetingLoad: {
          avgPerDay: 4.5,
          avgDuration: 35, // minutes
          efficiency: 0.72
        },
        codeReviewCycle: {
          avgTimeToReview: 4.2, // hours
          avgTimeToMerge: 8.5, // hours
          reviewQuality: 0.88
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
        },
        {
          type: 'collaboration',
          title: 'Increase Pair Programming',
          description: 'Schedule regular pair programming sessions to improve knowledge sharing',
          impact: 'medium',
          effort: 'medium'
        }
      ],
      teamHealth: {
        workLifeBalance: 0.78,
        jobSatisfaction: 0.82,
        teamCohesion: 0.85,
        skillDevelopment: 0.73,
        burnoutRisk: 0.15
      }
    };

    return res.status(200).json({
      success: true,
      teamId,
      productivityContext,
      generatedAt: new Date().toISOString(),
      dataFreshness: 'real-time', // or 'cached_5min', 'cached_1hour', etc.
      version: '1.0'
    });

  } catch (error) {
    console.error('Productivity context fetch failed:', error);
    return res.status(500).json({
      success: false,
      error: `Failed to fetch productivity context: ${error.message}`
    });
  }
};