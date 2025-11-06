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
      goalContext,
      extractedText,
      activeWindow,
      teamId
    } = req.body;

    if (!goalContext) {
      return res.status(400).json({
        success: false,
        error: 'Missing goalContext in request body'
      });
    }

    // Calculate relevance without AI if no API key available
    if (!genAI) {
      initializeAI();
    }

    if (!genAI) {
      // Basic keyword matching fallback
      const goalKeywords = (goalContext.title + ' ' + (goalContext.description || '')).toLowerCase();
      const textContent = (extractedText || '').toLowerCase();
      const windowTitle = (activeWindow?.windowTitle || '').toLowerCase();
      const appName = (activeWindow?.applicationName || '').toLowerCase();

      let relevanceScore = 0.0;

      // Check for keyword matches
      const keywords = goalKeywords.split(/\s+/).filter(word => word.length > 3);
      for (const keyword of keywords) {
        if (textContent.includes(keyword)) relevanceScore += 0.3;
        if (windowTitle.includes(keyword)) relevanceScore += 0.2;
        if (appName.includes(keyword)) relevanceScore += 0.1;
      }

      relevanceScore = Math.min(1.0, relevanceScore);

      return res.status(200).json({
        success: true,
        relevanceScore,
        reasoning: 'Basic keyword matching (AI not available)'
      });
    }

    // AI-powered goal relevance analysis
    const prompt = `Analyze how relevant this screen content is to the specified goal. Return a JSON response:
{
  "relevanceScore": 0.85,
  "reasoning": "The content shows code editing which directly relates to the development goal",
  "keyIndicators": ["code editor", "file structure", "debugging"],
  "confidence": 0.9
}

Goal Context:
- Title: ${goalContext.title}
- Description: ${goalContext.description || 'No description'}
- Deadline: ${goalContext.deadline || 'None specified'}

Screen Content:
- Extracted Text: ${extractedText || 'No text extracted'}
- Active Application: ${activeWindow?.applicationName || 'Unknown'}
- Window Title: ${activeWindow?.windowTitle || 'Unknown'}
- Team ID: ${teamId || 'None'}

Score from 0.0 (completely irrelevant) to 1.0 (directly working on the goal).`;

    const result = await model.generateContent([prompt]);
    const response = await result.response;
    const text = response.text();

    // Parse the response
    let goalRelevance;
    try {
      let cleanedResponse = text.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```\n?/, '').replace(/\n?```$/, '');
      }

      goalRelevance = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse goal relevance response:', parseError);
      goalRelevance = {
        relevanceScore: 0.5,
        reasoning: 'Failed to parse AI response, using default score',
        keyIndicators: [],
        confidence: 0.3
      };
    }

    return res.status(200).json({
      success: true,
      ...goalRelevance
    });

  } catch (error) {
    console.error('Goal relevance analysis failed:', error);
    return res.status(500).json({
      success: false,
      error: `Goal relevance analysis failed: ${error.message}`
    });
  }
};