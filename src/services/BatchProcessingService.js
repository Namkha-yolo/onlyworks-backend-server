const WorkSessionRepository = require('../repositories/WorkSessionRepository');
const ScreenshotRepository = require('../repositories/ScreenshotRepository');
const BatchReportRepository = require('../repositories/BatchReportRepository');
const { ApiError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');
const { GoogleGenerativeAI } = require('@google/generative-ai');

class BatchProcessingService {
  constructor() {
    this.workSessionRepo = new WorkSessionRepository();
    this.screenshotRepo = new ScreenshotRepository();
    this.batchReportRepo = new BatchReportRepository();

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
      // Use existing individual analyses from the screenshot_analysis table instead of re-analyzing images
      const existingAnalyses = await this.getExistingScreenshotAnalyses(screenshots);

      if (existingAnalyses.length === 0) {
        logger.warn('No existing screenshot analyses found, using fallback');
        return this.generateFallbackAnalysis(screenshots);
      }

      // Create aggregate analysis from existing individual analyses
      const aggregatePrompt = this.buildAggregateAnalysisPrompt(existingAnalyses, screenshots);
      const result = await this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: aggregatePrompt }] }],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.8,
          maxOutputTokens: 2048,
        }
      });

      const response = await result.response;
      const analysisText = response.text();
      return this.parseGeminiResponse(analysisText, screenshots.length);

    } catch (error) {
      logger.error('Gemini batch analysis failed', { error: error.message });
      return this.generateFallbackAnalysis(screenshots);
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