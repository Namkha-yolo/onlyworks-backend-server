const { GoogleGenerativeAI } = require('@google/generative-ai');
const { ApiError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

class AIAnalysisService {
  constructor() {
    // Initialize Gemini AI
    this.genAI = process.env.GOOGLE_AI_API_KEY
      ? new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY)
      : null;

    this.model = this.genAI ? this.genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) : null;
  }

  async analyzeScreenshot(screenshotPath, metadata = {}) {
    const startTime = Date.now();

    try {
      if (!this.model) {
        throw new ApiError('AI_SERVICE_ERROR', {
          message: 'AI analysis service not configured - missing API key'
        });
      }

      logger.info('Starting AI analysis of screenshot', {
        screenshot_path: screenshotPath,
        metadata
      });

      // For now, we'll return mock analysis since we don't have actual image processing
      // In a real implementation, you'd:
      // 1. Read the image file
      // 2. Convert to base64 or appropriate format
      // 3. Send to AI service for analysis

      const mockAnalysis = this.generateMockAnalysis(metadata);

      const duration = Date.now() - startTime;

      logger.ai('screenshot_analysis', this.model.model, duration, 0, {
        screenshot_path: screenshotPath,
        activity_detected: mockAnalysis.activity_detected,
        productivity_score: mockAnalysis.productivity_score
      });

      return mockAnalysis;

    } catch (error) {
      const duration = Date.now() - startTime;

      logger.error('AI analysis failed', {
        error: error.message,
        screenshot_path: screenshotPath,
        duration_ms: duration
      });

      if (error instanceof ApiError) throw error;

      throw new ApiError('AI_SERVICE_ERROR', {
        message: 'Screenshot analysis failed',
        details: { original_error: error.message }
      });
    }
  }

  generateMockAnalysis(metadata = {}) {
    // Generate realistic mock data for development
    const activities = [
      'coding', 'writing', 'research', 'communication', 'design',
      'meeting', 'documentation', 'testing', 'debugging', 'planning'
    ];

    const apps = [
      'Visual Studio Code', 'Chrome', 'Slack', 'Figma', 'Terminal',
      'Notion', 'Zoom', 'Postman', 'GitHub', 'Discord'
    ];

    const productivityLevel = Math.random();
    let activityType, productivityScore;

    if (productivityLevel > 0.7) {
      // High productivity activities
      activityType = activities.slice(0, 5)[Math.floor(Math.random() * 5)];
      productivityScore = 70 + Math.random() * 30;
    } else if (productivityLevel > 0.4) {
      // Medium productivity activities
      activityType = activities.slice(3, 8)[Math.floor(Math.random() * 5)];
      productivityScore = 40 + Math.random() * 40;
    } else {
      // Low productivity activities
      activityType = ['browsing', 'social_media', 'entertainment'][Math.floor(Math.random() * 3)];
      productivityScore = Math.random() * 40;
    }

    const detectedApps = [];
    const numApps = Math.floor(Math.random() * 3) + 1;

    for (let i = 0; i < numApps; i++) {
      const app = apps[Math.floor(Math.random() * apps.length)];
      if (!detectedApps.find(a => a.name === app)) {
        detectedApps.push({
          name: app,
          confidence: 0.8 + Math.random() * 0.2
        });
      }
    }

    return {
      activity_detected: activityType,
      productivity_score: Math.round(productivityScore * 100) / 100,
      confidence_score: 85 + Math.random() * 15,
      detected_apps: detectedApps,
      detected_tasks: [
        {
          description: `Working on ${activityType} task`,
          confidence: 0.75 + Math.random() * 0.25
        }
      ],
      is_blocked: productivityScore < 30 && Math.random() > 0.5,
      blocker_type: productivityScore < 30 ? ['distraction', 'social_media', 'entertainment'][Math.floor(Math.random() * 3)] : null,
      model_version: 'gemini-1.5-flash-mock',
      processing_time_ms: 150 + Math.random() * 300
    };
  }

  async analyzeProductivityTrends(analysisData) {
    try {
      if (!Array.isArray(analysisData) || analysisData.length === 0) {
        return {
          overall_trend: 'stable',
          average_productivity: 50,
          peak_hours: [],
          common_distractions: [],
          recommendations: []
        };
      }

      const productivityScores = analysisData.map(a => a.productivity_score).filter(s => s !== null);
      const averageProductivity = productivityScores.reduce((sum, score) => sum + score, 0) / productivityScores.length;

      // Group by hour to find peak productivity times
      const hourlyProductivity = {};
      analysisData.forEach(analysis => {
        if (analysis.created_at) {
          const hour = new Date(analysis.created_at).getHours();
          if (!hourlyProductivity[hour]) {
            hourlyProductivity[hour] = { total: 0, count: 0 };
          }
          hourlyProductivity[hour].total += analysis.productivity_score || 0;
          hourlyProductivity[hour].count += 1;
        }
      });

      const peakHours = Object.entries(hourlyProductivity)
        .map(([hour, data]) => ({
          hour: parseInt(hour),
          average: data.total / data.count
        }))
        .sort((a, b) => b.average - a.average)
        .slice(0, 3)
        .map(h => h.hour);

      // Find common blockers
      const blockers = analysisData
        .filter(a => a.is_blocked && a.blocker_type)
        .reduce((acc, a) => {
          acc[a.blocker_type] = (acc[a.blocker_type] || 0) + 1;
          return acc;
        }, {});

      const commonDistractions = Object.entries(blockers)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
        .map(([type]) => type);

      // Generate trend
      let trend = 'stable';
      if (productivityScores.length >= 10) {
        const firstHalf = productivityScores.slice(0, Math.floor(productivityScores.length / 2));
        const secondHalf = productivityScores.slice(Math.floor(productivityScores.length / 2));

        const firstAvg = firstHalf.reduce((sum, score) => sum + score, 0) / firstHalf.length;
        const secondAvg = secondHalf.reduce((sum, score) => sum + score, 0) / secondHalf.length;

        if (secondAvg > firstAvg + 10) trend = 'improving';
        else if (secondAvg < firstAvg - 10) trend = 'declining';
      }

      const recommendations = this.generateRecommendations(averageProductivity, peakHours, commonDistractions);

      return {
        overall_trend: trend,
        average_productivity: Math.round(averageProductivity * 100) / 100,
        peak_hours: peakHours,
        common_distractions: commonDistractions,
        recommendations
      };

    } catch (error) {
      logger.error('Productivity trend analysis failed', { error: error.message });
      throw new ApiError('AI_SERVICE_ERROR', {
        message: 'Failed to analyze productivity trends'
      });
    }
  }

  generateRecommendations(avgProductivity, peakHours, distractions) {
    const recommendations = [];

    if (avgProductivity < 60) {
      recommendations.push({
        type: 'productivity_improvement',
        message: 'Consider implementing time-blocking techniques to improve focus',
        priority: 'high'
      });
    }

    if (peakHours.length > 0) {
      recommendations.push({
        type: 'schedule_optimization',
        message: `Schedule important tasks during your peak hours: ${peakHours.map(h => `${h}:00`).join(', ')}`,
        priority: 'medium'
      });
    }

    if (distractions.includes('social_media')) {
      recommendations.push({
        type: 'distraction_management',
        message: 'Consider using website blockers during work hours to limit social media access',
        priority: 'high'
      });
    }

    if (distractions.includes('entertainment')) {
      recommendations.push({
        type: 'focus_improvement',
        message: 'Try the Pomodoro Technique to maintain better focus during work sessions',
        priority: 'medium'
      });
    }

    return recommendations;
  }

  async healthCheck() {
    return {
      ai_service_available: !!this.model,
      model_name: this.model ? 'gemini-1.5-flash' : null,
      api_key_configured: !!process.env.GOOGLE_AI_API_KEY
    };
  }
}

module.exports = AIAnalysisService;