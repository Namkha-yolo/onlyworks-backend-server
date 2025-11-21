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

      return this.parseGeminiResponse(analysisText, screenshots.length);

    } catch (error) {
      logger.error('Group image analysis failed', { error: error.message, stack: error.stack });
      throw error;
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
You are OnlyWorks AI, a productivity mentor analyzing a work session with ${imageData.length} screenshots taken over ${sessionDuration} minutes.

## TASK: OnlyWorks Comprehensive Analysis
Analyze these ${imageData.length} screenshots as a cohesive work session. Examine the visual content of each image to understand the user's workflow, tasks, and productivity patterns.

## SCREENSHOTS IN THIS SESSION:
${imageList}

## OUTPUT FORMAT
Return a JSON object with the exact OnlyWorks 8-section structure:

{
  "summary": "Detailed, personable summary of what was accomplished. Be specific about main activities, tools used, work flow progression, and patterns observed. Write as a supportive colleague.",
  "goal_alignment": "Analyze how well the session aligned with productive goals. What % of time on productive tasks? Which activities contributed to progress? How focused vs scattered?",
  "blockers": "Identify obstacles to productivity. What interrupted work flow? Distraction patterns? Technical issues? Context switching? Be constructive.",
  "recognition": "Celebrate what went well. Completed tasks? Sustained focus? Good habits? Creative problem-solving? Be motivating.",
  "automation_opportunities": "Identify repetitive tasks that could be automated. Manual processes repeated? Workflows needing templates? Time savings estimates?",
  "communication_quality": "Assess communication patterns. Time in communication tools? Was it productive? Response times? Meeting effectiveness?",
  "next_steps": "Provide actionable advice. Top 3 specific actions to improve productivity. Suggested time blocks. Tools to try. Habits to build/break.",
  "ai_usage_efficiency": "Analyze how effectively AI tools are being used: Delegation balance (tool vs dependency)? Query quality (specific vs vague)? Learning indicators? Tool selection? Iteration patterns? Time efficiency vs AI interaction time?"
}

## ANALYSIS GUIDELINES:
- Be specific about what you see in the visual content
- Focus on observable behavior patterns in the screenshots
- Provide constructive, actionable insights
- Be supportive and motivating while being honest
- Look for AI tool usage patterns (ChatGPT, Claude, Copilot, etc.)
- Analyze prompt quality, refinement cycles, and learning indicators
- Measure productivity gains vs time spent on AI interactions
- Consider delegation balance: using AI as a tool vs total dependency

Be comprehensive but concise in each section. Help the user improve while feeling good about their progress.
`;
  }


  // Individual screenshot analysis removed to save tokens
  // Now only using batch/group analysis for efficiency

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

      // First, check if comprehensive report already exists in reports table
      try {
        logger.info('Checking for existing comprehensive report', { sessionId, userId });
        const existingReport = await this.reportsRepo.getBySessionId(sessionId, userId);

        if (existingReport && existingReport.summary) {
          logger.info('Found existing comprehensive report with OnlyWorks sections', {
            sessionId,
            reportId: existingReport.id,
            hasSections: {
              summary: !!existingReport.summary,
              goal_alignment: !!existingReport.goal_alignment,
              blockers: !!existingReport.blockers,
              recognition: !!existingReport.recognition,
              automation_opportunities: !!existingReport.automation_opportunities,
              communication_quality: !!existingReport.communication_quality,
              next_steps: !!existingReport.next_steps,
              ai_usage_efficiency: !!existingReport.ai_usage_efficiency
            }
          });

          // Return the comprehensive report with all OnlyWorks sections
          const comprehensiveResult = {
            sessionId: existingReport.session_id,
            sessionName: existingReport.title || `Work Session ${new Date(existingReport.created_at).toLocaleDateString()}`,
            goalDescription: null,
            duration: {
              seconds: existingReport.session_duration_minutes ? existingReport.session_duration_minutes * 60 : 0,
              formatted: this.formatDuration(existingReport.session_duration_minutes ? existingReport.session_duration_minutes * 60 : 0)
            },
            timeRange: {
              startedAt: existingReport.created_at,
              endedAt: existingReport.updated_at || existingReport.created_at
            },
            overview: existingReport.executive_summary || 'Session analyzed with comprehensive AI insights',
            batchAnalysis: {
              totalBatches: 1,
              totalScreenshots: existingReport.screenshot_count || 0,
              averageProductivity: existingReport.productivity_score ? Math.round(existingReport.productivity_score * 100) : 0,
              focusPercentage: existingReport.focus_score ? Math.round(existingReport.focus_score * 100) : 0
            },
            // Include all OnlyWorks sections
            summary: existingReport.summary,
            goal_alignment: existingReport.goal_alignment,
            blockers: existingReport.blockers,
            recognition: existingReport.recognition,
            automation_opportunities: existingReport.automation_opportunities,
            communication_quality: existingReport.communication_quality,
            next_steps: existingReport.next_steps,
            ai_usage_efficiency: existingReport.ai_usage_efficiency,
            // Metadata
            productivity_score: existingReport.productivity_score,
            focus_score: existingReport.focus_score,
            screenshot_count: existingReport.screenshot_count,
            generatedAt: existingReport.updated_at || existingReport.created_at
          };

          logger.info('Returning comprehensive report with OnlyWorks sections', { sessionId, reportId: existingReport.id });
          return comprehensiveResult;
        }

        logger.info('No existing comprehensive report found, generating new summary', { sessionId });
      } catch (reportError) {
        logger.warn('Error checking for existing report, proceeding with generation', {
          error: reportError.message,
          sessionId
        });
      }

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
          screenshotCount: aggregatedData.totalScreenshots,
          // OnlyWorks sections from AI analysis
          summary: aggregatedData.summary,
          goalAlignment: aggregatedData.goal_alignment,
          blockers: aggregatedData.blockers,
          recognition: aggregatedData.recognition,
          automationOpportunities: aggregatedData.automation_opportunities,
          communicationQuality: aggregatedData.communication_quality,
          nextSteps: aggregatedData.next_steps,
          aiUsageEfficiency: aggregatedData.ai_usage_efficiency
        };

        await this.reportsRepo.createSessionReport(userId, sessionId, reportData);

        logger.info('Comprehensive report stored successfully', {
          userId,
          sessionId,
          reportTitle: reportData.title
        });
      } catch (reportError) {
        // Log the error prominently but don't fail the request
        logger.error('CRITICAL: Failed to store comprehensive report - reports will be missing from UI', {
          error: reportError.message,
          stack: reportError.stack,
          userId,
          sessionId,
          reportInfo: {
            sessionName: session?.session_name || 'Work Session',
            totalScreenshots: aggregatedData.totalScreenshots
          }
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
    logger.info('Aggregating batch reports', { count: batchReports.length });

    if (batchReports.length === 0) {
      logger.warn('No batch reports to aggregate');
      return {
        totalScreenshots: 0,
        averageProductivity: 0,
        focusPercentage: 0,
        insights: ['No analysis data available'],
        recommendations: ['Complete more session time for detailed insights']
      };
    }

    const totalScreenshots = batchReports.reduce((sum, report) => sum + (report.screenshot_count || 0), 0);

    // Try multiple possible score paths for better compatibility
    const productivityScores = batchReports
      .map(r => {
        const analysis = r.analysis_result || {};
        return analysis.productivityMetrics?.focusScore ||
               analysis.focusScore ||
               analysis.productivity_score ||
               null;
      })
      .filter(score => score !== null && score !== undefined && typeof score === 'number');

    // Also try to extract focus scores separately
    const focusScores = batchReports
      .map(r => {
        const analysis = r.analysis_result || {};
        return analysis.focusMetrics?.score ||
               analysis.focus_score ||
               analysis.focusScore ||
               null;
      })
      .filter(score => score !== null && score !== undefined && typeof score === 'number');

    // Use whichever has more data points
    const scores = productivityScores.length >= focusScores.length ? productivityScores : focusScores;

    const averageProductivity = scores.length > 0
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : 0;

    // Collect insights from multiple possible paths
    const allInsights = batchReports
      .flatMap(r => {
        const analysis = r.analysis_result || {};
        return [
          ...(analysis.insights || []),
          ...(analysis.keyInsights || []),
          ...(analysis.summary ? [analysis.summary] : [])
        ];
      })
      .filter(insight => insight && typeof insight === 'string')
      .filter((insight, index, arr) => arr.indexOf(insight) === index);

    // Collect recommendations from multiple possible paths
    const allRecommendations = batchReports
      .flatMap(r => {
        const analysis = r.analysis_result || {};
        return [
          ...(analysis.recommendations || []),
          ...(analysis.suggestions || []),
          ...(analysis.actionItems || [])
        ];
      })
      .filter(rec => rec && typeof rec === 'string')
      .filter((rec, index, arr) => arr.indexOf(rec) === index);

    // Extract OnlyWorks sections from AI analysis
    const onlyWorksData = this.extractOnlyWorksSections(batchReports);

    const result = {
      totalScreenshots,
      averageProductivity,
      focusPercentage: Math.round(averageProductivity * 100),
      insights: allInsights.slice(0, 10),
      recommendations: allRecommendations.slice(0, 8),
      batchCount: batchReports.length,
      scoreDataPoints: scores.length,
      // Add OnlyWorks sections
      ...onlyWorksData
    };

    logger.info('Batch reports aggregated', {
      totalScreenshots: result.totalScreenshots,
      averageProductivity: result.averageProductivity,
      insightCount: result.insights.length,
      recommendationCount: result.recommendations.length,
      batchCount: result.batchCount
    });

    return result;
  }

  extractOnlyWorksSections(batchReports) {
    logger.info('Extracting OnlyWorks sections from batch reports', { count: batchReports.length });

    // Extract sections from the most recent analysis that has complete OnlyWorks data
    let onlyWorksData = {
      summary: null,
      goal_alignment: null,
      blockers: null,
      recognition: null,
      automation_opportunities: null,
      communication_quality: null,
      next_steps: null,
      ai_usage_efficiency: null
    };

    for (const report of batchReports) {
      const analysis = report.analysis_result || {};

      // Check if this analysis has the OnlyWorks structure
      if (analysis.summary && typeof analysis.summary === 'string') {
        onlyWorksData.summary = analysis.summary;
      }
      if (analysis.goal_alignment && typeof analysis.goal_alignment === 'string') {
        onlyWorksData.goal_alignment = analysis.goal_alignment;
      }
      if (analysis.blockers && typeof analysis.blockers === 'string') {
        onlyWorksData.blockers = analysis.blockers;
      }
      if (analysis.recognition && typeof analysis.recognition === 'string') {
        onlyWorksData.recognition = analysis.recognition;
      }
      if (analysis.automation_opportunities && typeof analysis.automation_opportunities === 'string') {
        onlyWorksData.automation_opportunities = analysis.automation_opportunities;
      }
      if (analysis.communication_quality && typeof analysis.communication_quality === 'string') {
        onlyWorksData.communication_quality = analysis.communication_quality;
      }
      if (analysis.next_steps && typeof analysis.next_steps === 'string') {
        onlyWorksData.next_steps = analysis.next_steps;
      }
      if (analysis.ai_usage_efficiency && typeof analysis.ai_usage_efficiency === 'string') {
        onlyWorksData.ai_usage_efficiency = analysis.ai_usage_efficiency;
      }
    }

    logger.info('OnlyWorks sections extracted', {
      sectionsFound: Object.values(onlyWorksData).filter(v => v !== null).length,
      hasSummary: !!onlyWorksData.summary,
      hasAiEfficiency: !!onlyWorksData.ai_usage_efficiency
    });

    return onlyWorksData;
  }

  async getBatchStatus(userId, sessionId) {
    try {
      logger.info('Getting batch status for session', { userId, sessionId });

      // Get all batch reports for this session to determine status
      const batchReports = await this.batchReportRepo.getSessionReports(sessionId, {
        limit: 100,
        orderBy: 'created_at',
        direction: 'DESC'
      });

      // Get screenshots to determine how many need processing
      const screenshots = await this.screenshotRepo.findBySession(sessionId, userId, { limit: 1000 });
      const totalScreenshots = screenshots.length;

      // Calculate processed screenshots from batch reports
      const processedScreenshots = batchReports.reduce((sum, report) => sum + (report.screenshot_count || 0), 0);
      const pendingScreenshots = Math.max(0, totalScreenshots - processedScreenshots);

      const status = {
        sessionId,
        totalScreenshots,
        processedScreenshots,
        pendingScreenshots,
        totalBatches: batchReports.length,
        activeBatches: 0, // We don't currently track active batches, so assume 0
        pendingBatches: pendingScreenshots > 0 ? Math.ceil(pendingScreenshots / 30) : 0, // Estimate pending batches
        status: pendingScreenshots > 0 ? 'processing' : 'completed',
        allBatchesCompleted: pendingScreenshots === 0,
        lastUpdated: new Date().toISOString()
      };

      logger.info('Batch status calculated', status);
      return status;
    } catch (error) {
      logger.error('Failed to get batch status', { error: error.message, userId, sessionId });
      // Return a safe default status
      return {
        sessionId,
        totalScreenshots: 0,
        processedScreenshots: 0,
        pendingScreenshots: 0,
        totalBatches: 0,
        activeBatches: 0,
        pendingBatches: 0,
        status: 'completed',
        allBatchesCompleted: true,
        error: error.message,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  async getBatchReports(userId, sessionId, options = {}) {
    try {
      logger.info('Getting batch reports for session', { userId, sessionId, options });

      const { limit = 10, offset = 0 } = options;

      const batchReports = await this.batchReportRepo.getSessionReports(sessionId, {
        limit,
        offset,
        orderBy: 'created_at',
        direction: 'DESC'
      });

      logger.info('Batch reports retrieved', { count: batchReports.length, sessionId });
      return batchReports;
    } catch (error) {
      logger.error('Failed to get batch reports', { error: error.message, userId, sessionId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_batch_reports' });
    }
  }

  async generateShareableSessionSummary(userId, sessionId, options = {}) {
    try {
      logger.info('Generating shareable session summary', { userId, sessionId, options });

      const { includePrivateData = false, shareWithTeam = false, expiresInDays = 7 } = options;

      // Generate the session summary first
      const summary = await this.generateSessionSummary(userId, sessionId);

      // Create a shareable version (remove sensitive data if needed)
      const shareableData = {
        ...summary,
        // Remove sensitive user data if not including private data
        ...(includePrivateData ? {} : {
          userId: '[Hidden]',
          userEmail: '[Hidden]'
        }),
        shareSettings: {
          includePrivateData,
          shareWithTeam,
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + (expiresInDays * 24 * 60 * 60 * 1000)).toISOString()
        }
      };

      // Generate share token
      const shareToken = `share_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      // Store in a simple in-memory cache for now (in production, use Redis or database)
      if (!global.shareCache) {
        global.shareCache = new Map();
      }
      global.shareCache.set(shareToken, shareableData);

      // Clean up expired shares
      this.cleanupExpiredShares();

      logger.info('Shareable session summary created', { shareToken, sessionId });

      return {
        shareToken,
        shareUrl: `/api/batch/shared/${shareToken}`,
        expiresAt: shareableData.shareSettings.expiresAt,
        summary: shareableData
      };
    } catch (error) {
      logger.error('Failed to generate shareable session summary', { error: error.message, userId, sessionId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'generate_shareable_summary' });
    }
  }

  async getSharedReport(shareToken) {
    try {
      logger.info('Getting shared report', { shareToken });

      if (!global.shareCache) {
        return null;
      }

      const sharedData = global.shareCache.get(shareToken);
      if (!sharedData) {
        return null;
      }

      // Check if expired
      const expiresAt = new Date(sharedData.shareSettings.expiresAt);
      if (expiresAt < new Date()) {
        global.shareCache.delete(shareToken);
        return null;
      }

      logger.info('Shared report retrieved', { shareToken });
      return sharedData;
    } catch (error) {
      logger.error('Failed to get shared report', { error: error.message, shareToken });
      return null;
    }
  }

  async revokeSharedReport(shareToken, userId) {
    try {
      logger.info('Revoking shared report', { shareToken, userId });

      if (!global.shareCache) {
        return false;
      }

      const sharedData = global.shareCache.get(shareToken);
      if (!sharedData) {
        return false;
      }

      // Check if user owns this share (simple check)
      // In production, you'd want proper ownership validation
      global.shareCache.delete(shareToken);

      logger.info('Shared report revoked', { shareToken, userId });
      return true;
    } catch (error) {
      logger.error('Failed to revoke shared report', { error: error.message, shareToken, userId });
      return false;
    }
  }

  async getUserSharedReports(userId, options = {}) {
    try {
      logger.info('Getting user shared reports', { userId, options });

      const { limit = 20, offset = 0 } = options;

      // For now, return empty array since we don't track user ownership in the simple cache
      // In production, you'd store shares in database with user_id
      const userShares = [];

      logger.info('User shared reports retrieved', { count: userShares.length, userId });
      return userShares;
    } catch (error) {
      logger.error('Failed to get user shared reports', { error: error.message, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_user_shared_reports' });
    }
  }

  cleanupExpiredShares() {
    try {
      if (!global.shareCache) return;

      const now = new Date();
      for (const [token, data] of global.shareCache.entries()) {
        const expiresAt = new Date(data.shareSettings?.expiresAt || 0);
        if (expiresAt < now) {
          global.shareCache.delete(token);
        }
      }
    } catch (error) {
      logger.warn('Failed to cleanup expired shares', { error: error.message });
    }
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