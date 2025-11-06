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
      textContent,
      uiElements,
      goalContext
    } = req.body;

    if (!goalContext) {
      return res.status(400).json({
        success: false,
        error: 'Missing goalContext in request body'
      });
    }

    // Basic progress indicators without AI
    if (!genAI) {
      initializeAI();
    }

    if (!genAI) {
      // Fallback progress detection
      const progressIndicators = [];
      const text = (textContent || '').toLowerCase();

      // Look for common progress patterns
      if (text.includes('completed') || text.includes('done') || text.includes('finished')) {
        progressIndicators.push({
          type: 'completion',
          indicator: 'Task completion detected',
          confidence: 0.7,
          impact: 'positive'
        });
      }

      if (text.includes('error') || text.includes('failed') || text.includes('problem')) {
        progressIndicators.push({
          type: 'blocker',
          indicator: 'Error or problem detected',
          confidence: 0.8,
          impact: 'negative'
        });
      }

      if (text.includes('%') || text.includes('progress') || text.includes('loading')) {
        progressIndicators.push({
          type: 'progress_bar',
          indicator: 'Progress tracking detected',
          confidence: 0.6,
          impact: 'neutral'
        });
      }

      return res.status(200).json({
        success: true,
        progressIndicators
      });
    }

    // AI-powered progress indicator detection
    const prompt = `Analyze the screen content for progress indicators related to the specified goal. Return a JSON response:
{
  "progressIndicators": [
    {
      "type": "completion|milestone|blocker|progress_bar|file_creation|test_results|build_status|deployment",
      "indicator": "Specific progress indicator found",
      "confidence": 0.9,
      "impact": "positive|negative|neutral",
      "details": "Additional context about the indicator"
    }
  ]
}

Goal Context:
- Title: ${goalContext.title}
- Description: ${goalContext.description || 'No description'}

Screen Content:
- Text: ${textContent || 'No text content'}
- UI Elements: ${JSON.stringify(uiElements || [])}

Look for:
- Task completions or checkmarks
- Progress bars or percentages
- Error messages or warnings
- Build/deployment status
- Test results
- File changes or saves
- Milestones reached
- Blockers or issues`;

    const result = await model.generateContent([prompt]);
    const response = await result.response;
    const text = response.text();

    // Parse the response
    let progressData;
    try {
      let cleanedResponse = text.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```\n?/, '').replace(/\n?```$/, '');
      }

      progressData = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse progress indicators response:', parseError);
      progressData = {
        progressIndicators: [{
          type: 'unknown',
          indicator: 'Failed to parse progress analysis',
          confidence: 0.3,
          impact: 'neutral',
          details: 'AI response parsing failed'
        }]
      };
    }

    return res.status(200).json({
      success: true,
      ...progressData
    });

  } catch (error) {
    console.error('Progress indicators analysis failed:', error);
    return res.status(500).json({
      success: false,
      error: `Progress indicators analysis failed: ${error.message}`
    });
  }
};