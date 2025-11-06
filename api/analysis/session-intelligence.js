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
    const {
      sessionData,
      analysisMode,
      goalContext,
      teamContext
    } = req.body;

    if (!sessionData) {
      return res.status(400).json({
        success: false,
        error: 'Missing sessionData in request body'
      });
    }

    // Basic session analysis without AI
    if (!genAI) {
      initializeAI();
    }

    if (!genAI) {
      // Fallback analysis
      const screenshots = Array.isArray(sessionData) ? sessionData : [sessionData];
      const duration = screenshots.length * 30; // Assume 30s per screenshot

      return res.status(200).json({
        success: true,
        analysis: {
          sessionDuration: duration,
          screenshotCount: screenshots.length,
          productivityScore: 0.7,
          focusScore: 0.6,
          mainActivity: 'unknown',
          applicationBreakdown: {}
        },
        insights: {
          patterns: ['Basic analysis completed'],
          achievements: ['Session recorded'],
          distractions: [],
          improvements: ['Consider using AI analysis for better insights']
        },
        recommendations: [
          'Enable AI analysis for detailed insights',
          'Increase session duration for better analysis'
        ],
        goalProgress: goalContext ? {
          relevanceScore: 0.5,
          timeSpent: duration,
          tasksCompleted: 0,
          blockers: []
        } : null,
        teamMetrics: teamContext ? {
          collaborationScore: 0.5,
          communicationEvents: 0,
          sharedProgress: 0
        } : null
      });
    }

    // AI-powered session analysis
    const sessionSummary = Array.isArray(sessionData)
      ? `Session with ${sessionData.length} data points`
      : 'Single session data point';

    const prompt = `Analyze this work session data and provide comprehensive insights. Return a JSON response:
{
  "analysis": {
    "sessionDuration": 3600,
    "productivityScore": 0.85,
    "focusScore": 0.75,
    "mainActivity": "coding",
    "applicationBreakdown": {
      "VS Code": 60,
      "Chrome": 25,
      "Slack": 15
    },
    "timeDistribution": {
      "productive": 70,
      "neutral": 20,
      "distraction": 10
    }
  },
  "insights": {
    "patterns": ["Deep focus periods during morning hours"],
    "achievements": ["Completed authentication module", "Fixed 3 bugs"],
    "distractions": ["Social media check", "Multiple browser tabs"],
    "improvements": ["Use focus mode", "Block distracting websites"]
  },
  "recommendations": [
    "Schedule focused coding blocks",
    "Use Pomodoro technique",
    "Minimize context switching"
  ],
  "goalProgress": {
    "relevanceScore": 0.9,
    "timeSpent": 2400,
    "tasksCompleted": 3,
    "milestones": ["Module completed"],
    "blockers": ["API rate limiting"]
  },
  "teamMetrics": {
    "collaborationScore": 0.6,
    "communicationEvents": 5,
    "sharedProgress": 0.8,
    "peerInteractions": ["Code review", "Slack discussion"]
  }
}

Session Context:
- Data: ${JSON.stringify(sessionData).substring(0, 1000)}...
- Analysis Mode: ${analysisMode}
- Goal: ${goalContext ? `${goalContext.title} - ${goalContext.description}` : 'None'}
- Team: ${teamContext ? `Team ${teamContext.teamId}` : 'Individual'}

Provide actionable insights for productivity improvement.`;

    const result = await model.generateContent([prompt]);
    const response = await result.response;
    const text = response.text();

    // Parse the response
    let sessionAnalysis;
    try {
      let cleanedResponse = text.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```\n?/, '').replace(/\n?```$/, '');
      }

      sessionAnalysis = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse session intelligence response:', parseError);
      sessionAnalysis = {
        analysis: {
          sessionDuration: 1800,
          productivityScore: 0.5,
          focusScore: 0.5,
          mainActivity: 'unknown',
          applicationBreakdown: {}
        },
        insights: {
          patterns: ['Analysis parsing failed'],
          achievements: [],
          distractions: [],
          improvements: ['Fix AI response parsing']
        },
        recommendations: ['Retry analysis with corrected data'],
        goalProgress: null,
        teamMetrics: null
      };
    }

    return res.status(200).json({
      success: true,
      ...sessionAnalysis
    });

  } catch (error) {
    console.error('Session intelligence analysis failed:', error);
    return res.status(500).json({
      success: false,
      error: `Session intelligence analysis failed: ${error.message}`
    });
  }
};