const { ApiError } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');
const ScreenshotAnalysisRepository = require('../repositories/ScreenshotAnalysisRepository');
const AIAnalysisService = require('./AIAnalysisService');

/**
 * AI Analysis Validation and Quality Metrics Service
 * Provides real-time validation, quality scoring, and continuous improvement for AI analysis
 */
class AIAnalysisValidationService {
  constructor() {
    this.analysisRepository = new ScreenshotAnalysisRepository();
    this.aiService = new AIAnalysisService();

    // Quality thresholds
    this.qualityThresholds = {
      confidence_minimum: 0.6,
      productivity_score_variance: 15, // Max variance from historical average
      temporal_consistency: 0.7, // Consistency over time
      cross_validation_agreement: 0.75, // Agreement between different analysis methods
      user_feedback_threshold: 0.8 // User satisfaction threshold
    };

    // Real-time validation metrics
    this.validationMetrics = {
      total_validations: 0,
      passed_validations: 0,
      failed_validations: 0,
      average_quality_score: 0.0,
      confidence_distribution: {
        low: 0,    // < 0.6
        medium: 0, // 0.6 - 0.8
        high: 0    // > 0.8
      },
      quality_trends: [],
      error_patterns: new Map(),
      user_feedback_scores: []
    };

    // Validation rules engine
    this.validationRules = [
      {
        name: 'confidence_threshold',
        description: 'Analysis confidence must meet minimum threshold',
        validator: this.validateConfidenceThreshold.bind(this),
        weight: 0.25,
        critical: true
      },
      {
        name: 'temporal_consistency',
        description: 'Analysis should be consistent with recent similar contexts',
        validator: this.validateTemporalConsistency.bind(this),
        weight: 0.20,
        critical: false
      },
      {
        name: 'productivity_reasonableness',
        description: 'Productivity scores should be reasonable for the context',
        validator: this.validateProductivityReasonableness.bind(this),
        weight: 0.20,
        critical: false
      },
      {
        name: 'metadata_alignment',
        description: 'Analysis should align with available metadata',
        validator: this.validateMetadataAlignment.bind(this),
        weight: 0.15,
        critical: false
      },
      {
        name: 'anomaly_detection',
        description: 'Analysis should not be a statistical outlier',
        validator: this.validateAnomalyDetection.bind(this),
        weight: 0.20,
        critical: false
      }
    ];

    // User feedback integration
    this.userFeedback = {
      corrections: new Map(), // analysis_id -> correction_data
      preferences: new Map(),  // user_id -> preference_data
      satisfaction_scores: new Map() // analysis_id -> satisfaction_score
    };
  }

  /**
   * Comprehensive real-time validation of AI analysis results
   */
  async validateAnalysis(analysisResult, context = {}) {
    const validationId = `validation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    try {
      logger.info('Starting comprehensive AI analysis validation', {
        validationId,
        analysisType: analysisResult.analysis_type || 'unknown',
        hasContext: Object.keys(context).length > 0
      });

      const validation = {
        validation_id: validationId,
        analysis_result: analysisResult,
        context,
        started_at: new Date().toISOString(),
        rules_applied: [],
        overall_quality_score: 0.0,
        validation_status: 'pending',
        recommendations: [],
        warnings: [],
        errors: []
      };

      // Apply all validation rules
      for (const rule of this.validationRules) {
        const ruleStartTime = Date.now();

        try {
          const ruleResult = await rule.validator(analysisResult, context);
          const ruleProcessingTime = Date.now() - ruleStartTime;

          validation.rules_applied.push({
            rule_name: rule.name,
            description: rule.description,
            weight: rule.weight,
            critical: rule.critical,
            passed: ruleResult.passed,
            score: ruleResult.score,
            confidence: ruleResult.confidence || 1.0,
            details: ruleResult.details,
            processing_time_ms: ruleProcessingTime,
            warnings: ruleResult.warnings || [],
            recommendations: ruleResult.recommendations || []
          });

          // Collect warnings and recommendations
          if (ruleResult.warnings) {
            validation.warnings.push(...ruleResult.warnings.map(w => ({ rule: rule.name, ...w })));
          }

          if (ruleResult.recommendations) {
            validation.recommendations.push(...ruleResult.recommendations.map(r => ({ rule: rule.name, ...r })));
          }

          // Check for critical failures
          if (rule.critical && !ruleResult.passed) {
            validation.errors.push({
              rule: rule.name,
              type: 'critical_failure',
              message: ruleResult.details || 'Critical validation rule failed'
            });
          }

        } catch (ruleError) {
          logger.error('Validation rule execution failed', {
            validationId,
            ruleName: rule.name,
            error: ruleError.message
          });

          validation.errors.push({
            rule: rule.name,
            type: 'rule_execution_error',
            message: ruleError.message
          });
        }
      }

      // Calculate overall quality score
      validation.overall_quality_score = this.calculateOverallQualityScore(validation.rules_applied);

      // Determine validation status
      const hasErrors = validation.errors.length > 0;
      const meetsQualityThreshold = validation.overall_quality_score >= 0.7;

      if (hasErrors) {
        validation.validation_status = 'failed';
      } else if (meetsQualityThreshold) {
        validation.validation_status = 'passed';
      } else {
        validation.validation_status = 'warning';
      }

      // Generate improvement suggestions
      validation.improvement_suggestions = this.generateImprovementSuggestions(validation);

      // Update metrics
      this.updateValidationMetrics(validation);

      const processingTime = Date.now() - startTime;
      validation.completed_at = new Date().toISOString();
      validation.total_processing_time_ms = processingTime;

      logger.info('AI analysis validation completed', {
        validationId,
        status: validation.validation_status,
        qualityScore: validation.overall_quality_score,
        rulesApplied: validation.rules_applied.length,
        warnings: validation.warnings.length,
        processingTimeMs: processingTime
      });

      return {
        success: true,
        data: validation
      };

    } catch (error) {
      logger.error('AI analysis validation failed', {
        validationId,
        error: error.message,
        processingTimeMs: Date.now() - startTime
      });

      return {
        success: false,
        error: {
          code: 'VALIDATION_FAILED',
          message: 'AI analysis validation failed',
          details: error.message,
          validation_id: validationId
        }
      };
    }
  }

  /**
   * Validation rule: Check confidence threshold
   */
  async validateConfidenceThreshold(analysisResult, context) {
    const confidence = analysisResult.confidence_score || 0;
    const threshold = this.qualityThresholds.confidence_minimum;

    const passed = confidence >= threshold;
    const score = Math.min(1.0, confidence / threshold);

    return {
      passed,
      score,
      confidence: 1.0,
      details: `Confidence: ${confidence.toFixed(3)}, Threshold: ${threshold}`,
      warnings: !passed ? [{
        type: 'low_confidence',
        message: `Analysis confidence (${confidence.toFixed(3)}) below threshold (${threshold})`
      }] : [],
      recommendations: !passed ? [{
        type: 'confidence_improvement',
        message: 'Consider additional context or multiple analysis methods to improve confidence'
      }] : []
    };
  }

  /**
   * Validation rule: Check temporal consistency
   */
  async validateTemporalConsistency(analysisResult, context) {
    try {
      // Get recent analyses for the same user/context
      const recentAnalyses = await this.getRecentSimilarAnalyses(context, 10);

      if (recentAnalyses.length < 3) {
        return {
          passed: true,
          score: 0.8, // Neutral score for insufficient data
          confidence: 0.5,
          details: 'Insufficient historical data for temporal consistency check'
        };
      }

      // Compare current analysis with recent similar contexts
      const consistencyScore = this.calculateTemporalConsistency(analysisResult, recentAnalyses);
      const threshold = this.qualityThresholds.temporal_consistency;

      const passed = consistencyScore >= threshold;

      return {
        passed,
        score: consistencyScore,
        confidence: 0.8,
        details: `Temporal consistency: ${consistencyScore.toFixed(3)}, compared with ${recentAnalyses.length} recent analyses`,
        warnings: !passed ? [{
          type: 'temporal_inconsistency',
          message: 'Analysis shows significant deviation from recent similar contexts'
        }] : []
      };

    } catch (error) {
      return {
        passed: true, // Don't fail on data retrieval issues
        score: 0.5,
        confidence: 0.0,
        details: `Temporal consistency check failed: ${error.message}`
      };
    }
  }

  /**
   * Validation rule: Check productivity score reasonableness
   */
  async validateProductivityReasonableness(analysisResult, context) {
    const productivityScore = analysisResult.productivity_score || 0;

    // Context-based reasonableness checks
    const checks = [];

    // Time-based reasonableness
    if (context.timestamp) {
      const hour = new Date(context.timestamp).getHours();
      const isNightTime = hour < 6 || hour > 22;
      const isBusinessHours = hour >= 9 && hour <= 17;

      if (isNightTime && productivityScore > 80) {
        checks.push({
          type: 'time_mismatch',
          severity: 'warning',
          message: 'High productivity score during night hours may be unrealistic'
        });
      }

      if (isBusinessHours && productivityScore < 20) {
        checks.push({
          type: 'low_business_hours',
          severity: 'warning',
          message: 'Very low productivity during business hours'
        });
      }
    }

    // App-based reasonableness
    if (context.active_app) {
      const app = context.active_app.toLowerCase();

      if (app.includes('game') || app.includes('entertainment') || app.includes('social')) {
        if (productivityScore > 60) {
          checks.push({
            type: 'app_score_mismatch',
            severity: 'warning',
            message: 'High productivity score for entertainment/social app'
          });
        }
      }

      if (app.includes('code') || app.includes('development') || app.includes('ide')) {
        if (productivityScore < 40) {
          checks.push({
            type: 'low_dev_productivity',
            severity: 'info',
            message: 'Low productivity score for development app'
          });
        }
      }
    }

    // Range validation
    const isInValidRange = productivityScore >= 0 && productivityScore <= 100;
    if (!isInValidRange) {
      checks.push({
        type: 'invalid_range',
        severity: 'error',
        message: 'Productivity score outside valid range (0-100)'
      });
    }

    // Calculate overall reasonableness score
    const errorCount = checks.filter(c => c.severity === 'error').length;
    const warningCount = checks.filter(c => c.severity === 'warning').length;

    const passed = errorCount === 0;
    const score = Math.max(0, 1.0 - (errorCount * 0.5) - (warningCount * 0.2));

    return {
      passed,
      score,
      confidence: 0.9,
      details: `Productivity score: ${productivityScore}, checks: ${checks.length}`,
      warnings: checks.filter(c => c.severity !== 'error').map(c => ({
        type: c.type,
        message: c.message
      })),
      recommendations: checks.length > 0 ? [{
        type: 'context_review',
        message: 'Review context alignment for productivity scoring'
      }] : []
    };
  }

  /**
   * Validation rule: Check metadata alignment
   */
  async validateMetadataAlignment(analysisResult, context) {
    const alignmentChecks = [];
    let alignmentScore = 1.0;

    // Window title alignment
    if (context.window_title && analysisResult.activity_detected) {
      const titleLower = context.window_title.toLowerCase();
      const activity = analysisResult.activity_detected.toLowerCase();

      const activityKeywords = {
        'coding': ['code', 'editor', 'ide', '.js', '.py', '.java', 'vim'],
        'writing': ['document', 'word', 'write', 'text', 'note'],
        'research': ['browser', 'google', 'search', 'wiki', 'documentation'],
        'communication': ['slack', 'teams', 'email', 'zoom', 'meet'],
        'design': ['figma', 'sketch', 'photoshop', 'canva', 'design']
      };

      const expectedKeywords = activityKeywords[activity] || [];
      const hasKeywordMatch = expectedKeywords.some(keyword => titleLower.includes(keyword));

      if (!hasKeywordMatch && expectedKeywords.length > 0) {
        alignmentChecks.push({
          type: 'window_title_mismatch',
          message: `Activity "${activity}" not clearly indicated in window title`
        });
        alignmentScore *= 0.8;
      }
    }

    // App name alignment
    if (context.active_app && analysisResult.detected_apps) {
      const contextApp = context.active_app.toLowerCase();
      const detectedApps = analysisResult.detected_apps.map(app => app.name.toLowerCase());

      const hasAppMatch = detectedApps.some(app =>
        app.includes(contextApp) || contextApp.includes(app.split(' ')[0])
      );

      if (!hasAppMatch) {
        alignmentChecks.push({
          type: 'app_detection_mismatch',
          message: 'Active app not found in detected apps list'
        });
        alignmentScore *= 0.7;
      }
    }

    const passed = alignmentChecks.length === 0;

    return {
      passed,
      score: alignmentScore,
      confidence: 0.85,
      details: `Metadata alignment checks: ${alignmentChecks.length} mismatches`,
      warnings: alignmentChecks,
      recommendations: !passed ? [{
        type: 'metadata_improvement',
        message: 'Improve context awareness in AI analysis'
      }] : []
    };
  }

  /**
   * Validation rule: Anomaly detection
   */
  async validateAnomalyDetection(analysisResult, context) {
    try {
      // Get user's analysis history
      const userHistory = await this.getUserAnalysisHistory(context.user_id, 50);

      if (userHistory.length < 10) {
        return {
          passed: true,
          score: 0.8,
          confidence: 0.3,
          details: 'Insufficient data for anomaly detection'
        };
      }

      // Statistical anomaly detection
      const productivityScores = userHistory.map(h => h.productivity_score).filter(s => s != null);
      const mean = productivityScores.reduce((a, b) => a + b, 0) / productivityScores.length;
      const stdDev = Math.sqrt(productivityScores.reduce((sq, n) => sq + Math.pow(n - mean, 2), 0) / productivityScores.length);

      const currentScore = analysisResult.productivity_score || 0;
      const zScore = Math.abs((currentScore - mean) / stdDev);

      // Consider z-score > 2.5 as potential anomaly
      const isAnomaly = zScore > 2.5;
      const anomalyScore = Math.max(0, 1.0 - (zScore - 2.0) * 0.2);

      return {
        passed: !isAnomaly,
        score: isAnomaly ? anomalyScore : 1.0,
        confidence: 0.7,
        details: `Z-score: ${zScore.toFixed(2)}, Mean: ${mean.toFixed(1)}, StdDev: ${stdDev.toFixed(1)}`,
        warnings: isAnomaly ? [{
          type: 'statistical_anomaly',
          message: `Analysis result significantly deviates from user's typical patterns (z-score: ${zScore.toFixed(2)})`
        }] : [],
        recommendations: isAnomaly ? [{
          type: 'anomaly_review',
          message: 'Review analysis for potential errors or unusual circumstances'
        }] : []
      };

    } catch (error) {
      return {
        passed: true,
        score: 0.5,
        confidence: 0.0,
        details: `Anomaly detection failed: ${error.message}`
      };
    }
  }

  /**
   * Calculate overall quality score from rule results
   */
  calculateOverallQualityScore(ruleResults) {
    let totalWeight = 0;
    let weightedScore = 0;

    for (const result of ruleResults) {
      totalWeight += result.weight;
      weightedScore += result.score * result.weight * result.confidence;
    }

    return totalWeight > 0 ? weightedScore / totalWeight : 0;
  }

  /**
   * Generate improvement suggestions based on validation results
   */
  generateImprovementSuggestions(validation) {
    const suggestions = [];

    // Low quality score
    if (validation.overall_quality_score < 0.6) {
      suggestions.push({
        type: 'quality_improvement',
        priority: 'high',
        message: 'Consider enhancing AI model or adding more context for better analysis quality'
      });
    }

    // Multiple warnings
    if (validation.warnings.length > 2) {
      suggestions.push({
        type: 'validation_review',
        priority: 'medium',
        message: 'Review validation warnings to improve analysis accuracy'
      });
    }

    // Failed critical rules
    const criticalFailures = validation.rules_applied.filter(r => r.critical && !r.passed);
    if (criticalFailures.length > 0) {
      suggestions.push({
        type: 'critical_fix',
        priority: 'high',
        message: 'Address critical validation failures before using analysis results'
      });
    }

    return suggestions;
  }

  /**
   * Update validation metrics
   */
  updateValidationMetrics(validation) {
    this.validationMetrics.total_validations++;

    if (validation.validation_status === 'passed') {
      this.validationMetrics.passed_validations++;
    } else {
      this.validationMetrics.failed_validations++;
    }

    // Update average quality score
    this.validationMetrics.average_quality_score =
      (this.validationMetrics.average_quality_score * (this.validationMetrics.total_validations - 1) +
       validation.overall_quality_score) / this.validationMetrics.total_validations;

    // Update confidence distribution
    const analysisConfidence = validation.analysis_result.confidence_score || 0;
    if (analysisConfidence < 0.6) {
      this.validationMetrics.confidence_distribution.low++;
    } else if (analysisConfidence <= 0.8) {
      this.validationMetrics.confidence_distribution.medium++;
    } else {
      this.validationMetrics.confidence_distribution.high++;
    }

    // Track quality trends (keep last 100)
    this.validationMetrics.quality_trends.push({
      timestamp: new Date().toISOString(),
      quality_score: validation.overall_quality_score,
      validation_status: validation.validation_status
    });

    if (this.validationMetrics.quality_trends.length > 100) {
      this.validationMetrics.quality_trends.shift();
    }
  }

  /**
   * Process user feedback on analysis results
   */
  async processUserFeedback(analysisId, feedbackData) {
    try {
      const {
        satisfaction_score,
        corrections,
        preferences,
        comments
      } = feedbackData;

      // Store feedback
      if (satisfaction_score !== undefined) {
        this.userFeedback.satisfaction_scores.set(analysisId, satisfaction_score);
        this.validationMetrics.user_feedback_scores.push(satisfaction_score);
      }

      if (corrections) {
        this.userFeedback.corrections.set(analysisId, {
          ...corrections,
          timestamp: new Date().toISOString()
        });
      }

      // Update user preferences
      if (preferences && feedbackData.user_id) {
        const existingPrefs = this.userFeedback.preferences.get(feedbackData.user_id) || {};
        this.userFeedback.preferences.set(feedbackData.user_id, {
          ...existingPrefs,
          ...preferences,
          updated_at: new Date().toISOString()
        });
      }

      logger.info('User feedback processed', {
        analysisId,
        hasSatisfactionScore: satisfaction_score !== undefined,
        hasCorrections: !!corrections,
        hasPreferences: !!preferences
      });

      return {
        success: true,
        data: {
          feedback_processed: true,
          analysis_id: analysisId
        }
      };

    } catch (error) {
      logger.error('User feedback processing failed', {
        analysisId,
        error: error.message
      });

      return {
        success: false,
        error: {
          code: 'FEEDBACK_PROCESSING_FAILED',
          message: 'Failed to process user feedback'
        }
      };
    }
  }

  // Helper methods for data retrieval
  async getRecentSimilarAnalyses(context, limit = 10) {
    // Mock implementation - would query database for similar contexts
    return [];
  }

  async getUserAnalysisHistory(userId, limit = 50) {
    // Mock implementation - would query user's analysis history
    return [];
  }

  calculateTemporalConsistency(currentAnalysis, recentAnalyses) {
    // Mock implementation - would calculate consistency score
    return 0.8;
  }

  // Public API methods
  async getValidationMetrics() {
    return {
      success: true,
      data: this.validationMetrics
    };
  }

  async getQualityTrends(timeRange = '24h') {
    const trends = this.validationMetrics.quality_trends;
    const now = new Date();
    const cutoff = new Date(now.getTime() - this.parseTimeRange(timeRange));

    const filteredTrends = trends.filter(trend =>
      new Date(trend.timestamp) >= cutoff
    );

    return {
      success: true,
      data: {
        trends: filteredTrends,
        time_range: timeRange,
        total_points: filteredTrends.length
      }
    };
  }

  async getUserFeedbackSummary(userId) {
    const userPreferences = this.userFeedback.preferences.get(userId);
    const userCorrections = Array.from(this.userFeedback.corrections.entries())
      .filter(([_, correction]) => correction.user_id === userId);

    return {
      success: true,
      data: {
        preferences: userPreferences,
        total_corrections: userCorrections.length,
        average_satisfaction: this.calculateAverageSatisfaction(userId)
      }
    };
  }

  parseTimeRange(timeRange) {
    const units = { h: 3600000, d: 86400000, w: 604800000 };
    const match = timeRange.match(/^(\d+)([hdw])$/);
    return match ? parseInt(match[1]) * units[match[2]] : 86400000; // Default 24h
  }

  calculateAverageSatisfaction(userId) {
    // Mock calculation
    return 4.2;
  }
}

module.exports = AIAnalysisValidationService;