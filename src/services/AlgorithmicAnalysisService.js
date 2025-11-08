const { logger } = require('../utils/logger');

class AlgorithmicAnalysisService {
  constructor() {
    this.name = 'AlgorithmicAnalysisService';
  }

  calculateProductivityScore(sessionData, activityEvents = []) {
    try {
      if (!sessionData.duration_seconds || sessionData.duration_seconds <= 0) {
        return { score: 0, factors: ['invalid_duration'] };
      }

      const factors = [];
      let score = 50; // Start with neutral base score

      // Activity density scoring
      const totalActivities = activityEvents.reduce((sum, event) =>
        sum + (event.keystroke_count || 0) + (event.click_count || 0), 0
      );

      const activityRate = totalActivities / (sessionData.duration_seconds / 60); // per minute

      if (activityRate > 0) {
        // Optimal activity rate is around 10-50 events per minute
        if (activityRate >= 10 && activityRate <= 50) {
          score += 20;
          factors.push('optimal_activity_rate');
        } else if (activityRate > 50) {
          score += 10; // High activity but might indicate stress
          factors.push('high_activity_rate');
        } else if (activityRate >= 5) {
          score += 10;
          factors.push('moderate_activity_rate');
        } else {
          score -= 10;
          factors.push('low_activity_rate');
        }
      } else {
        score -= 20;
        factors.push('no_activity_detected');
      }

      // Session duration scoring
      const durationMinutes = sessionData.duration_seconds / 60;
      if (durationMinutes >= 25 && durationMinutes <= 90) {
        score += 15; // Sweet spot for focused work
        factors.push('optimal_duration');
      } else if (durationMinutes >= 15) {
        score += 10;
        factors.push('good_duration');
      } else if (durationMinutes < 10) {
        score -= 10;
        factors.push('short_session');
      }

      // App switching penalty
      const appSwitches = activityEvents.filter(e => e.event_type === 'app_switch').length;
      const switchRate = appSwitches / (durationMinutes || 1);

      if (switchRate > 5) {
        score -= 15;
        factors.push('excessive_app_switching');
      } else if (switchRate > 2) {
        score -= 5;
        factors.push('moderate_app_switching');
      } else if (switchRate <= 1) {
        score += 10;
        factors.push('focused_app_usage');
      }

      // Idle time analysis
      const idleEvents = activityEvents.filter(e => e.event_type === 'idle_start');
      const totalIdleTime = idleEvents.reduce((sum, event) => sum + (event.idle_duration_seconds || 0), 0);
      const idlePercentage = (totalIdleTime / sessionData.duration_seconds) * 100;

      if (idlePercentage < 10) {
        score += 10;
        factors.push('minimal_idle_time');
      } else if (idlePercentage > 30) {
        score -= 15;
        factors.push('excessive_idle_time');
      } else if (idlePercentage > 15) {
        score -= 5;
        factors.push('moderate_idle_time');
      }

      // Normalize score to 0-100 range
      score = Math.max(0, Math.min(100, score));

      return {
        score: Math.round(score * 100) / 100,
        factors,
        algorithm_version: '1.0',
        calculated_at: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Error calculating algorithmic productivity score', {
        error: error.message,
        sessionData
      });
      return { score: 50, factors: ['calculation_error'], error: error.message };
    }
  }

  calculateFocusScore(sessionData, activityEvents = []) {
    try {
      if (!sessionData.duration_seconds || sessionData.duration_seconds <= 0) {
        return { score: 0, factors: ['invalid_duration'] };
      }

      const factors = [];
      let score = 50; // Start with neutral base score
      const durationMinutes = sessionData.duration_seconds / 60;

      // Consistent activity pattern scoring
      const activityWindows = this.analyzeActivityConsistency(activityEvents, sessionData.duration_seconds);

      if (activityWindows.consistency > 0.8) {
        score += 20;
        factors.push('highly_consistent_activity');
      } else if (activityWindows.consistency > 0.6) {
        score += 15;
        factors.push('consistent_activity');
      } else if (activityWindows.consistency > 0.4) {
        score += 5;
        factors.push('moderate_consistency');
      } else {
        score -= 10;
        factors.push('inconsistent_activity');
      }

      // Deep work periods (sustained activity without breaks)
      const deepWorkPeriods = this.findDeepWorkPeriods(activityEvents);
      const longestDeepWork = Math.max(...deepWorkPeriods.map(p => p.duration), 0);

      if (longestDeepWork > 20) { // 20+ minutes of sustained focus
        score += 20;
        factors.push('extended_deep_work');
      } else if (longestDeepWork > 10) {
        score += 15;
        factors.push('sustained_focus');
      } else if (longestDeepWork > 5) {
        score += 10;
        factors.push('moderate_focus');
      } else {
        score -= 5;
        factors.push('fragmented_focus');
      }

      // Context switching penalty
      const contextSwitches = this.calculateContextSwitches(activityEvents);
      const switchRate = contextSwitches / (durationMinutes || 1);

      if (switchRate < 1) {
        score += 15;
        factors.push('minimal_context_switching');
      } else if (switchRate < 3) {
        score += 5;
        factors.push('moderate_context_switching');
      } else if (switchRate > 5) {
        score -= 15;
        factors.push('excessive_context_switching');
      }

      // Multitasking detection
      const multitaskingScore = this.detectMultitasking(activityEvents);
      if (multitaskingScore.isMultitasking) {
        score -= 10;
        factors.push('multitasking_detected');
      } else {
        score += 10;
        factors.push('single_task_focus');
      }

      // Normalize score to 0-100 range
      score = Math.max(0, Math.min(100, score));

      return {
        score: Math.round(score * 100) / 100,
        factors,
        deep_work_periods: deepWorkPeriods.length,
        longest_focus_period: longestDeepWork,
        algorithm_version: '1.0',
        calculated_at: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Error calculating algorithmic focus score', {
        error: error.message,
        sessionData
      });
      return { score: 50, factors: ['calculation_error'], error: error.message };
    }
  }

  analyzeActivityConsistency(activityEvents, totalDurationSeconds) {
    const windowSize = 300; // 5-minute windows
    const numWindows = Math.ceil(totalDurationSeconds / windowSize);
    const windowActivities = new Array(numWindows).fill(0);

    // Distribute activities across time windows
    activityEvents.forEach(event => {
      if (event.timestamp) {
        const eventTime = new Date(event.timestamp).getTime();
        const windowIndex = Math.floor(eventTime / (windowSize * 1000)) % numWindows;
        if (windowIndex >= 0 && windowIndex < numWindows) {
          windowActivities[windowIndex] += (event.keystroke_count || 0) + (event.click_count || 0);
        }
      }
    });

    // Calculate consistency (standard deviation normalized)
    const mean = windowActivities.reduce((sum, val) => sum + val, 0) / numWindows;
    const variance = windowActivities.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / numWindows;
    const stdDev = Math.sqrt(variance);

    // Consistency score (lower std dev = higher consistency)
    const consistency = mean > 0 ? Math.max(0, 1 - (stdDev / mean)) : 0;

    return { consistency, windowActivities, mean, stdDev };
  }

  findDeepWorkPeriods(activityEvents) {
    const periods = [];
    let currentPeriod = null;
    const minActivityThreshold = 2; // Minimum activities per minute for "deep work"

    // Sort events by timestamp
    const sortedEvents = activityEvents
      .filter(e => e.timestamp)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Group events into 1-minute windows
    const minuteWindows = {};
    sortedEvents.forEach(event => {
      const minute = Math.floor(new Date(event.timestamp).getTime() / 60000);
      if (!minuteWindows[minute]) {
        minuteWindows[minute] = 0;
      }
      minuteWindows[minute] += (event.keystroke_count || 0) + (event.click_count || 0);
    });

    // Find continuous periods of high activity
    const minutes = Object.keys(minuteWindows).sort((a, b) => a - b);

    for (const minute of minutes) {
      const activity = minuteWindows[minute];

      if (activity >= minActivityThreshold) {
        if (!currentPeriod) {
          currentPeriod = { start: parseInt(minute), duration: 1 };
        } else if (parseInt(minute) === currentPeriod.start + currentPeriod.duration) {
          currentPeriod.duration++;
        } else {
          if (currentPeriod.duration >= 5) { // At least 5 minutes
            periods.push(currentPeriod);
          }
          currentPeriod = { start: parseInt(minute), duration: 1 };
        }
      } else {
        if (currentPeriod && currentPeriod.duration >= 5) {
          periods.push(currentPeriod);
        }
        currentPeriod = null;
      }
    }

    // Don't forget the last period
    if (currentPeriod && currentPeriod.duration >= 5) {
      periods.push(currentPeriod);
    }

    return periods;
  }

  calculateContextSwitches(activityEvents) {
    let switches = 0;
    let lastApp = null;

    const appEvents = activityEvents
      .filter(e => e.application_name && e.event_type === 'app_switch')
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    for (const event of appEvents) {
      if (lastApp && lastApp !== event.application_name) {
        switches++;
      }
      lastApp = event.application_name;
    }

    return switches;
  }

  detectMultitasking(activityEvents) {
    // Look for rapid switching between different applications
    const appSwitchEvents = activityEvents
      .filter(e => e.event_type === 'app_switch' && e.application_name)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    let rapidSwitches = 0;
    const switchThreshold = 30000; // 30 seconds

    for (let i = 1; i < appSwitchEvents.length; i++) {
      const timeDiff = new Date(appSwitchEvents[i].timestamp) - new Date(appSwitchEvents[i-1].timestamp);
      if (timeDiff < switchThreshold) {
        rapidSwitches++;
      }
    }

    return {
      isMultitasking: rapidSwitches > 5, // More than 5 rapid switches indicates multitasking
      rapidSwitches,
      apps: [...new Set(appSwitchEvents.map(e => e.application_name))]
    };
  }

  generateSessionSummary(sessionData, activityEvents = []) {
    try {
      const productivityAnalysis = this.calculateProductivityScore(sessionData, activityEvents);
      const focusAnalysis = this.calculateFocusScore(sessionData, activityEvents);

      const durationMinutes = Math.round(sessionData.duration_seconds / 60);
      const totalActivities = activityEvents.reduce((sum, event) =>
        sum + (event.keystroke_count || 0) + (event.click_count || 0), 0
      );

      // App usage analysis
      const appUsage = this.analyzeAppUsage(activityEvents);

      // Generate insights based on scores
      const insights = this.generateInsights(productivityAnalysis, focusAnalysis, sessionData, activityEvents);

      return {
        session_id: sessionData.id,
        duration_minutes: durationMinutes,
        productivity_score: productivityAnalysis.score,
        focus_score: focusAnalysis.score,
        total_activities: totalActivities,
        app_usage: appUsage,
        insights,
        key_metrics: {
          activity_rate: totalActivities / (durationMinutes || 1),
          deep_work_periods: focusAnalysis.deep_work_periods || 0,
          longest_focus_period: focusAnalysis.longest_focus_period || 0,
          context_switches: this.calculateContextSwitches(activityEvents)
        },
        algorithm_version: '1.0',
        generated_at: new Date().toISOString()
      };

    } catch (error) {
      logger.error('Error generating algorithmic session summary', {
        error: error.message,
        sessionData
      });
      return null;
    }
  }

  analyzeAppUsage(activityEvents) {
    const appStats = {};

    activityEvents.forEach(event => {
      if (event.application_name) {
        if (!appStats[event.application_name]) {
          appStats[event.application_name] = {
            name: event.application_name,
            total_activities: 0,
            keystrokes: 0,
            clicks: 0,
            duration_estimate: 0
          };
        }

        appStats[event.application_name].total_activities +=
          (event.keystroke_count || 0) + (event.click_count || 0);
        appStats[event.application_name].keystrokes += event.keystroke_count || 0;
        appStats[event.application_name].clicks += event.click_count || 0;
      }
    });

    return Object.values(appStats)
      .sort((a, b) => b.total_activities - a.total_activities)
      .slice(0, 10); // Top 10 apps
  }

  generateInsights(productivityAnalysis, focusAnalysis, sessionData, activityEvents) {
    const insights = [];
    const durationMinutes = sessionData.duration_seconds / 60;

    // Productivity insights
    if (productivityAnalysis.score >= 80) {
      insights.push({
        type: 'productivity',
        level: 'positive',
        message: 'Excellent productivity session with high activity levels',
        category: 'achievement'
      });
    } else if (productivityAnalysis.score < 40) {
      insights.push({
        type: 'productivity',
        level: 'improvement',
        message: 'Consider taking a break or changing your approach to boost productivity',
        category: 'suggestion'
      });
    }

    // Focus insights
    if (focusAnalysis.score >= 80) {
      insights.push({
        type: 'focus',
        level: 'positive',
        message: 'Great focus maintained throughout the session',
        category: 'achievement'
      });
    } else if (focusAnalysis.factors?.includes('excessive_context_switching')) {
      insights.push({
        type: 'focus',
        level: 'improvement',
        message: 'Try to minimize application switching to improve focus',
        category: 'suggestion'
      });
    }

    // Duration insights
    if (durationMinutes >= 25 && durationMinutes <= 90) {
      insights.push({
        type: 'timing',
        level: 'positive',
        message: 'Optimal session duration for sustained productivity',
        category: 'timing'
      });
    } else if (durationMinutes < 15) {
      insights.push({
        type: 'timing',
        level: 'neutral',
        message: 'Consider longer sessions for deeper work',
        category: 'timing'
      });
    }

    // Activity pattern insights
    const activityRate = activityEvents.reduce((sum, e) =>
      sum + (e.keystroke_count || 0) + (e.click_count || 0), 0
    ) / (durationMinutes || 1);

    if (activityRate < 5) {
      insights.push({
        type: 'activity',
        level: 'improvement',
        message: 'Low activity detected - ensure you\'re actively working',
        category: 'behavior'
      });
    }

    return insights;
  }

  healthCheck() {
    return {
      algorithmic_analysis_available: true,
      version: '1.0',
      capabilities: [
        'productivity_scoring',
        'focus_scoring',
        'session_summaries',
        'app_usage_analysis',
        'activity_patterns',
        'insights_generation'
      ]
    };
  }
}

module.exports = AlgorithmicAnalysisService;