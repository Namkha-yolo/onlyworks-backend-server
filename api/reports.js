const { GoogleGenerativeAI } = require('@google/generative-ai');

// Initialize Gemini AI
let genAI = null;
let model = null;

function initializeAI() {
  if (!genAI && process.env.GOOGLE_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
  }
}

// Team Intelligence Report Handler
async function handleTeamIntelligence(req, res) {
  try {
    const {
      sessionIds,
      reportType,
      teamId,
      workspaceId,
      analysisMode,
      goalContext
    } = req.body;

    if (!sessionIds || !Array.isArray(sessionIds)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid sessionIds array in request body'
      });
    }

    if (!teamId) {
      return res.status(400).json({
        success: false,
        error: 'Missing teamId in request body'
      });
    }

    initializeAI();

    if (!genAI) {
      return res.status(200).json({
        success: true,
        report: {
          teamId,
          reportType: reportType || 'productivity',
          sessionCount: sessionIds.length,
          timeframe: 'Last 7 days',
          summary: 'Basic team report generated without AI analysis',
          keyMetrics: {
            totalSessions: sessionIds.length,
            avgProductivity: 0.7,
            avgFocus: 0.6,
            teamCollaboration: 0.5
          }
        },
        teamMetrics: {
          totalHours: sessionIds.length * 2,
          productivityTrend: 'stable',
          collaborationEvents: sessionIds.length * 3,
          goalAlignment: 0.6
        },
        individualMetrics: sessionIds.map((sessionId, index) => ({
          userId: `user_${index + 1}`,
          sessionId,
          productivity: 0.7 + (Math.random() * 0.3 - 0.15),
          focus: 0.6 + (Math.random() * 0.3 - 0.15),
          collaboration: 0.5 + (Math.random() * 0.3 - 0.15)
        })),
        goalProgress: goalContext ? {
          goalId: goalContext.id,
          overallProgress: 0.6,
          teamContribution: 0.7,
          blockers: ['Limited AI analysis without API key']
        } : null,
        recommendations: [
          'Enable AI analysis for detailed insights',
          'Increase collaboration frequency',
          'Set clearer team goals'
        ]
      });
    }

    const prompt = `Generate a comprehensive team intelligence report. Return JSON:
{
  "report": {
    "teamId": "${teamId}",
    "reportType": "${reportType || 'productivity'}",
    "sessionCount": ${sessionIds.length},
    "timeframe": "Analysis period",
    "summary": "Executive summary of team performance",
    "keyMetrics": {
      "totalSessions": ${sessionIds.length},
      "avgProductivity": 0.82,
      "avgFocus": 0.75,
      "teamCollaboration": 0.68,
      "goalAlignment": 0.85
    },
    "insights": [
      "Team shows strong collaboration patterns",
      "Peak productivity during morning hours",
      "Regular knowledge sharing sessions"
    ],
    "challenges": [
      "Context switching frequency high",
      "Meeting overload during afternoons"
    ]
  },
  "teamMetrics": {
    "totalHours": 320,
    "productivityTrend": "improving",
    "collaborationEvents": 45,
    "crossFunctionalWork": 0.7,
    "knowledgeSharing": 0.8,
    "mentoring": 0.6
  },
  "individualMetrics": [
    {
      "userId": "user_1",
      "productivity": 0.85,
      "focus": 0.80,
      "collaboration": 0.75,
      "specialization": "frontend",
      "contributions": ["UI components", "Code reviews"]
    }
  ],
  "goalProgress": {
    "goalId": "goal_123",
    "overallProgress": 0.78,
    "teamContribution": 0.85,
    "individualContributions": {
      "user_1": 0.82,
      "user_2": 0.75
    },
    "milestones": ["API integration complete", "Testing framework setup"],
    "blockers": ["Third-party API limitations"],
    "timeline": "On track for Q4 deadline"
  },
  "recommendations": [
    "Implement focus blocks to reduce context switching",
    "Optimize meeting schedule for peak productivity hours",
    "Increase pair programming sessions",
    "Set up automated deployment pipeline"
  ]
}

Team Context:
- Team ID: ${teamId}
- Workspace: ${workspaceId || 'Default'}
- Sessions: ${sessionIds.length} sessions
- Analysis Mode: ${analysisMode}
- Goal: ${goalContext ? `${goalContext.title} - ${goalContext.description}` : 'No specific goal'}
- Report Type: ${reportType || 'productivity'}`;

    const result = await model.generateContent([prompt]);
    const response = await result.response;
    const text = response.text();

    let teamReport;
    try {
      let cleanedResponse = text.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```\n?/, '').replace(/\n?```$/, '');
      }

      teamReport = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse team intelligence response:', parseError);
      teamReport = {
        report: {
          teamId,
          reportType: reportType || 'productivity',
          sessionCount: sessionIds.length,
          summary: 'Report generation failed - parsing error',
          keyMetrics: {
            totalSessions: sessionIds.length,
            avgProductivity: 0.5,
            avgFocus: 0.5,
            teamCollaboration: 0.5
          }
        },
        teamMetrics: {
          totalHours: sessionIds.length * 2,
          productivityTrend: 'unknown',
          collaborationEvents: 0
        },
        individualMetrics: [],
        goalProgress: null,
        recommendations: ['Fix AI response parsing', 'Retry report generation']
      };
    }

    return res.status(200).json({
      success: true,
      ...teamReport
    });

  } catch (error) {
    console.error('Team intelligence report failed:', error);
    return res.status(500).json({
      success: false,
      error: `Team intelligence report failed: ${error.message}`
    });
  }
}

// Individual Report Handler
async function handleIndividualReport(req, res) {
  try {
    const {
      userId,
      sessionIds,
      reportType,
      timeframe,
      goalContext
    } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId in request body'
      });
    }

    if (!sessionIds || !Array.isArray(sessionIds)) {
      return res.status(400).json({
        success: false,
        error: 'Missing or invalid sessionIds array in request body'
      });
    }

    // Basic individual report without AI
    const individualReport = {
      userId,
      reportType: reportType || 'productivity',
      timeframe: timeframe || 'Last 7 days',
      sessionCount: sessionIds.length,
      summary: {
        totalTime: sessionIds.length * 2, // 2 hours per session estimate
        avgProductivity: 0.75,
        avgFocus: 0.68,
        topActivities: ['coding', 'research', 'communication'],
        achievementsCount: Math.floor(sessionIds.length * 0.3)
      },
      dailyBreakdown: sessionIds.map((sessionId, index) => ({
        date: new Date(Date.now() - (index * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
        sessionId,
        productivity: 0.6 + (Math.random() * 0.4),
        focus: 0.5 + (Math.random() * 0.5),
        mainActivity: ['coding', 'design', 'research', 'communication'][Math.floor(Math.random() * 4)],
        duration: 120 + Math.floor(Math.random() * 180) // 2-5 hours
      })),
      insights: [
        'Consistent productivity throughout the week',
        'Strong focus during morning hours',
        'Regular breaks improve overall performance'
      ],
      recommendations: [
        'Schedule deep work during peak focus hours',
        'Take more frequent short breaks',
        'Limit context switching between tasks'
      ],
      goalProgress: goalContext ? {
        goalId: goalContext.id,
        relevanceScore: 0.7,
        timeSpent: sessionIds.length * 120, // minutes
        completedTasks: Math.floor(sessionIds.length * 0.4),
        remainingTasks: Math.floor(sessionIds.length * 0.6)
      } : null
    };

    return res.status(200).json({
      success: true,
      ...individualReport
    });

  } catch (error) {
    console.error('Individual report failed:', error);
    return res.status(500).json({
      success: false,
      error: `Individual report failed: ${error.message}`
    });
  }
}

// Activity Summary Handler
async function handleActivitySummary(req, res) {
  try {
    const {
      userId,
      timeframe,
      activityTypes
    } = req.body;

    const activities = activityTypes || ['coding', 'writing', 'research', 'communication', 'design'];

    const activitySummary = {
      userId: userId || 'anonymous',
      timeframe: timeframe || 'Last 7 days',
      totalActivities: activities.length * 10, // Mock data
      activityBreakdown: activities.map(activity => ({
        type: activity,
        duration: Math.floor(Math.random() * 480) + 60, // 1-8 hours in minutes
        frequency: Math.floor(Math.random() * 20) + 5,
        productivity: Math.random() * 0.4 + 0.6, // 0.6-1.0
        trend: ['increasing', 'stable', 'decreasing'][Math.floor(Math.random() * 3)]
      })),
      topPerformingActivity: activities[0],
      leastPerformingActivity: activities[activities.length - 1],
      recommendations: [
        'Focus more on high-performing activities',
        'Improve efficiency in low-performing areas',
        'Balance different types of work'
      ]
    };

    return res.status(200).json({
      success: true,
      ...activitySummary
    });

  } catch (error) {
    console.error('Activity summary failed:', error);
    return res.status(500).json({
      success: false,
      error: `Activity summary failed: ${error.message}`
    });
  }
}

// Main handler function
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
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Route based on URL path
    const urlPath = req.url || '';

    if (urlPath.includes('/reports/team-intelligence')) {
      return await handleTeamIntelligence(req, res);
    }

    if (urlPath.includes('/reports/individual')) {
      return await handleIndividualReport(req, res);
    }

    if (urlPath.includes('/reports/activity-summary')) {
      return await handleActivitySummary(req, res);
    }

    // Default fallback
    return res.status(404).json({
      success: false,
      error: 'Reports endpoint not found',
      availableEndpoints: [
        '/api/reports/team-intelligence',
        '/api/reports/individual',
        '/api/reports/activity-summary'
      ]
    });

  } catch (error) {
    console.error('Reports endpoint error:', error);
    return res.status(500).json({
      success: false,
      error: `Reports endpoint error: ${error.message}`
    });
  }
};