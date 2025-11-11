const { v4: uuidv4 } = require('uuid');

/**
 * Service for storing screenshot batch analyses and session final analyses
 */
class AnalysisStorageService {
    constructor() {
        // In-memory storage for now (would be PostgreSQL in production)
        this.batchAnalyses = new Map(); // sessionId -> analyses[]
        this.finalAnalyses = new Map(); // sessionId -> finalAnalysis
        this.analysisMetrics = new Map(); // sessionId -> metrics
    }

    /**
     * Store a batch analysis (every 30 screenshots)
     */
    async storeBatchAnalysis(batchData) {
        try {
            const analysisId = uuidv4();
            const timestamp = new Date().toISOString();

            const storedAnalysis = {
                id: analysisId,
                session_id: batchData.session_id,
                batch_number: batchData.batch_number,
                analysis_type: batchData.analysis_type || 'batch',
                status: 'completed',

                // Screenshot data
                screenshot_ids: batchData.screenshot_ids,
                screenshot_count: batchData.screenshot_count,

                // Time range
                time_range_start: batchData.time_range_start,
                time_range_end: batchData.time_range_end,
                duration_seconds: batchData.duration_seconds,

                // AI processing metadata
                ai_provider: batchData.ai_provider,
                ai_model: batchData.ai_model,
                processing_time_ms: batchData.processing_time_ms,
                tokens_used: batchData.tokens_used,
                cost_usd: batchData.cost_usd,

                // Full analysis results
                analysis_results: batchData.analysis_results,

                // Extracted metrics
                work_completed: batchData.work_completed,
                blockers_count: batchData.blockers_count,
                accomplishments_count: batchData.accomplishments_count,
                productivity_score: batchData.productivity_score,
                focus_score: batchData.focus_score,
                alignment_score: batchData.alignment_score,

                // Trigger breakdown
                trigger_breakdown: batchData.trigger_breakdown,

                created_at: timestamp,
                updated_at: timestamp
            };

            // Store in session-based map
            if (!this.batchAnalyses.has(batchData.session_id)) {
                this.batchAnalyses.set(batchData.session_id, []);
            }
            this.batchAnalyses.get(batchData.session_id).push(storedAnalysis);

            // Update session metrics
            this.updateSessionMetrics(batchData.session_id, storedAnalysis);

            console.log(`[AnalysisStorageService] Stored batch analysis ${analysisId} for session ${batchData.session_id}`);
            console.log(`[AnalysisStorageService] Batch #${batchData.batch_number}: ${batchData.work_completed.length} tasks, ${batchData.blockers_count} blockers, score ${batchData.productivity_score}`);

            return {
                success: true,
                data: {
                    analysis_id: analysisId,
                    batch_number: batchData.batch_number,
                    session_id: batchData.session_id
                }
            };
        } catch (error) {
            console.error('[AnalysisStorageService] Failed to store batch analysis:', error);
            return {
                success: false,
                error: {
                    code: 'STORAGE_ERROR',
                    message: 'Failed to store batch analysis',
                    details: error.message
                }
            };
        }
    }

    /**
     * Store final session analysis (combined report)
     */
    async storeFinalAnalysis(finalData) {
        try {
            const analysisId = uuidv4();
            const timestamp = new Date().toISOString();

            const storedFinalAnalysis = {
                id: analysisId,
                session_id: finalData.session_id,

                // Source data
                batch_analysis_ids: finalData.batch_analysis_ids || [],
                total_batches: finalData.total_batches,
                total_screenshots: finalData.total_screenshots,

                // Combined analysis
                combined_analysis: finalData.combined_analysis,

                // Session-level insights
                productivity_trend: finalData.productivity_trend,
                workflow_patterns: finalData.workflow_patterns,
                session_story: finalData.session_story,

                // Processing metadata
                processing_time_ms: finalData.processing_time_ms,
                ai_combination_successful: finalData.ai_combination_successful,

                created_at: timestamp
            };

            this.finalAnalyses.set(finalData.session_id, storedFinalAnalysis);

            console.log(`[AnalysisStorageService] Stored final analysis ${analysisId} for session ${finalData.session_id}`);
            console.log(`[AnalysisStorageService] Combined ${finalData.total_batches} batches, ${finalData.total_screenshots} screenshots`);
            console.log(`[AnalysisStorageService] Session story: ${finalData.session_story?.substring(0, 100)}...`);

            return {
                success: true,
                data: {
                    analysis_id: analysisId,
                    session_id: finalData.session_id,
                    total_batches: finalData.total_batches
                }
            };
        } catch (error) {
            console.error('[AnalysisStorageService] Failed to store final analysis:', error);
            return {
                success: false,
                error: {
                    code: 'STORAGE_ERROR',
                    message: 'Failed to store final analysis',
                    details: error.message
                }
            };
        }
    }

    /**
     * Get batch analyses for a session
     */
    async getBatchAnalyses(sessionId, options = {}) {
        try {
            const analyses = this.batchAnalyses.get(sessionId) || [];

            // Apply pagination
            const { limit = 50, offset = 0 } = options;
            const paginatedAnalyses = analyses.slice(offset, offset + limit);

            // Apply filtering if requested
            let filteredAnalyses = paginatedAnalyses;
            if (options.include_results === false) {
                filteredAnalyses = paginatedAnalyses.map(analysis => {
                    const { analysis_results, ...metadata } = analysis;
                    return metadata;
                });
            }

            return {
                success: true,
                data: {
                    analyses: filteredAnalyses,
                    total: analyses.length,
                    session_id: sessionId
                }
            };
        } catch (error) {
            console.error('[AnalysisStorageService] Failed to get batch analyses:', error);
            return {
                success: false,
                error: {
                    code: 'RETRIEVAL_ERROR',
                    message: 'Failed to retrieve batch analyses'
                }
            };
        }
    }

    /**
     * Get final analysis for a session
     */
    async getFinalAnalysis(sessionId) {
        try {
            const finalAnalysis = this.finalAnalyses.get(sessionId);

            if (!finalAnalysis) {
                return {
                    success: false,
                    error: {
                        code: 'NOT_FOUND',
                        message: 'Final analysis not found for session'
                    }
                };
            }

            return {
                success: true,
                data: finalAnalysis
            };
        } catch (error) {
            console.error('[AnalysisStorageService] Failed to get final analysis:', error);
            return {
                success: false,
                error: {
                    code: 'RETRIEVAL_ERROR',
                    message: 'Failed to retrieve final analysis'
                }
            };
        }
    }

    /**
     * Get analysis metrics for a session
     */
    async getSessionAnalysisMetrics(sessionId) {
        try {
            const metrics = this.analysisMetrics.get(sessionId);

            if (!metrics) {
                return {
                    success: true,
                    data: {
                        session_id: sessionId,
                        total_analyses: 0,
                        total_screenshots_analyzed: 0,
                        average_productivity_score: 0,
                        average_focus_score: 0,
                        average_alignment_score: 0,
                        total_work_completed: 0,
                        total_blockers: 0,
                        total_accomplishments: 0,
                        analysis_frequency_minutes: 0
                    }
                };
            }

            return {
                success: true,
                data: metrics
            };
        } catch (error) {
            console.error('[AnalysisStorageService] Failed to get session metrics:', error);
            return {
                success: false,
                error: {
                    code: 'RETRIEVAL_ERROR',
                    message: 'Failed to retrieve session metrics'
                }
            };
        }
    }

    /**
     * Update session-level metrics when new batch analysis is added
     */
    updateSessionMetrics(sessionId, newAnalysis) {
        try {
            const existingMetrics = this.analysisMetrics.get(sessionId) || {
                session_id: sessionId,
                total_analyses: 0,
                total_screenshots_analyzed: 0,
                total_productivity_score: 0,
                total_focus_score: 0,
                total_alignment_score: 0,
                total_work_completed: 0,
                total_blockers: 0,
                total_accomplishments: 0,
                first_analysis_at: null,
                last_analysis_at: null
            };

            // Update counters
            existingMetrics.total_analyses += 1;
            existingMetrics.total_screenshots_analyzed += newAnalysis.screenshot_count;
            existingMetrics.total_productivity_score += newAnalysis.productivity_score;
            existingMetrics.total_focus_score += newAnalysis.focus_score;
            existingMetrics.total_alignment_score += newAnalysis.alignment_score;
            existingMetrics.total_work_completed += newAnalysis.work_completed.length;
            existingMetrics.total_blockers += newAnalysis.blockers_count;
            existingMetrics.total_accomplishments += newAnalysis.accomplishments_count;

            // Update timestamps
            if (!existingMetrics.first_analysis_at) {
                existingMetrics.first_analysis_at = newAnalysis.created_at;
            }
            existingMetrics.last_analysis_at = newAnalysis.created_at;

            // Calculate averages
            existingMetrics.average_productivity_score = existingMetrics.total_productivity_score / existingMetrics.total_analyses;
            existingMetrics.average_focus_score = existingMetrics.total_focus_score / existingMetrics.total_analyses;
            existingMetrics.average_alignment_score = existingMetrics.total_alignment_score / existingMetrics.total_analyses;

            // Calculate analysis frequency
            if (existingMetrics.total_analyses > 1) {
                const timeDiff = new Date(existingMetrics.last_analysis_at) - new Date(existingMetrics.first_analysis_at);
                existingMetrics.analysis_frequency_minutes = Math.round(timeDiff / (1000 * 60) / (existingMetrics.total_analyses - 1));
            }

            this.analysisMetrics.set(sessionId, existingMetrics);

            console.log(`[AnalysisStorageService] Updated metrics for session ${sessionId}: ${existingMetrics.total_analyses} analyses, avg productivity ${existingMetrics.average_productivity_score.toFixed(1)}`);
        } catch (error) {
            console.error('[AnalysisStorageService] Failed to update session metrics:', error);
        }
    }

    /**
     * Get all stored sessions with analysis data
     */
    async getSessionsWithAnalyses() {
        try {
            const sessions = [];

            for (const [sessionId, analyses] of this.batchAnalyses.entries()) {
                const finalAnalysis = this.finalAnalyses.get(sessionId);
                const metrics = this.analysisMetrics.get(sessionId);

                sessions.push({
                    session_id: sessionId,
                    batch_analyses_count: analyses.length,
                    has_final_analysis: !!finalAnalysis,
                    total_screenshots: metrics?.total_screenshots_analyzed || 0,
                    average_productivity: metrics?.average_productivity_score || 0,
                    last_analysis_at: metrics?.last_analysis_at
                });
            }

            return {
                success: true,
                data: {
                    sessions: sessions.sort((a, b) =>
                        new Date(b.last_analysis_at) - new Date(a.last_analysis_at)
                    ),
                    total: sessions.length
                }
            };
        } catch (error) {
            console.error('[AnalysisStorageService] Failed to get sessions with analyses:', error);
            return {
                success: false,
                error: {
                    code: 'RETRIEVAL_ERROR',
                    message: 'Failed to retrieve sessions with analyses'
                }
            };
        }
    }

    /**
     * Get storage statistics
     */
    getStorageStats() {
        const totalBatchAnalyses = Array.from(this.batchAnalyses.values()).reduce((sum, analyses) => sum + analyses.length, 0);
        const totalFinalAnalyses = this.finalAnalyses.size;
        const totalSessions = new Set([...this.batchAnalyses.keys(), ...this.finalAnalyses.keys()]).size;

        return {
            total_sessions: totalSessions,
            total_batch_analyses: totalBatchAnalyses,
            total_final_analyses: totalFinalAnalyses,
            average_analyses_per_session: totalSessions > 0 ? Math.round(totalBatchAnalyses / totalSessions * 10) / 10 : 0,
            storage_type: 'in_memory'
        };
    }
}

module.exports = AnalysisStorageService;