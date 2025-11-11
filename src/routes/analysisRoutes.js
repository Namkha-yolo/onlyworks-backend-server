const express = require('express');
const router = express.Router();
const AnalysisStorageService = require('../services/AnalysisStorageService');

// Create analysis storage service instance
const analysisService = new AnalysisStorageService();

/**
 * Store a batch analysis (every 30 screenshots)
 * POST /api/analysis/batch
 */
router.post('/batch', async (req, res) => {
    try {
        const batchData = req.body;

        // Validate required fields
        if (!batchData.session_id || !batchData.screenshot_ids || !batchData.analysis_results) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Missing required fields: session_id, screenshot_ids, analysis_results'
                }
            });
        }

        console.log(`[AnalysisAPI] Storing batch analysis for session ${batchData.session_id}, batch #${batchData.batch_number}`);

        const result = await analysisService.storeBatchAnalysis(batchData);

        if (result.success) {
            res.status(201).json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('[AnalysisAPI] Error storing batch analysis:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error while storing batch analysis'
            }
        });
    }
});

/**
 * Store final session analysis (combined report)
 * POST /api/analysis/final
 */
router.post('/final', async (req, res) => {
    try {
        const finalData = req.body;

        // Validate required fields
        if (!finalData.session_id || !finalData.combined_analysis) {
            return res.status(400).json({
                success: false,
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'Missing required fields: session_id, combined_analysis'
                }
            });
        }

        console.log(`[AnalysisAPI] Storing final analysis for session ${finalData.session_id}`);
        console.log(`[AnalysisAPI] Combines ${finalData.total_batches} batches, ${finalData.total_screenshots} screenshots`);

        const result = await analysisService.storeFinalAnalysis(finalData);

        if (result.success) {
            res.status(201).json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('[AnalysisAPI] Error storing final analysis:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error while storing final analysis'
            }
        });
    }
});

/**
 * Get batch analyses for a session
 * GET /api/analysis/batch/:sessionId
 */
router.get('/batch/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const options = {
            limit: parseInt(req.query.limit) || 50,
            offset: parseInt(req.query.offset) || 0,
            include_results: req.query.include_results !== 'false' // Default true
        };

        console.log(`[AnalysisAPI] Retrieving batch analyses for session ${sessionId}`);

        const result = await analysisService.getBatchAnalyses(sessionId, options);

        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        console.error('[AnalysisAPI] Error retrieving batch analyses:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error while retrieving batch analyses'
            }
        });
    }
});

/**
 * Get final analysis for a session
 * GET /api/analysis/final/:sessionId
 */
router.get('/final/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        console.log(`[AnalysisAPI] Retrieving final analysis for session ${sessionId}`);

        const result = await analysisService.getFinalAnalysis(sessionId);

        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        console.error('[AnalysisAPI] Error retrieving final analysis:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error while retrieving final analysis'
            }
        });
    }
});

/**
 * Get session analysis metrics
 * GET /api/analysis/metrics/:sessionId
 */
router.get('/metrics/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        console.log(`[AnalysisAPI] Retrieving analysis metrics for session ${sessionId}`);

        const result = await analysisService.getSessionAnalysisMetrics(sessionId);

        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    } catch (error) {
        console.error('[AnalysisAPI] Error retrieving session metrics:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error while retrieving session metrics'
            }
        });
    }
});

/**
 * Get all sessions with analysis data
 * GET /api/analysis/sessions
 */
router.get('/sessions', async (req, res) => {
    try {
        console.log(`[AnalysisAPI] Retrieving all sessions with analysis data`);

        const result = await analysisService.getSessionsWithAnalyses();

        if (result.success) {
            res.json(result);
        } else {
            res.status(500).json(result);
        }
    } catch (error) {
        console.error('[AnalysisAPI] Error retrieving sessions with analyses:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error while retrieving sessions with analyses'
            }
        });
    }
});

/**
 * Get storage statistics
 * GET /api/analysis/stats
 */
router.get('/stats', async (req, res) => {
    try {
        console.log(`[AnalysisAPI] Retrieving analysis storage statistics`);

        const stats = analysisService.getStorageStats();

        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('[AnalysisAPI] Error retrieving storage stats:', error);
        res.status(500).json({
            success: false,
            error: {
                code: 'INTERNAL_ERROR',
                message: 'Internal server error while retrieving storage stats'
            }
        });
    }
});

/**
 * Health check for analysis service
 * GET /api/analysis/health
 */
router.get('/health', (req, res) => {
    res.json({
        success: true,
        service: 'AnalysisStorageService',
        status: 'healthy',
        timestamp: new Date().toISOString(),
        stats: analysisService.getStorageStats()
    });
});

module.exports = router;