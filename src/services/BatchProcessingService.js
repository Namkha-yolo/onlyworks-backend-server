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

      // Get recent unprocessed screenshots for the session
      const screenshots = await this.screenshotRepo.getRecentScreenshots(sessionId, batchSize);

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

      // Try to store batch report, with fallback if table doesn't exist
      let batchReport = null;
      let batchReportId = null;

      try {
        // Create batch report using your existing database schema
        const screenshotIds = screenshots.map(s => s.id);
        const batchNumber = Math.floor(Date.now() / 1000); // Simple batch numbering

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
          efficiency_score: analysisResult?.efficiency_score || 0,
          inefficiency_score: analysisResult?.inefficiency_score || 0,
          tasks_identified: analysisResult?.tasks_identified || [],
          tasks_completed: analysisResult?.tasks_completed || [],
          applications_used: analysisResult?.applications_used || [],
          activities: analysisResult?.activities || {},
          processed_at: new Date().toISOString()
        });
        batchReportId = batchReport.id;
      } catch (error) {
        logger.warn('Batch report table not available, using fallback storage', { error: error.message });

        // Fallback: Store analysis in session metadata using WorkSessionRepository
        batchReportId = `fallback_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        try {
          const sessionMetadata = {
            last_batch_analysis: {
              id: batchReportId,
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

      // Try to mark screenshots as processed (this may also fail gracefully)
      try {
        const screenshotIds = screenshots.map(s => s.id);
        await this.screenshotRepo.markAsProcessed(screenshotIds, batchReportId);
      } catch (error) {
        logger.warn('Could not mark screenshots as processed (missing columns), continuing', { error: error.message });
      }

      logger.info('Batch processing completed successfully', {
        userId,
        sessionId,
        batchReportId,
        screenshotCount: screenshots.length
      });

      return {
        batchReportId,
        screenshotCount: screenshots.length,
        analysisType,
        summary: analysisResult.summary || 'Analysis completed',
        createdAt: batchReport?.created_at || new Date().toISOString()
      };

    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Batch processing failed', { error: error.message, userId, sessionId });
      throw new ApiError('BATCH_PROCESSING_FAILED', { operation: 'trigger_batch_processing' });
    }
  }

  async performGeminiAnalysis(screenshots, analysisType) {
    try {
      const prompt = this.buildAnalysisPrompt(screenshots, analysisType);

      const result = await this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.8,
          maxOutputTokens: 2048,
        }
      });

      const response = await result.response;
      const analysisText = response.text();

      // Parse the AI response into structured data
      return this.parseGeminiResponse(analysisText, screenshots.length);

    } catch (error) {
      logger.error('Gemini analysis failed', { error: error.message });
      return this.generateFallbackAnalysis(screenshots);
    }
  }

  buildAnalysisPrompt(screenshots, analysisType) {
    const screenshotInfo = screenshots.map((screenshot, index) => ({
      index: index + 1,
      timestamp: new Date(screenshot.created_at).toISOString(),
      captureTriger: screenshot.capture_trigger || 'unknown',
      windowTitle: screenshot.window_title || 'Unknown',
      activeApp: screenshot.active_app || 'Unknown'
    }));

    let basePrompt = `
Analyze this batch of ${screenshots.length} screenshots from a work session.

Screenshot Information:
${screenshotInfo.map(info =>
  `${info.index}. Time: ${info.timestamp}, Trigger: ${info.captureTriger}, App: ${info.activeApp}, Window: ${info.windowTitle}`
).join('\\n')}

Based on the screenshot metadata, provide analysis in the following JSON format:
{
  "summary": "Brief overview of the work session activity",
  "productivityMetrics": {
    "focusScore": 0.0-1.0,
    "distractionEvents": number,
    "taskSwitching": number
  },
  "activityBreakdown": {
    "primaryApplications": ["app1", "app2"],
    "workPatterns": "description of work patterns",
    "peakProductivityPeriods": ["time ranges"]
  },
  "insights": [
    "Key insight 1",
    "Key insight 2",
    "Key insight 3"
  ],
  "recommendations": [
    "Actionable recommendation 1",
    "Actionable recommendation 2"
  ]
}`;

    if (analysisType === 'detailed') {
      basePrompt += `

For detailed analysis, also include:
- Detailed workflow analysis
- Deep focus periods identification
- Collaboration vs individual work patterns
- Tool usage efficiency assessment`;
    }

    return basePrompt;
  }

  parseGeminiResponse(responseText, screenshotCount) {
    try {
      // Extract JSON from response
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

    // Fallback parsing
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
    const timerScreenshots = triggers.timer_5s || 0;
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
        workPatterns: `${clickScreenshots} click-triggered and ${timerScreenshots} timer-triggered captures`,
        peakProductivityPeriods: ['Analysis requires AI processing']
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

  async getBatchStatus(userId, sessionId) {
    try {
      const recentReports = await this.batchReportRepo.getRecentReports(sessionId, 5);
      const unprocessedCount = await this.screenshotRepo.getUnprocessedCount(sessionId);

      return {
        sessionId,
        lastProcessedAt: recentReports.length > 0 ? recentReports[0].created_at : null,
        totalReports: recentReports.length,
        unprocessedScreenshots: unprocessedCount,
        readyForBatch: unprocessedCount >= 30,
        aiEnabled: !!this.model
      };
    } catch (error) {
      logger.error('Failed to get batch status', { error: error.message, userId, sessionId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_batch_status' });
    }
  }

  async getBatchReports(userId, sessionId, options = {}) {
    try {
      const { limit = 10, offset = 0 } = options;

      let reports = [];
      try {
        reports = await this.batchReportRepo.getSessionReports(sessionId, {
          limit,
          offset,
          orderBy: 'created_at',
          direction: 'DESC'
        });
      } catch (error) {
        logger.warn('Failed to get batch reports from database, returning empty list', {
          error: error.message,
          sessionId,
          userId
        });
        // Return empty array if table doesn't exist or other DB error
        reports = [];
      }

      return {
        reports: reports.map(report => ({
          id: report.id,
          screenshotCount: report.screenshot_count,
          analysisType: report.analysis_type,
          summary: report.analysis_result?.summary || 'No summary available',
          createdAt: report.created_at,
          insights: report.analysis_result?.insights || [],
          productivityScore: report.analysis_result?.productivityMetrics?.focusScore || null
        })),
        pagination: {
          limit,
          offset,
          hasMore: reports.length === limit
        }
      };
    } catch (error) {
      logger.error('Failed to get batch reports', { error: error.message, userId, sessionId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_batch_reports' });
    }
  }

  // Generate comprehensive session summary from all batch reports
  async generateSessionSummary(userId, sessionId) {
    try {
      logger.info('Generating session summary', { userId, sessionId });

      // Try to get batch reports, with fallback if table doesn't exist
      let batchReports = [];
      let usingFallbackData = false;

      try {
        batchReports = await this.batchReportRepo.getSessionReports(sessionId, {
          limit: 100,
          orderBy: 'created_at',
          direction: 'ASC'
        });
      } catch (error) {
        logger.warn('Batch reports table not available, using fallback approach', { error: error.message });
        usingFallbackData = true;

        // Fallback: Check session metadata for stored analysis
        try {
          const session = await this.workSessionRepo.getSessionById(sessionId, userId);
          if (session?.metadata?.last_batch_analysis) {
            // Convert stored analysis to batch report format
            batchReports = [{
              id: session.metadata.last_batch_analysis.id,
              session_id: sessionId,
              user_id: userId,
              screenshot_count: session.metadata.last_batch_analysis.screenshot_count,
              analysis_type: session.metadata.last_batch_analysis.analysis_type,
              analysis_result: session.metadata.last_batch_analysis.analysis_result,
              created_at: session.metadata.last_batch_analysis.created_at
            }];
            logger.info('Using fallback analysis data from session metadata');
          }
        } catch (fallbackError) {
          logger.warn('Could not retrieve fallback analysis data');
        }
      }

      // If still no reports, generate from available screenshot data
      if (batchReports.length === 0) {
        logger.info('No batch reports found, generating summary from screenshots');

        try {
          // Get all screenshots for the session
          const screenshots = await this.screenshotRepo.findBySession(sessionId, userId);

          if (screenshots.length === 0) {
            throw new ApiError('NO_DATA', { message: 'No data available for session summary' });
          }

          // Generate a fallback analysis from screenshots
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

          logger.info(`Generated fallback summary from ${screenshots.length} screenshots`);
        } catch (screenshotError) {
          throw new ApiError('NO_DATA', { message: 'No screenshots or analysis data found for session' });
        }
      }

      // Get session details
      const session = await this.workSessionRepo.getSessionById(sessionId, userId);
      if (!session) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'work_session' });
      }

      // Aggregate data from all batch reports
      const aggregatedData = this.aggregateBatchReports(batchReports);

      // Generate AI summary if available
      let aiSummary = null;
      if (this.model && batchReports.length > 0) {
        aiSummary = await this.generateAISessionSummary(session, batchReports, aggregatedData);
      }

      // Calculate session-wide metrics
      const sessionMetrics = this.calculateSessionMetrics(session, batchReports, aggregatedData);

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
        overview: aiSummary?.overview || aggregatedData.overview,
        metrics: sessionMetrics,
        batchAnalysis: {
          totalBatches: batchReports.length,
          totalScreenshots: aggregatedData.totalScreenshots,
          averageProductivity: aggregatedData.averageProductivity,
          focusPercentage: aggregatedData.focusPercentage
        },
        insights: aiSummary?.insights || aggregatedData.insights,
        recommendations: aiSummary?.recommendations || aggregatedData.recommendations,
        patterns: {
          mostProductivePeriods: this.identifyProductivePeriods(batchReports),
          applicationUsage: aggregatedData.applicationBreakdown,
          activityPatterns: aggregatedData.activityPatterns
        },
        generatedAt: new Date().toISOString(),
        aiGenerated: !!aiSummary
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
      .filter((insight, index, arr) => arr.indexOf(insight) === index); // Remove duplicates

    const allRecommendations = batchReports
      .flatMap(r => r.analysis_result?.recommendations || [])
      .filter((rec, index, arr) => arr.indexOf(rec) === index);

    const applicationBreakdown = batchReports.reduce((apps, report) => {
      const primaryApps = report.analysis_result?.activityBreakdown?.primaryApplications || [];
      primaryApps.forEach(app => {
        apps[app] = (apps[app] || 0) + 1;
      });
      return apps;
    }, {});

    return {
      totalScreenshots,
      averageProductivity,
      focusPercentage: Math.round(averageProductivity * 100),
      insights: allInsights.slice(0, 10), // Top 10 insights
      recommendations: allRecommendations.slice(0, 8), // Top 8 recommendations
      applicationBreakdown,
      overview: `Session analyzed across ${batchReports.length} batches with ${totalScreenshots} total screenshots`,
      activityPatterns: this.analyzeActivityPatterns(batchReports)
    };
  }

  async generateAISessionSummary(session, batchReports, aggregatedData) {
    try {
      const prompt = this.buildSessionSummaryPrompt(session, batchReports, aggregatedData);

      const result = await this.model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          topK: 40,
          topP: 0.8,
          maxOutputTokens: 1500,
        }
      });

      const response = await result.response;
      const analysisText = response.text();

      return this.parseSessionSummaryResponse(analysisText);

    } catch (error) {
      logger.error('AI session summary failed', { error: error.message });
      return null;
    }
  }

  buildSessionSummaryPrompt(session, batchReports, aggregatedData) {
    const batchSummaries = batchReports.map((report, index) => ({
      batch: index + 1,
      screenshots: report.screenshot_count,
      productivity: report.analysis_result?.productivityMetrics?.focusScore || 'N/A',
      summary: report.analysis_result?.summary || 'No summary'
    }));

    return `
Generate a comprehensive work session summary based on the following data:

SESSION DETAILS:
- Name: ${session.session_name}
- Goal: ${session.goal_description}
- Duration: ${Math.round((session.duration_seconds || 0) / 3600 * 100) / 100} hours
- Started: ${session.started_at}

AGGREGATE DATA:
- Total Batches: ${batchReports.length}
- Total Screenshots: ${aggregatedData.totalScreenshots}
- Average Productivity: ${Math.round(aggregatedData.averageProductivity * 100)}%
- Top Applications: ${Object.entries(aggregatedData.applicationBreakdown).slice(0, 3).map(([app, count]) => `${app} (${count})`).join(', ')}

BATCH SUMMARIES:
${batchSummaries.map(b => `Batch ${b.batch}: ${b.screenshots} screenshots, ${b.productivity !== 'N/A' ? Math.round(b.productivity * 100) + '%' : 'N/A'} productivity - ${b.summary}`).join('\\n')}

Provide analysis in this JSON format:
{
  "overview": "Comprehensive 2-3 sentence overview of the entire work session",
  "insights": [
    "Key insight about work patterns",
    "Insight about productivity trends",
    "Insight about focus and distraction patterns"
  ],
  "recommendations": [
    "Actionable recommendation for improvement",
    "Suggestion for better productivity"
  ]
}`;
  }

  parseSessionSummaryResponse(responseText) {
    try {
      const jsonMatch = responseText.match(/\\{[\\s\\S]*\\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      logger.warn('Failed to parse AI session summary JSON');
    }

    // Fallback parsing
    const lines = responseText.split('\\n').filter(line => line.trim());
    return {
      overview: lines[0] || 'Session analysis completed',
      insights: lines.slice(1, 4),
      recommendations: lines.slice(-2)
    };
  }

  calculateSessionMetrics(session, batchReports, aggregatedData) {
    const sessionDurationHours = (session.duration_seconds || 0) / 3600;
    const screenshotsPerHour = sessionDurationHours > 0 ? aggregatedData.totalScreenshots / sessionDurationHours : 0;

    return {
      productivity: {
        overallScore: aggregatedData.averageProductivity,
        trend: this.calculateProductivityTrend(batchReports),
        peakProductivity: this.findPeakProductivity(batchReports)
      },
      activity: {
        totalScreenshots: aggregatedData.totalScreenshots,
        screenshotsPerHour: Math.round(screenshotsPerHour * 100) / 100,
        uniqueApplications: Object.keys(aggregatedData.applicationBreakdown).length,
        mostUsedApp: this.findMostUsedApp(aggregatedData.applicationBreakdown)
      },
      focus: {
        focusScore: aggregatedData.averageProductivity,
        distractionEvents: this.calculateDistractionEvents(batchReports),
        deepWorkPeriods: this.identifyDeepWorkPeriods(batchReports)
      }
    };
  }

  analyzeActivityPatterns(batchReports) {
    const patterns = {
      workIntensity: 'moderate',
      taskSwitching: 'low',
      consistencyScore: 0.7
    };

    // Analyze work intensity based on screenshot frequency
    const avgScreenshotsPerBatch = batchReports.reduce((sum, r) => sum + r.screenshot_count, 0) / batchReports.length;
    if (avgScreenshotsPerBatch > 35) patterns.workIntensity = 'high';
    else if (avgScreenshotsPerBatch < 25) patterns.workIntensity = 'low';

    return patterns;
  }

  identifyProductivePeriods(batchReports) {
    return batchReports
      .filter(report => (report.analysis_result?.productivityMetrics?.focusScore || 0) > 0.7)
      .map(report => ({
        time: new Date(report.created_at).toLocaleTimeString(),
        productivity: Math.round((report.analysis_result?.productivityMetrics?.focusScore || 0) * 100),
        screenshots: report.screenshot_count
      }));
  }

  calculateProductivityTrend(batchReports) {
    if (batchReports.length < 2) return 'stable';

    const firstHalf = batchReports.slice(0, Math.floor(batchReports.length / 2));
    const secondHalf = batchReports.slice(Math.floor(batchReports.length / 2));

    const firstAvg = this.getAverageProductivity(firstHalf);
    const secondAvg = this.getAverageProductivity(secondHalf);

    if (secondAvg > firstAvg + 0.1) return 'improving';
    if (secondAvg < firstAvg - 0.1) return 'declining';
    return 'stable';
  }

  getAverageProductivity(reports) {
    const scores = reports
      .map(r => r.analysis_result?.productivityMetrics?.focusScore)
      .filter(score => score !== null && score !== undefined);

    return scores.length > 0 ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0;
  }

  findPeakProductivity(batchReports) {
    const productivities = batchReports.map(r => r.analysis_result?.productivityMetrics?.focusScore || 0);
    return Math.max(...productivities);
  }

  findMostUsedApp(appBreakdown) {
    const entries = Object.entries(appBreakdown);
    if (entries.length === 0) return 'Unknown';

    return entries.reduce((max, current) =>
      current[1] > max[1] ? current : max
    )[0];
  }

  calculateDistractionEvents(batchReports) {
    return batchReports.reduce((sum, report) =>
      sum + (report.analysis_result?.productivityMetrics?.distractionEvents || 0), 0
    );
  }

  identifyDeepWorkPeriods(batchReports) {
    return batchReports.filter(report =>
      (report.analysis_result?.productivityMetrics?.focusScore || 0) > 0.8
    ).length;
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

  // Generate shareable session summary
  async generateShareableSessionSummary(userId, sessionId, options = {}) {
    try {
      const { includePrivateData = false, shareWithTeam = false } = options;

      logger.info('Generating shareable session summary', { userId, sessionId, includePrivateData, shareWithTeam });

      const summary = await this.generateSessionSummary(userId, sessionId);

      // Create a cleaned version for sharing
      const shareableSummary = {
        sessionName: summary.sessionName,
        goalDescription: summary.goalDescription,
        duration: summary.duration,
        overview: summary.overview,
        metrics: {
          productivity: {
            overallScore: summary.metrics.productivity.overallScore,
            trend: summary.metrics.productivity.trend
          },
          activity: {
            totalScreenshots: summary.metrics.activity.totalScreenshots,
            screenshotsPerHour: summary.metrics.activity.screenshotsPerHour,
            uniqueApplications: summary.metrics.activity.uniqueApplications,
            mostUsedApp: includePrivateData ? summary.metrics.activity.mostUsedApp : 'Hidden'
          },
          focus: {
            focusScore: summary.metrics.focus.focusScore,
            deepWorkPeriods: summary.metrics.focus.deepWorkPeriods
          }
        },
        insights: summary.insights,
        recommendations: summary.recommendations,
        patterns: {
          activityPatterns: summary.patterns.activityPatterns,
          applicationUsage: includePrivateData ? summary.patterns.applicationUsage : {}
        },
        generatedAt: summary.generatedAt,
        aiGenerated: summary.aiGenerated,
        shareSettings: {
          includePrivateData,
          shareWithTeam,
          sharedBy: userId,
          sharedAt: new Date().toISOString()
        }
      };

      // Generate share token
      const shareToken = this.generateShareToken(sessionId, userId, options);

      // Store shareable summary with token
      await this.batchReportRepo.createShareableReport({
        session_id: sessionId,
        user_id: userId,
        share_token: shareToken,
        summary_data: shareableSummary,
        expires_at: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString(), // 7 days
        include_private_data: includePrivateData,
        share_with_team: shareWithTeam
      });

      return {
        shareToken,
        summary: shareableSummary,
        shareUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/shared-report/${shareToken}`,
        expiresAt: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString()
      };

    } catch (error) {
      logger.error('Failed to generate shareable session summary', { error: error.message, userId, sessionId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'generate_shareable_summary' });
    }
  }

  // Get shared report by token
  async getSharedReport(shareToken) {
    try {
      const sharedReport = await this.batchReportRepo.getByShareToken(shareToken);

      if (!sharedReport) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'shared_report' });
      }

      // Check if expired
      if (new Date(sharedReport.expires_at) < new Date()) {
        throw new ApiError('SHARE_EXPIRED', { message: 'This shared report has expired' });
      }

      return {
        summary: sharedReport.summary_data,
        sharedBy: sharedReport.user_id,
        sharedAt: sharedReport.created_at,
        expiresAt: sharedReport.expires_at,
        includePrivateData: sharedReport.include_private_data,
        shareWithTeam: sharedReport.share_with_team
      };

    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Failed to get shared report', { error: error.message, shareToken });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_shared_report' });
    }
  }

  // Generate unique share token
  generateShareToken(sessionId, userId, options) {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 15);
    const hash = require('crypto')
      .createHash('sha256')
      .update(`${sessionId}-${userId}-${timestamp}-${random}`)
      .digest('hex')
      .substring(0, 16);

    return `share_${hash}`;
  }

  // Revoke shared report
  async revokeSharedReport(userId, shareToken) {
    try {
      const deleted = await this.batchReportRepo.deleteSharedReport(shareToken, userId);

      if (!deleted) {
        throw new ApiError('RESOURCE_NOT_FOUND', { resource: 'shared_report' });
      }

      logger.info('Shared report revoked', { userId, shareToken });
      return { success: true, message: 'Shared report revoked successfully' };

    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.error('Failed to revoke shared report', { error: error.message, userId, shareToken });
      throw new ApiError('INTERNAL_ERROR', { operation: 'revoke_shared_report' });
    }
  }

  // Get user's shared reports
  async getUserSharedReports(userId, options = {}) {
    try {
      const { limit = 20, offset = 0 } = options;

      const reports = await this.batchReportRepo.getUserSharedReports(userId, {
        limit,
        offset
      });

      return {
        reports: reports.map(report => ({
          shareToken: report.share_token,
          sessionName: report.summary_data?.sessionName || 'Unknown Session',
          sharedAt: report.created_at,
          expiresAt: report.expires_at,
          includePrivateData: report.include_private_data,
          shareWithTeam: report.share_with_team,
          shareUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/shared-report/${report.share_token}`
        })),
        pagination: {
          limit,
          offset,
          hasMore: reports.length === limit
        }
      };

    } catch (error) {
      logger.error('Failed to get user shared reports', { error: error.message, userId });
      throw new ApiError('INTERNAL_ERROR', { operation: 'get_user_shared_reports' });
    }
  }
}

module.exports = BatchProcessingService;