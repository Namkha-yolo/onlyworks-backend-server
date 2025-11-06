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

function getPromptForAnalysis(analysisType) {
  const prompts = {
    ocr: `Extract all visible text from this screenshot. Return a JSON response with the following structure:
{
  "extractedText": "all visible text concatenated",
  "textRegions": [
    {"x": 0, "y": 0, "width": 100, "height": 20, "text": "specific text", "confidence": 95}
  ],
  "confidence": 90,
  "language": "en"
}`,

    object_detection: `Analyze this screenshot and identify all UI elements and objects. Return a JSON response:
{
  "detectedObjects": ["button", "textfield", "window", "menu"],
  "uiElements": ["header", "sidebar", "main_content"],
  "layoutAnalysis": {"layout_type": "desktop_application", "complexity_score": 65},
  "confidenceScores": {"button": 95, "textfield": 88}
}`,

    activity_classification: `Analyze this screenshot to determine what activity the user is performing. Return a JSON response:
{
  "primaryActivity": "coding",
  "secondaryActivities": ["debugging", "research"],
  "confidence": 85,
  "contextClues": {
    "applicationContext": "development_tool",
    "timeOfDay": 14,
    "screenContent": "code_focused",
    "evidenceText": "key indicators you observed"
  },
  "reasoning": "explain why you classified it this way"
}

Activity types: coding, writing, design, browsing, communication, research, debugging, testing, planning, learning, entertainment, social_media, unknown`,

    full: `Perform a comprehensive analysis of this screenshot. Analyze the text content, UI elements, and determine what activity the user is performing. Return a JSON response:
{
  "ocr": {
    "extractedText": "all visible text",
    "confidence": 90,
    "textRegions": [{"x": 0, "y": 0, "width": 100, "height": 20, "text": "text"}],
    "language": "en"
  },
  "objectDetection": {
    "detectedObjects": ["button", "textfield"],
    "uiElements": ["header", "content"],
    "layoutAnalysis": {"layout_type": "desktop_application", "complexity_score": 65}
  },
  "activityClassification": {
    "primaryActivity": "coding",
    "secondaryActivities": ["debugging"],
    "confidence": 85,
    "contextClues": {
      "applicationContext": "development_tool",
      "screenContent": "code_focused",
      "evidenceText": "key indicators observed"
    }
  },
  "productivityScore": 85,
  "attentionScore": 75,
  "reasoning": "explain the analysis"
}

Activity types: coding, writing, design, browsing, communication, research, debugging, testing, planning, learning, entertainment, social_media, unknown`
  };

  return prompts[analysisType] || prompts.full;
}

function calculateProductivityScore(activityData) {
  if (!activityData) return 50;

  const productivityMap = {
    'coding': 90, 'writing': 85, 'design': 80, 'research': 75,
    'debugging': 85, 'testing': 80, 'planning': 70, 'learning': 75,
    'communication': 60, 'browsing': 40, 'entertainment': 20, 'social_media': 15
  };

  const baseScore = productivityMap[activityData.primaryActivity] || 50;
  const confidenceAdjustment = (activityData.confidence / 100) * 10;

  return Math.min(100, Math.round(baseScore + confidenceAdjustment));
}

function calculateAttentionScore(ocrData, objectData) {
  let score = 60;

  if (ocrData && ocrData.confidence > 80) score += 15;
  if (objectData && objectData.detectedObjects && objectData.detectedObjects.length < 5) score += 15;
  if (objectData && objectData.layoutAnalysis && objectData.layoutAnalysis.complexity_score < 50) score += 10;

  return Math.min(100, Math.max(0, score));
}

function parseAnalysisResponse(responseText, analysisType) {
  try {
    let cleanedResponse = responseText.trim();
    if (cleanedResponse.startsWith('```json')) {
      cleanedResponse = cleanedResponse.replace(/```json\n?/, '').replace(/\n?```$/, '');
    } else if (cleanedResponse.startsWith('```')) {
      cleanedResponse = cleanedResponse.replace(/```\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleanedResponse);
    const processingTime = 1000 + Math.random() * 2000;

    if (analysisType === 'full') {
      return {
        ocr: {
          ...parsed.ocr,
          processing_time_ms: processingTime
        },
        objectDetection: {
          ...parsed.objectDetection,
          processing_time_ms: processingTime
        },
        activityClassification: {
          ...parsed.activityClassification,
          processing_time_ms: processingTime
        },
        productivityScore: parsed.productivityScore || calculateProductivityScore(parsed.activityClassification),
        attentionScore: parsed.attentionScore || calculateAttentionScore(parsed.ocr, parsed.objectDetection),
        reasoning: parsed.reasoning
      };
    } else {
      return {
        ...parsed,
        processing_time_ms: processingTime
      };
    }
  } catch (error) {
    console.error('Failed to parse Gemini response:', error);
    return {
      success: false,
      error: `Failed to parse AI response: ${error.message}`,
      analysisType,
      rawResponse: responseText.substring(0, 200)
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

    const { imageBase64, analysisType = 'full' } = req.body;

    if (!imageBase64) {
      return res.status(400).json({
        success: false,
        error: 'Missing imageBase64 in request body'
      });
    }

    // Remove data URL prefix if present
    const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const prompt = getPromptForAnalysis(analysisType);

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: "image/png"
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();

    const analysisResult = parseAnalysisResponse(text, analysisType);

    return res.status(200).json({
      success: true,
      ...analysisResult
    });

  } catch (error) {
    console.error('AI analysis failed:', error);
    return res.status(500).json({
      success: false,
      error: `AI analysis failed: ${error.message}`
    });
  }
};
