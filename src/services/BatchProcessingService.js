const WorkSessionRepository = require('../repositories/WorkSessionRepository');
const ScreenshotRepository = require('../repositories/ScreenshotRepository');
const BatchReportRepository = require('../repositories/BatchReportRepository');
const ReportsRepository = require('../repositories/ReportsRepository');
const { ApiError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class BatchProcessingService {
  constructor() {
    this.workSessionRepo = new WorkSessionRepository();
    this.screenshotRepo = new ScreenshotRepository();
    this.batchReportRepo = new BatchReportRepository();
    this.reportsRepo = new ReportsRepository();

    // Initialize Gemini AI
    this.genAI = null;
    this.model = null;
    if (process.env.GOOGLE_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
      this.model = this.genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
    } else {
      logger.warn('Google API key not found - AI analysis disabled');
    }
  }

  async triggerBatchProcessing(userId, sessionId, options = {}) {
    try {
      const { batchSize = 30, analysisType = 'standard' } = options;
      logger.info('Starting batch processing', { userId, sessionId, batchSize, analysisType });

      // Get recent screenshots for the session
      logger.info('Attempting to find screenshots by session', { sessionId, userId, batchSize });
      const screenshots = await this.screenshotRepo.findBySession(sessionId, userId, { limit: batchSize });
      logger.info('Screenshots found', { count: screenshots.length, sessionId });

      if (screenshots.length === 0) {
        throw new ApiError('NO_SCREENSHOTS', { message: 'No screenshots found for batch processing' });
      }

      logger.info(`Found ${screenshots.length} screenshots for batch processing`);

      // Process screenshots with AI if available
      let analysisResult = null;
      if (this.model && screenshots.length > 0) {
        analysisResult = await this.performGeminiAnalysis(screenshots, analysisType);
      } else {
        analysisResult = this.generateFallbackAnalysis(screenshots);
      }

      // Create batch report
      let batchReport = null;
      try {
        const screenshotIds = screenshots.map(s => s.id);
        const batchNumber = Math.floor(Date.now() / 1000);
        logger.info('Creating batch report', { screenshotIds, batchNumber, sessionId });

        batchReport = await this.batchReportRepo.create({
          session_id: sessionId,
          user_id: userId,
          batch_number: batchNumber,
          screenshot_ids: screenshotIds,
          screenshot_count: screenshots.length,
          start_time: screenshots[0]?.created_at || new Date().toISOString(),
          end_time: screenshots[screenshots.length - 1]?.created_at || new Date().toISOString(),
          processing_status: 'completed',
          gemini_analysis: analysisResult,
          efficiency_score: analysisResult?.productivityMetrics?.focusScore || 0,
          tasks_identified: analysisResult?.insights || [],
          tasks_completed: [],
          applications_used: analysisResult?.activityBreakdown?.primaryApplications || [],
          activities: analysisResult?.activityBreakdown || {},
          processed_at: new Date().toISOString(),
          analysis_result: analysisResult
        });

        logger.info('Batch report created successfully', { batchReportId: batchReport.id });
      } catch (error) {
        logger.warn('Batch report creation failed, using fallback storage', { error: error.message });

        // Fallback: Store analysis in session metadata
        try {
          const sessionMetadata = {
            last_batch_analysis: {
              screenshot_count: screenshots.length,
              analysis_type: analysisType,
              analysis_result: analysisResult,
              created_at: new Date().toISOString()
            }
          };
          await this.workSessionRepo.updateSessionMetadata(sessionId, sessionMetadata);
          logger.info('Batch analysis stored in session metadata as fallback');
        } catch (fallbackError) {
          logger.warn('Fallback storage also failed, continuing without persistence');
        }
      }

      logger.info('Batch processing completed successfully', {
        userId,
        sessionId,
        screenshotCount: screenshots.length
      });

      return {
        batchReportId: batchReport?.id || `fallback_${Date.now()}`,
        screenshotCount: screenshots.length,
        analysisType,
        summary: analysisResult.summary || 'Analysis completed',
        createdAt: batchReport?.created_at || new Date().toISOString()
      };

    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Batch processing failed', {
        error: error.message,
        stack: error.stack,
        userId,
        sessionId,
        errorType: error.constructor.name
      });
      throw new ApiError('BATCH_PROCESSING_FAILED', { operation: 'trigger_batch_processing' });
    }
  }

  async performGeminiAnalysis(screenshots, analysisType) {
    try {
      // Perform multi-image group analysis (15 images at once)
      const groupAnalysis = await this.analyzeImageGroup(screenshots, analysisType);

      if (!groupAnalysis) {
        logger.warn('Group image analysis failed, using fallback');
        return this.generateFallbackAnalysis(screenshots);
      }

      return groupAnalysis;

    } catch (error) {
      logger.error('Gemini group analysis failed', { error: error.message });
      return this.generateFallbackAnalysis(screenshots);
    }
  }

  async analyzeImageGroup(screenshots, analysisType) {
    try {
      logger.info(`Starting group analysis for ${screenshots.length} screenshots`);

      // Sort screenshots chronologically
      const sortedScreenshots = [...screenshots].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

      // Download all screenshot images
      const imageData = [];
      for (const screenshot of sortedScreenshots) {
        try {
          const image = await this.downloadScreenshotImage(screenshot.file_storage_key);
          imageData.push({
            screenshot,
            imageBuffer: image,
            timestamp: new Date(screenshot.created_at).toLocaleTimeString(),
            activeApp: screenshot.active_app || 'Unknown'
          });
        } catch (downloadError) {
          logger.warn(`Failed to download screenshot ${screenshot.id}`, { error: downloadError.message });
        }
      }

      if (imageData.length === 0) {
        throw new Error('No images could be downloaded for analysis');
      }

      // Create group analysis prompt
      const groupPrompt = this.buildGroupAnalysisPrompt(imageData, analysisType);

      // Prepare multi-image parts for Gemini
      const imageParts = imageData.map((item, index) => ({
        inlineData: {
          mimeType: "image/jpeg",
          data: item.imageBuffer.toString('base64')
        }
      }));

      // Send to Gemini with all images
      const result = await this.model.generateContent({
        contents: [{
          role: "user",
          parts: [
            { text: groupPrompt },
            ...imageParts
          ]
        }],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.8,
          maxOutputTokens: 3072,
        }
      });

      const response = await result.response;
      const analysisText = response.text();

      logger.info('Group analysis completed successfully', {
        screenshotCount: imageData.length,
        responseLength: analysisText.length
      });

      // Store individual analysis results in database
      await this.storeGroupAnalysisResults(imageData, analysisText);

      return this.parseGeminiResponse(analysisText, screenshots.length);

    } catch (error) {
      logger.error('Group image analysis failed', { error: error.message, stack: error.stack });
      throw error;
    }
  }

  async getExistingScreenshotAnalyses(screenshots) {
    try {
      // Get existing analyses from the screenshot_analysis table
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      const screenshotIds = screenshots.map(s => s.id).filter(Boolean);

      if (screenshotIds.length === 0) {
        return [];
      }

      const { data, error } = await supabase
        .from('screenshot_analysis')
        .select('screenshot_id, activity_detected, productivity_score, detected_apps, detected_tasks')
        .in('screenshot_id', screenshotIds)
        .order('created_at', { ascending: true });

      if (error) {
        logger.warn('Failed to fetch existing analyses', { error: error.message });
        return [];
      }

      // Match analyses with screenshot data
      const analyses = [];
      for (const analysis of data || []) {
        const screenshot = screenshots.find(s => s.id === analysis.screenshot_id);
        if (screenshot) {
          analyses.push({
            screenshot_id: analysis.screenshot_id,
            timestamp: screenshot.created_at,
            active_app: screenshot.active_app,
            description: `User was doing ${analysis.activity_detected} (${Math.round(analysis.productivity_score)}% productive)${analysis.detected_apps ? ` using ${analysis.detected_apps.map(app => app.name).join(', ')}` : ''}`,
            analyzed_with_existing_data: true,
            activity_detected: analysis.activity_detected,
            productivity_score: analysis.productivity_score
          });
        }
      }

      logger.info('Retrieved existing screenshot analyses', {
        found: analyses.length,
        requested: screenshots.length
      });

      return analyses;
    } catch (error) {
      logger.warn('Failed to get existing analyses', { error: error.message });
      return [];
    }
  }

  async analyzeIndividualScreenshot(screenshot) {
    try {
      // Get screenshot image from Supabase storage
      const imageData = await this.downloadScreenshotImage(screenshot.file_storage_key);

      const prompt = `Analyze this screenshot and describe what the user was doing. Be specific about:
1. What application/tool is being used
2. What specific task or activity is happening
3. What content is visible (code, documents, websites, etc.)
4. Any specific work being done

Respond in 2-3 sentences describing what you see.`;

      const result = await this.model.generateContent({
        contents: [{
          role: "user",
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageData.toString('base64')
              }
            }
          ]
        }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 200,
        }
      });

      const response = await result.response;
      return {
        description: response.text(),
        analyzed_with_vision: true
      };
    } catch (error) {
      logger.warn('Individual screenshot analysis failed', { error: error.message });
      return {
        description: `User was working in ${screenshot.active_app || 'unknown application'}`,
        analyzed_with_vision: false
      };
    }
  }

  async downloadScreenshotImage(storageKey) {
    // Download image from Supabase storage
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data, error } = await supabase.storage
      .from('screenshots')
      .download(storageKey);

    if (error) {
      throw new Error(`Failed to download screenshot: ${error.message}`);
    }

    return Buffer.from(await data.arrayBuffer());
  }

  buildGroupAnalysisPrompt(imageData, analysisType) {
    const sessionDuration = imageData.length > 1
      ? Math.round((new Date(imageData[imageData.length-1].screenshot.created_at) - new Date(imageData[0].screenshot.created_at)) / 1000 / 60)
      : 0;

    const imageList = imageData.map((item, index) =>
      `Image ${index + 1}: [${item.timestamp}] ${item.activeApp}`
    ).join('\n');

    return `
You are OnlyWorks AI, analyzing a work session with ${imageData.length} screenshots taken over ${sessionDuration} minutes.

## TASK: Multi-Image Workflow Analysis
Analyze these ${imageData.length} screenshots as a cohesive work session. Examine the visual content of each image to understand the user's workflow, tasks, and productivity patterns.

## SCREENSHOTS IN THIS SESSION:
${imageList}

## ANALYSIS FRAMEWORK

### 1. WORK CLARITY & PROGRESSION
- What specific tasks were completed or progressed across these screenshots?
- What applications/tools were used and for what purpose?
- How did the work evolve from the first to the last screenshot?
- What type of work is this? (coding, design, communication, research, debugging, meetings, documentation, writing, planning)

### 2. WORKFLOW PATTERNS
- What is the main workflow or project being worked on?
- How much context switching occurred between different tools/tasks?
- What was the user's focus and attention pattern?
- Any signs of productivity, distraction, or breaks?

### 3. CONTRIBUTION RECOGNITION
- What value was delivered in this session?
- What "invisible work" occurred? (research, planning, debugging, optimization, learning)
- What problems were solved or progress was made?

### 4. PRODUCTIVITY INSIGHTS
- What were the most productive periods in this session?
- Any efficiency insights or recommendations?
- Overall productivity score (0-100) for this work session

## RESPONSE FORMAT
Provide a comprehensive analysis that covers:
1. **Session Overview**: Main work focus and key accomplishments
2. **Detailed Activity Breakdown**: What happened in each phase of the session
3. **Productivity Assessment**: Strengths, challenges, and overall effectiveness
4. **Workflow Insights**: Patterns, efficiency observations, and recommendations

Be specific about what you can see in the visual content of each screenshot.
`;
  }

  async storeGroupAnalysisResults(imageData, analysisText) {
    try {
      // Parse the analysis to extract individual screenshot insights
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_ROLE_KEY
      );

      // For now, create a simple analysis entry for each screenshot
      // In the future, we could parse the AI response to extract individual insights
      const groupId = `group_${Date.now()}`;

      for (const item of imageData) {
        try {
          const analysisData = {
            screenshot_id: item.screenshot.id,
            user_id: item.screenshot.user_id,
            activity_detected: this.extractActivityFromGroupAnalysis(analysisText, item.activeApp),
            productivity_score: this.extractProductivityScore(analysisText),
            group_analysis_id: groupId,
            group_analysis_text: analysisText.substring(0, 1000), // Store truncated version
            analyzed_with_group: true,
            created_at: new Date().toISOString()
          };

          const { error } = await supabase
            .from('screenshot_analysis')
            .insert(analysisData);

          if (error) {
            logger.warn(`Failed to store analysis for screenshot ${item.screenshot.id}`, { error: error.message });
          }
        } catch (storeError) {
          logger.warn(`Error storing individual analysis for screenshot ${item.screenshot.id}`, { error: storeError.message });
        }
      }

      logger.info('Group analysis results stored successfully', {
        groupId,
        screenshotCount: imageData.length
      });

    } catch (error) {
      logger.error('Failed to store group analysis results', { error: error.message });
    }
  }

  extractActivityFromGroupAnalysis(analysisText, defaultApp) {
    // Simple extraction - look for common work activities in the analysis
    const text = analysisText.toLowerCase();

    if (text.includes('coding') || text.includes('programming') || text.includes('development')) {
      return 'coding';
    } else if (text.includes('design') || text.includes('creative')) {
      return 'design';
    } else if (text.includes('research') || text.includes('browsing') || text.includes('learning')) {
      return 'research';
    } else if (text.includes('writing') || text.includes('documentation') || text.includes('notes')) {
      return 'writing';
    } else if (text.includes('communication') || text.includes('email') || text.includes('chat')) {
      return 'communication';
    } else if (text.includes('meeting') || text.includes('video call')) {
      return 'meeting';
    } else {
      return 'general_work';
    }
  }

  extractProductivityScore(analysisText) {
    // Look for productivity scores in the analysis text
    const scoreMatch = analysisText.match(/productivity.*?(\d+)/i) ||
                      analysisText.match(/score.*?(\d+)/i) ||
                      analysisText.match(/(\d+)%/);

    if (scoreMatch && scoreMatch[1]) {
      const score = parseInt(scoreMatch[1]);
      return Math.min(Math.max(score, 0), 100); // Ensure 0-100 range
    }

    // Default productivity score based on analysis sentiment
    const text = analysisText.toLowerCase();
    if (text.includes('highly productive') || text.includes('excellent')) {
      return 85;
    } else if (text.includes('productive') || text.includes('focused')) {
      return 75;
    } else if (text.includes('moderately') || text.includes('some progress')) {
      return 65;
    } else {
      return 50; // Default moderate score
    }
  }

  buildAggregateAnalysisPrompt(individualAnalyses, screenshots) {
    const sessionDuration = screenshots.length > 1
      ? Math.round((new Date(screenshots[screenshots.length-1].created_at) - new Date(screenshots[0].created_at)) / 1000 / 60)
      : 0;

    const analysisText = individualAnalyses.map((analysis, index) => {
      const timestamp = new Date(analysis.timestamp).toLocaleTimeString();
      return `${index + 1}. [${timestamp}] ${analysis.active_app || 'Unknown'}: ${analysis.description}`;
    }).join('\n');

    return `
You are OnlyWorks AI, analyzing a work session with ${screenshots.length} screenshots over ${sessionDuration} minutes.

Individual Screenshot Analysis:
${analysisText}

Based on these individual screenshot analyses, provide a comprehensive summary following the OnlyWorks framework:

## ANALYSIS FRAMEWORK

### 1. WORK CLARITY
- What specific tasks were completed or progressed?
- What applications/tools were used and for what purpose?
- What type of work is this? (coding, design, communication, research, debugging, meetings, stakeholder management, documentation)
- How much context switching occurred?

### 2. CONTRIBUTION RECOGNITION
- What value was delivered in this session?
- What "invisible work" occurred? (research, debugging, unblocking others, knowledge sharing, process improvements)
- How does this work impact the team or cross-functional dependencies?

### 3. PATTERN & AUTOMATION OPPORTUNITIES
- Are there recurring workflows that could be automated?
- Are there repetitive tasks draining productivity?

## OUTPUT FORMAT

Return a JSON object with this exact structure:

{
  "summary": {
    "reportReadySummary": "One paragraph progress update suitable for standups (progress-focused, empowering tone)",
    "workCompleted": ["Specific task 1 completed", "Specific task 2 progressed"],
    "timeBreakdown": {
      "coding": 0,
      "meetings": 0,
      "communication": 0,
      "research": 0,
      "debugging": 0,
      "design": 0,
      "documentation": 0,
      "contextSwitching": 0
    }
  },

  "recognition": {
    "accomplishments": ["Specific value delivered 1", "Specific value delivered 2"],
    "invisibleWork": ["Research into X", "Unblocked teammate on Y", "Improved process Z"],
    "teamImpact": "How this work helps the broader team or cross-functional stakeholders"
  },

  "automation": {
    "patterns": ["Recurring workflow 1 detected", "Repetitive task 2 identified"],
    "suggestions": ["Automate X with Y approach", "Create template for Z"],
    "timeSavingsPotential": "Estimated hours/week that could be saved"
  },

  "applications": ["app1", "app2"],
  "productivityMetrics": {
    "focusScore": 0.0-1.0,
    "distractionEvents": 0,
    "taskSwitching": 0
  }
}

## PRIVACY & ETHICS
- NEVER include actual passwords, API keys, credentials, or PII in output
- Focus on work patterns, not surveillance
- Use empowering, non-judgmental language
- Emphasize progress made, not time wasted

Analyze the work session and return the JSON response.`;
  }

  buildAnalysisPrompt(screenshots, analysisType) {
    // Sort screenshots by timestamp (oldest first) for proper time calculation
    const sortedScreenshots = [...screenshots].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const screenshotInfo = sortedScreenshots.map((screenshot, index) => ({
      index: index + 1,
      timestamp: new Date(screenshot.created_at).toISOString(),
      captureTriger: screenshot.capture_trigger || 'unknown',
      activeApp: screenshot.active_app || 'Unknown'
    }));

    // Calculate timing patterns for better analysis
    const timeSpans = [];
    for (let i = 1; i < screenshotInfo.length; i++) {
      const prevTime = new Date(screenshotInfo[i-1].timestamp);
      const currTime = new Date(screenshotInfo[i].timestamp);
      const intervalSeconds = Math.round((currTime - prevTime) / 1000);
      // Ensure positive intervals and cap at reasonable maximum (30 minutes)
      timeSpans.push(Math.max(0, Math.min(intervalSeconds, 1800)));
    }

    const avgInterval = timeSpans.length > 0 ? Math.round(timeSpans.reduce((a, b) => a + b, 0) / timeSpans.length) : 0;
    const uniqueApps = [...new Set(screenshotInfo.map(s => s.activeApp).filter(app => app !== 'Unknown'))];
    const triggerCounts = screenshotInfo.reduce((acc, s) => {
      acc[s.captureTriger] = (acc[s.captureTriger] || 0) + 1;
      return acc;
    }, {});

    const hasAppData = uniqueApps.length > 0;
    const sessionDuration = screenshotInfo.length > 1
      ? Math.round((new Date(screenshotInfo[screenshotInfo.length-1].timestamp) - new Date(screenshotInfo[0].timestamp)) / 1000 / 60)
      : 0;

    return `
You are OnlyWorks AI, an analysis engine that brings clarity, recognition, and alignment to modern work.
Your role is to analyze screenshots and provide insights that make users feel understood, valued, and in
control—never surveilled.

## CONTEXT PROVIDED
- Current Session Duration: ${sessionDuration} minutes
- Screenshots Analyzed: ${screenshots.length}
- Applications detected: ${hasAppData ? uniqueApps.join(', ') : 'Unknown (app detection unavailable)'}
- Average screenshot interval: ${avgInterval} seconds
- Capture triggers: ${Object.entries(triggerCounts).map(([k,v]) => `${k}: ${v}`).join(', ')}

Screenshot Timeline:
${screenshotInfo.map((info, i) => {
  const interval = i > 0 ? timeSpans[i-1] + 's' : '0s';
  return `${info.index}. [+${interval}] ${info.captureTriger} → ${info.activeApp}`;
}).join('\\n')}

## ANALYSIS FRAMEWORK

Analyze the provided screenshots to answer these questions:

### 1. WORK CLARITY
- What specific tasks were completed or progressed?
- What applications/tools were used and for what purpose?
- What type of work is this? (coding, design, communication, research, debugging, meetings, stakeholder management, documentation)
- How much context switching occurred?

### 2. BLOCKERS & SUPPORT NEEDS
- What blockers were encountered? (technical issues, waiting on others, unclear requirements, tooling problems)
- What dependencies exist on other team members?
- What needs escalation or support?

### 3. CONTRIBUTION RECOGNITION
- What value was delivered in this session?
- What "invisible work" occurred? (research, debugging, unblocking others, knowledge sharing, process improvements)
- How does this work impact the team or cross-functional dependencies?

### 4. PATTERN & AUTOMATION OPPORTUNITIES
- Are there recurring workflows that could be automated?
- Are there repetitive tasks draining productivity?

## OUTPUT FORMAT

Return a JSON object with this exact structure:

{
  "summary": {
    "reportReadySummary": "One paragraph progress update suitable for standups (progress-focused, empowering tone)",
    "workCompleted": ["Specific task 1 completed", "Specific task 2 progressed"],
    "timeBreakdown": {
      "coding": 0,
      "meetings": 0,
      "communication": 0,
      "research": 0,
      "debugging": 0,
      "design": 0,
      "documentation": 0,
      "contextSwitching": 0
    }
  },

  "recognition": {
    "accomplishments": ["Specific value delivered 1", "Specific value delivered 2"],
    "invisibleWork": ["Research into X", "Unblocked teammate on Y", "Improved process Z"],
    "teamImpact": "How this work helps the broader team or cross-functional stakeholders"
  },

  "automation": {
    "patterns": ["Recurring workflow 1 detected", "Repetitive task 2 identified"],
    "suggestions": ["Automate X with Y approach", "Create template for Z"],
    "timeSavingsPotential": "Estimated hours/week that could be saved"
  },

  "applications": [${hasAppData ? uniqueApps.map(app => `"${app}"`).join(', ') : '"Unknown"'}],
  "productivityMetrics": {
    "focusScore": 0.0-1.0,
    "distractionEvents": 0,
    "taskSwitching": 0
  }
}

## PRIVACY & ETHICS
- NEVER include actual passwords, API keys, credentials, or PII in output
- Focus on work patterns, not surveillance
- Use empowering, non-judgmental language
- Frame blockers as "needs support" not "failure"
- Emphasize progress made, not time wasted

Analyze the screenshots and return the JSON response.`;
  }

  parseGeminiResponse(responseText, screenshotCount) {
    try {
      const jsonMatch = responseText.match(/\\{[\\s\\S]*\\}/);
      if (jsonMatch) {
        const parsedResponse = JSON.parse(jsonMatch[0]);
        return {
          ...parsedResponse,
          analysisSource: 'gemini-ai',
          screenshotCount,
          generatedAt: new Date().toISOString()
        };
      }
    } catch (error) {
      logger.warn('Failed to parse Gemini response as JSON, using fallback', { error: error.message });
    }

    return {
      summary: this.extractSummaryFromText(responseText),
      analysisSource: 'gemini-ai-fallback',
      rawResponse: responseText,
      screenshotCount,
      generatedAt: new Date().toISOString()
    };
  }

  extractSummaryFromText(text) {
    const lines = text.split('\\n');
    const summaryLine = lines.find(line =>
      line.toLowerCase().includes('summary') ||
      line.toLowerCase().includes('overview')
    );
    return summaryLine ? summaryLine.replace(/^[^:]*:/, '').trim() : text.substring(0, 200);
  }

  generateFallbackAnalysis(screenshots) {
    const apps = [...new Set(screenshots.map(s => s.active_app).filter(Boolean))];
    const triggers = screenshots.reduce((acc, s) => {
      acc[s.capture_trigger || 'unknown'] = (acc[s.capture_trigger || 'unknown'] || 0) + 1;
      return acc;
    }, {});

    const clickScreenshots = triggers.click || 0;
    const timerScreenshots = triggers.interval || 0;
    const focusScore = timerScreenshots > 0 ? Math.min(timerScreenshots / (clickScreenshots + timerScreenshots), 1.0) : 0.5;

    return {
      summary: `Analysis of ${screenshots.length} screenshots showing activity across ${apps.length} applications`,
      productivityMetrics: {
        focusScore,
        distractionEvents: clickScreenshots,
        taskSwitching: Math.floor(apps.length / 2)
      },
      activityBreakdown: {
        primaryApplications: apps.slice(0, 3),
        workPatterns: `${clickScreenshots} click-triggered and ${timerScreenshots} timer-triggered captures`
      },
      insights: [
        `Primary applications used: ${apps.slice(0, 2).join(', ')}`,
        `Capture pattern: ${Math.round((clickScreenshots / screenshots.length) * 100)}% click-based`,
        `Application diversity: ${apps.length} different applications detected`
      ],
      recommendations: [
        focusScore < 0.5 ? 'Consider reducing task switching for better focus' : 'Good focus patterns detected',
        'Enable detailed AI analysis for deeper insights'
      ],
      analysisSource: 'fallback',
      screenshotCount: screenshots.length,
      generatedAt: new Date().toISOString()
    };
  }

  async generateSessionSummary(userId, sessionId) {
    try {
      logger.info('Generating session summary', { userId, sessionId });

      // Get batch reports for the session
      let batchReports = [];
      try {
        logger.info('Attempting to get session reports from batch_reports table', { sessionId });
        batchReports = await this.batchReportRepo.getSessionReports(sessionId, {
          limit: 100,
          orderBy: 'created_at',
          direction: 'ASC'
        });
        logger.info('Successfully retrieved batch reports', { count: batchReports.length, sessionId });
      } catch (error) {
        logger.warn('Batch reports table not available, using screenshots directly', { error: error.message, sessionId });

        // Fallback: Generate summary from screenshots
        logger.info('Falling back to screenshot-based summary generation', { sessionId });
        const screenshots = await this.screenshotRepo.findBySession(sessionId, userId, { limit: 100 });
        logger.info('Screenshots retrieved for fallback summary', { count: screenshots.length, sessionId });
        if (screenshots.length === 0) {
          throw new ApiError('NO_DATA', { message: 'No data available for session summary' });
        }

        const fallbackAnalysis = this.generateFallbackAnalysis(screenshots);
        batchReports = [{
          id: `generated_${Date.now()}`,
          session_id: sessionId,
          user_id: userId,
          screenshot_count: screenshots.length,
          analysis_type: 'fallback',
          analysis_result: fallbackAnalysis,
          created_at: new Date().toISOString()
        }];
      }

      // Get session details
      const session = await this.workSessionRepo.getSessionById(sessionId, userId);
      if (!session) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'work_session' });
      }

      // Generate summary from batch reports
      const aggregatedData = this.aggregateBatchReports(batchReports);

      const summary = {
        sessionId,
        sessionName: session.session_name,
        goalDescription: session.goal_description,
        duration: {
          seconds: session.duration_seconds || 0,
          formatted: this.formatDuration(session.duration_seconds || 0)
        },
        timeRange: {
          startedAt: session.started_at,
          endedAt: session.ended_at || new Date().toISOString()
        },
        overview: `Session analyzed across ${batchReports.length} batches with ${aggregatedData.totalScreenshots} total screenshots`,
        batchAnalysis: {
          totalBatches: batchReports.length,
          totalScreenshots: aggregatedData.totalScreenshots,
          averageProductivity: aggregatedData.averageProductivity,
          focusPercentage: aggregatedData.focusPercentage
        },
        insights: aggregatedData.insights,
        recommendations: aggregatedData.recommendations,
        generatedAt: new Date().toISOString()
      };

      logger.info('Session summary generated successfully', {
        userId,
        sessionId,
        batchCount: batchReports.length,
        totalScreenshots: aggregatedData.totalScreenshots
      });

      // Store comprehensive report in reports table
      try {
        const reportData = {
          title: `${session?.session_name || 'Work Session'} - ${new Date(session?.started_at || new Date()).toLocaleDateString()}`,
          comprehensiveReport: summary,
          executiveSummary: summary.overview,
          productivityScore: aggregatedData.averageProductivity / 100,
          focusScore: aggregatedData.focusPercentage / 100,
          sessionDurationMinutes: session?.duration_seconds ? Math.round(session.duration_seconds / 60) : null,
          screenshotCount: aggregatedData.totalScreenshots
        };

        await this.reportsRepo.createSessionReport(userId, sessionId, reportData);

        logger.info('Comprehensive report stored successfully', {
          userId,
          sessionId,
          reportTitle: reportData.title
        });
      } catch (reportError) {
        // Don't fail the request if report storage fails
        logger.warn('Failed to store comprehensive report', {
          error: reportError.message,
          userId,
          sessionId
        });
      }

      return summary;

    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Failed to generate session summary', { error: error.message, userId, sessionId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'generate_session_summary' });
    }
  }

  aggregateBatchReports(batchReports) {
    const totalScreenshots = batchReports.reduce((sum, report) => sum + report.screenshot_count, 0);

    const productivityScores = batchReports
      .map(r => r.analysis_result?.productivityMetrics?.focusScore)
      .filter(score => score !== null && score !== undefined);

    const averageProductivity = productivityScores.length > 0
      ? productivityScores.reduce((sum, score) => sum + score, 0) / productivityScores.length
      : 0;

    const allInsights = batchReports
      .flatMap(r => r.analysis_result?.insights || [])
      .filter((insight, index, arr) => arr.indexOf(insight) === index);

    const allRecommendations = batchReports
      .flatMap(r => r.analysis_result?.recommendations || [])
      .filter((rec, index, arr) => arr.indexOf(rec) === index);

    return {
      totalScreenshots,
      averageProductivity,
      focusPercentage: Math.round(averageProductivity * 100),
      insights: allInsights.slice(0, 10),
      recommendations: allRecommendations.slice(0, 8)
    };
  }

  formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  }
}

module.exports = BatchProcessingService;