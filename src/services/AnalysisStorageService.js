const { v4: uuidv4 } = require('uuid');
const AnalysisReportRepository = require('../repositories/AnalysisReportRepository');

/**
 * Service for storing screenshot batch analyses and session final analyses
 */
class AnalysisStorageService {
    constructor() {
        this.analysisReportRepository = new AnalysisReportRepository();
    }

    /**
     * Store a batch analysis (every 30 screenshots)
     */
    async storeBatchAnalysis(batchData) {
        try {
            // Prepare analysis data for database storage
            const analysisData = {
                analysis_type: batchData.analysis_type || 'batch',
                analysis_data: {
                    batch_number: batchData.batch_number,
                    screenshot_ids: batchData.screenshot_ids,
                    time_range_start: batchData.time_range_start,
                    time_range_end: batchData.time_range_end,
                    duration_seconds: batchData.duration_seconds,
                    ai_provider: batchData.ai_provider,
                    ai_model: batchData.ai_model,
                    processing_time_ms: batchData.processing_time_ms,
                    tokens_used: batchData.tokens_used,
                    cost_usd: batchData.cost_usd,
                    analysis_results: batchData.analysis_results,
                    blockers_count: batchData.blockers_count,
                    accomplishments_count: batchData.accomplishments_count,
                    productivity_score: batchData.productivity_score,
                    focus_score: batchData.focus_score,
                    trigger_breakdown: batchData.trigger_breakdown
                },
                work_completed: batchData.work_completed || [],
                alignment_score: batchData.alignment_score || 0,
                productivity_insights: `Batch analysis #${batchData.batch_number}: ${batchData.work_completed?.length || 0} tasks completed`,
                focus_analysis: `Focus score: ${batchData.focus_score || 0}`,
                screenshot_count: batchData.screenshot_count || 0
            };

            // Store in database using repository
            const storedAnalysis = await this.analysisReportRepository.createAnalysisReport(
                batchData.user_id,
                batchData.session_id,
                analysisData
            );

            console.log(`[AnalysisStorageService] Stored batch analysis ${storedAnalysis.id} for session ${batchData.session_id}`);
            console.log(`[AnalysisStorageService] Batch #${batchData.batch_number}: ${batchData.work_completed?.length || 0} tasks, ${batchData.blockers_count || 0} blockers, score ${batchData.productivity_score || 0}`);

            return {
                success: true,
                data: {
                    analysis_id: storedAnalysis.id,
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
            // Prepare final analysis data for database storage
            const analysisData = {
                analysis_type: 'final',
                analysis_data: {
                    batch_analysis_ids: finalData.batch_analysis_ids || [],
                    total_batches: finalData.total_batches,
                    total_screenshots: finalData.total_screenshots,
                    combined_analysis: finalData.combined_analysis,
                    productivity_trend: finalData.productivity_trend,
                    workflow_patterns: finalData.workflow_patterns,
                    processing_time_ms: finalData.processing_time_ms,
                    ai_combination_successful: finalData.ai_combination_successful
                },
                work_completed: finalData.work_completed || [],
                alignment_score: finalData.alignment_score || 0,
                productivity_insights: finalData.session_story || `Final analysis for session with ${finalData.total_batches} batches`,
                focus_analysis: finalData.productivity_trend || 'Session productivity trend analyzed',
                screenshot_count: finalData.total_screenshots || 0
            };

            // Store in database using repository
            const storedAnalysis = await this.analysisReportRepository.createAnalysisReport(
                finalData.user_id,
                finalData.session_id,
                analysisData
            );

            console.log(`[AnalysisStorageService] Stored final analysis ${storedAnalysis.id} for session ${finalData.session_id}`);
            console.log(`[AnalysisStorageService] Combined ${finalData.total_batches} batches, ${finalData.total_screenshots} screenshots`);
            console.log(`[AnalysisStorageService] Session story: ${finalData.session_story?.substring(0, 100)}...`);

            return {
                success: true,
                data: {
                    analysis_id: storedAnalysis.id,
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
    async getBatchAnalyses(sessionId, userId, options = {}) {
        try {
            const analyses = await this.analysisReportRepository.findBySession(sessionId, userId);

            // Apply filtering if requested
            let filteredAnalyses = analyses;
            if (options.include_results === false) {
                filteredAnalyses = analyses.map(analysis => {
                    const { analysis_data, ...metadata } = analysis;
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
    async getFinalAnalysis(sessionId, userId) {
        try {
            const finalAnalysis = await this.analysisReportRepository.getFinalAnalysis(sessionId, userId);

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
    async getSessionAnalysisMetrics(sessionId, userId) {
        try {
            const metrics = await this.analysisReportRepository.getSessionAnalysisMetrics(sessionId, userId);

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
     * Get all stored sessions with analysis data
     */
    async getSessionsWithAnalyses(userId) {
        try {
            const sessions = await this.analysisReportRepository.getSessionsWithAnalyses(userId);

            return {
                success: true,
                data: {
                    sessions: sessions,
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
    async getStorageStats(userId) {
        try {
            const sessions = await this.analysisReportRepository.getSessionsWithAnalyses(userId);

            const totalBatchAnalyses = sessions.reduce((sum, session) => sum + session.batch_analyses_count, 0);
            const totalFinalAnalyses = sessions.filter(session => session.has_final_analysis).length;
            const totalSessions = sessions.length;

            return {
                total_sessions: totalSessions,
                total_batch_analyses: totalBatchAnalyses,
                total_final_analyses: totalFinalAnalyses,
                average_analyses_per_session: totalSessions > 0 ? Math.round(totalBatchAnalyses / totalSessions * 10) / 10 : 0,
                storage_type: 'database'
            };
        } catch (error) {
            console.error('[AnalysisStorageService] Failed to get storage stats:', error);
            return {
                total_sessions: 0,
                total_batch_analyses: 0,
                total_final_analyses: 0,
                average_analyses_per_session: 0,
                storage_type: 'database_error'
            };
        }
    }
}

module.exports = AnalysisStorageService;