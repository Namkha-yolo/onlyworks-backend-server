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
    initializeAI();

    const {
      clickCoordinates,
      nearbyElements,
      activeWindow,
      analysisMode,
      goalContext
    } = req.body;

    if (!clickCoordinates) {
      return res.status(400).json({
        success: false,
        error: 'Missing clickCoordinates in request body'
      });
    }

    // Analyze click context without AI if no API key
    if (!genAI) {
      return res.status(200).json({
        success: true,
        targetElement: nearbyElements && nearbyElements.length > 0 ? nearbyElements[0].text : 'unknown',
        contextText: nearbyElements ? nearbyElements.map(e => e.text).join(' ') : '',
        intentClassification: 'navigation',
        productivityScore: 0.5,
        goalRelevance: analysisMode === 'goal_oriented' ? 0.5 : 0.0
      });
    }

    // Create intelligent analysis prompt
    const prompt = `Analyze this click interaction based on the provided context. Return a JSON response:
{
  "targetElement": "button|link|textfield|menu|unknown",
  "contextText": "text content near the click",
  "intentClassification": "navigation|input|selection|creation|deletion|search|save|cancel|submit",
  "productivityScore": 0.85,
  "goalRelevance": 0.75,
  "reasoning": "explanation of the analysis"
}

Click Context:
- Coordinates: (${clickCoordinates.x}, ${clickCoordinates.y})
- Nearby elements: ${JSON.stringify(nearbyElements)}
- Active window: ${activeWindow?.applicationName} - ${activeWindow?.windowTitle}
- Analysis mode: ${analysisMode}
${goalContext ? `- Goal: ${goalContext.title} - ${goalContext.description}` : ''}

Analyze the user's intent and productivity impact of this click.`;

    const result = await model.generateContent([prompt]);
    const response = await result.response;
    const text = response.text();

    // Parse the response
    let clickAnalysis;
    try {
      let cleanedResponse = text.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/, '').replace(/\n?```$/, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```\n?/, '').replace(/\n?```$/, '');
      }

      clickAnalysis = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('Failed to parse click intelligence response:', parseError);
      // Fallback analysis based on nearby elements
      clickAnalysis = {
        targetElement: nearbyElements && nearbyElements.length > 0 ? 'detected' : 'unknown',
        contextText: nearbyElements ? nearbyElements.map(e => e.text).join(' ') : '',
        intentClassification: 'navigation',
        productivityScore: 0.5,
        goalRelevance: analysisMode === 'goal_oriented' ? 0.5 : 0.0,
        reasoning: 'Fallback analysis due to parsing error'
      };
    }

    return res.status(200).json({
      success: true,
      ...clickAnalysis
    });

  } catch (error) {
    console.error('Click intelligence analysis failed:', error);
    return res.status(500).json({
      success: false,
      error: `Click intelligence analysis failed: ${error.message}`
    });
  }
};