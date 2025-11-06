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

function createGroupAnalysisPrompt(sessionContext, imageCount) {
  const timeRange = sessionContext.timeRange || 'recent activity';
  const timeOfDay = new Date().getHours();

  return `Perform an EXHAUSTIVE, FORENSIC-LEVEL analysis of this sequence of ${imageCount} screenshots taken during ${timeRange}.

CRITICAL: Extract EVERY piece of information from EVERY screenshot. Document all visible text, code, errors, UI elements, browser tabs, terminal commands. Be EXTREMELY specific about file paths, line numbers, exact error messages.

Please provide an EXTREMELY DETAILED analysis in the following JSON format:

{
  "sessionSummary": {
    "primaryActivities": ["EXACT activity names - e.g., 'debugging TypeError in auth.js', 'implementing JWT authentication'"],
    "timeSpent": {"debugging auth.js TypeError": 45, "implementing JWT tokens": 35, "testing login endpoint": 20},
    "productivityScore": 75,
    "focusQuality": "high|medium|low",
    "totalLinesWritten": 847,
    "filesModified": 12,
    "errorsEncountered": 8,
    "contextSwitches": 23
  },
  "detailedAnalysis": {
    "workflowDescription": "The developer debugged a critical authentication bug in /src/auth/login.js, implemented JWT token validation, refactored the user session management, and deployed to staging environment via GitHub Actions",
    "keyApplications": [
      "Visual Studio Code 1.84.2 - primary IDE for coding",
      "Google Chrome DevTools - debugging network requests and React state"
    ],
    "contentAnalysis": {
      "websitesVisited": ["localhost:3000/login - testing authentication flow"],
      "filesModified": ["/src/auth/login.js - added JWT validation, lines 45-127"],
      "errorsResolved": ["TypeError: Cannot read property 'token' of undefined at login.js:67"],
      "codeSnippets": ["const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET);"]
    }
  },
  "insights": {
    "accomplishments": ["Successfully implemented JWT authentication with refresh tokens"],
    "patterns": ["User frequently switches between IDE and browser for testing"],
    "recommendations": ["Use debugger breakpoints instead of console.log"],
    "distractions": ["Checked social media 3 times during debugging session"],
    "inefficiencies": ["Manually typed the same test data 8 times"]
  },
  "activityBreakdown": [
    {
      "screenshotRange": "1-5",
      "timeRange": "9:00:00-9:15:23",
      "activity": "debugging authentication error",
      "specificActions": ["Opened login.js in VS Code", "Set breakpoint at line 67"],
      "filesInFocus": ["/src/auth/login.js:67-89"],
      "errorsEncountered": ["TypeError: Cannot read property 'token' of undefined"],
      "productivity": 85,
      "focusLevel": "high"
    }
  ]
}

Activity categories: coding, writing, design, research, communication, browsing, learning, planning, debugging, testing, entertainment, social_media

Current time: ${timeOfDay}:00

REMEMBER: Write in THIRD PERSON. Be FORENSIC and DETAILED.`;
}

function parseGroupAnalysisResponse(responseText, metadata) {
  try {
    let cleanResponse = responseText.trim();

    if (cleanResponse.startsWith('```json')) {
      cleanResponse = cleanResponse.replace(/```json\n?/, '').replace(/\n?```$/, '');
    } else if (cleanResponse.startsWith('```')) {
      cleanResponse = cleanResponse.replace(/```\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleanResponse);

    return {
      ...parsed,
      metadata: {
        screenshotCount: metadata.screenshotCount,
        processingTime: metadata.processingTime,
        analysisType: 'group_analysis',
        timestamp: new Date().toISOString(),
        model: 'gemini-2.0-flash-exp'
      }
    };

  } catch (error) {
    console.warn('Failed to parse group analysis JSON:', error.message);

    return {
      sessionSummary: {
        primaryActivities: ['unknown'],
        timeSpent: { unknown: 100 },
        productivityScore: 50,
        focusQuality: 'medium'
      },
      detailedAnalysis: {
        workflowDescription: responseText.substring(0, 200) + '...',
        keyApplications: [],
        contentAnalysis: {}
      },
      insights: {
        accomplishments: ['Group analysis completed'],
        patterns: [],
        recommendations: ['Unable to parse detailed insights'],
        distractions: []
      },
      activityBreakdown: [],
      metadata: {
        screenshotCount: metadata.screenshotCount,
        processingTime: metadata.processingTime,
        analysisType: 'group_analysis_fallback',
        timestamp: new Date().toISOString(),
        error: 'JSON parsing failed'
      }
    };
  }
}

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    initializeAI();

    if (!genAI) {
      return res.status(500).json({
        success: false,
        error: 'AI service not available - API key not configured'
      });
    }

    const { images, sessionContext = {} } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing images array in request body'
      });
    }

    console.log(`Analyzing group of ${images.length} screenshots...`);

    // Prepare images for analysis
    const imageInputs = images.map(imageBase64 => {
      // Remove data URL prefix if present
      const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

      return {
        inlineData: {
          data: base64Data,
          mimeType: "image/png"
        }
      };
    });

    // Create prompt
    const prompt = createGroupAnalysisPrompt(sessionContext, images.length);

    // Analyze with Gemini
    const startTime = Date.now();
    const result = await model.generateContent([prompt, ...imageInputs]);
    const processingTime = Date.now() - startTime;

    const response = await result.response;
    const text = response.text();

    console.log(`Group analysis completed in ${processingTime}ms`);

    // Parse and return results
    const analysisResult = parseGroupAnalysisResponse(text, {
      screenshotCount: images.length,
      processingTime,
      sessionContext
    });

    return res.status(200).json({
      success: true,
      ...analysisResult
    });

  } catch (error) {
    console.error('Group AI analysis failed:', error);
    return res.status(500).json({
      success: false,
      error: `Group AI analysis failed: ${error.message}`
    });
  }
};
