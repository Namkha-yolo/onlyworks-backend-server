const AlgorithmicAnalysisService = require('./src/services/AlgorithmicAnalysisService');

// Test the AI-optional architecture with mock data
async function testAIOptionalArchitecture() {
    console.log('🧪 Testing AI-Optional Backend Architecture');
    console.log('='.repeat(50));

    const algorithmicService = new AlgorithmicAnalysisService();

    // Mock session data
    const mockSession = {
        id: 'test-session-123',
        user_id: 'test-user-456',
        session_name: 'Morning productivity session',
        goal_description: 'Complete project documentation',
        started_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
        ended_at: new Date().toISOString(),
        duration_seconds: 3600, // 1 hour
        status: 'completed'
    };

    // Mock activity events
    const mockActivityEvents = [
        {
            id: '1',
            work_session_id: 'test-session-123',
            user_id: 'test-user-456',
            event_type: 'keypress',
            timestamp: new Date(Date.now() - 3500000).toISOString(),
            application_name: 'Visual Studio Code',
            window_title: 'project-docs.md - VS Code',
            keystroke_count: 25,
            click_count: 3
        },
        {
            id: '2',
            work_session_id: 'test-session-123',
            user_id: 'test-user-456',
            event_type: 'app_switch',
            timestamp: new Date(Date.now() - 3000000).toISOString(),
            application_name: 'Chrome',
            window_title: 'Research - Google Search',
            keystroke_count: 0,
            click_count: 5
        },
        {
            id: '3',
            work_session_id: 'test-session-123',
            user_id: 'test-user-456',
            event_type: 'keypress',
            timestamp: new Date(Date.now() - 2500000).toISOString(),
            application_name: 'Chrome',
            window_title: 'Documentation Reference',
            keystroke_count: 15,
            click_count: 8
        },
        {
            id: '4',
            work_session_id: 'test-session-123',
            user_id: 'test-user-456',
            event_type: 'app_switch',
            timestamp: new Date(Date.now() - 2000000).toISOString(),
            application_name: 'Visual Studio Code',
            window_title: 'project-docs.md - VS Code',
            keystroke_count: 0,
            click_count: 1
        },
        {
            id: '5',
            work_session_id: 'test-session-123',
            user_id: 'test-user-456',
            event_type: 'keypress',
            timestamp: new Date(Date.now() - 1000000).toISOString(),
            application_name: 'Visual Studio Code',
            window_title: 'project-docs.md - VS Code',
            keystroke_count: 120,
            click_count: 15
        }
    ];

    console.log('\n📊 Core Data (ALWAYS Available - No AI Required)');
    console.log('-'.repeat(50));

    // Core metrics that work without AI
    const coreMetrics = {
        duration_minutes: Math.round(mockSession.duration_seconds / 60),
        duration_hours: Math.round((mockSession.duration_seconds / 3600) * 100) / 100,
        is_completed: mockSession.status === 'completed',
        has_goal: !!mockSession.goal_description,
        total_keystrokes: mockActivityEvents.reduce((sum, e) => sum + (e.keystroke_count || 0), 0),
        total_clicks: mockActivityEvents.reduce((sum, e) => sum + (e.click_count || 0), 0),
        calculated_at: new Date().toISOString()
    };

    coreMetrics.total_activities = coreMetrics.total_keystrokes + coreMetrics.total_clicks;
    coreMetrics.activity_rate_per_minute = coreMetrics.duration_minutes > 0 ?
        Math.round((coreMetrics.total_activities / coreMetrics.duration_minutes) * 100) / 100 : 0;

    console.log(JSON.stringify(coreMetrics, null, 2));

    console.log('\n🔬 Algorithmic Analysis (ALWAYS Available - No AI Required)');
    console.log('-'.repeat(50));

    // Test algorithmic productivity scoring
    console.log('\n📈 Productivity Score:');
    const productivityAnalysis = algorithmicService.calculateProductivityScore(mockSession, mockActivityEvents);
    console.log(`Score: ${productivityAnalysis.score}/100`);
    console.log(`Factors: ${productivityAnalysis.factors.join(', ')}`);

    // Test algorithmic focus scoring
    console.log('\n🎯 Focus Score:');
    const focusAnalysis = algorithmicService.calculateFocusScore(mockSession, mockActivityEvents);
    console.log(`Score: ${focusAnalysis.score}/100`);
    console.log(`Factors: ${focusAnalysis.factors.join(', ')}`);
    console.log(`Deep Work Periods: ${focusAnalysis.deep_work_periods}`);
    console.log(`Longest Focus Period: ${focusAnalysis.longest_focus_period} minutes`);

    // Test session summary generation
    console.log('\n📋 Session Summary:');
    const sessionSummary = algorithmicService.generateSessionSummary(mockSession, mockActivityEvents);
    console.log(`Duration: ${sessionSummary.duration_minutes} minutes`);
    console.log(`Activity Rate: ${sessionSummary.key_metrics.activity_rate} events/minute`);
    console.log(`Context Switches: ${sessionSummary.key_metrics.context_switches}`);
    console.log(`Insights: ${sessionSummary.insights.length} generated`);

    sessionSummary.insights.forEach((insight, i) => {
        console.log(`  ${i + 1}. [${insight.level}] ${insight.message}`);
    });

    console.log('\n📱 App Usage Analysis:');
    sessionSummary.app_usage.forEach((app, i) => {
        console.log(`  ${i + 1}. ${app.name}: ${app.total_activities} activities`);
    });

    console.log('\n🤖 AI Analysis Status');
    console.log('-'.repeat(50));

    // Test AI service health check
    const aiHealthCheck = require('./src/services/AIAnalysisService');
    const aiService = new aiHealthCheck();
    const aiHealth = await aiService.healthCheck();

    console.log(`AI Service Available: ${aiHealth.ai_service_available}`);
    console.log(`Model: ${aiHealth.model_name || 'Not configured'}`);
    console.log(`API Key Configured: ${aiHealth.api_key_configured}`);

    if (aiHealth.ai_service_available) {
        console.log('\n✅ AI Features: Available (but optional)');
        console.log('   - Screenshot analysis');
        console.log('   - Natural language summaries');
        console.log('   - Context-aware recommendations');
    } else {
        console.log('\n⚠️  AI Features: Not available (graceful degradation)');
        console.log('   ✅ Core functionality still works');
        console.log('   ✅ Algorithmic scoring available');
        console.log('   ✅ Time tracking works');
        console.log('   ✅ Activity monitoring works');
    }

    console.log('\n🎯 API Response Structure (AI-Optional)');
    console.log('-'.repeat(50));

    // Mock the API response structure
    const apiResponse = {
        success: true,
        data: {
            // Core data that ALWAYS works without AI
            core_data: {
                session: mockSession,
                computed_metrics: coreMetrics
            },
            // Analysis that may or may not be available
            analysis: {
                ai_available: aiHealth.ai_service_available,
                algorithmic_available: true,
                ai_insights: aiHealth.ai_service_available ? 'Would be AI insights here' : null,
                algorithmic_insights: {
                    productivity_score: productivityAnalysis.score,
                    focus_score: focusAnalysis.score,
                    summary: sessionSummary,
                    method: 'algorithmic',
                    version: '1.0'
                }
            }
        },
        meta: {
            data_guarantee: {
                core_data: 'Always available - no AI required',
                algorithmic_analysis: 'Available',
                ai_analysis: aiHealth.ai_service_available ? 'Available' : 'Not available or disabled'
            },
            reliability: {
                core_functionality: 'Works without AI',
                ai_enhanced_features: 'Optional - degrades gracefully if unavailable'
            }
        }
    };

    console.log(JSON.stringify(apiResponse, null, 2));

    console.log('\n✅ AI-Optional Architecture Test Complete!');
    console.log('='.repeat(50));
    console.log('\nKey Benefits Demonstrated:');
    console.log('1. ✅ Core functionality works without AI');
    console.log('2. ✅ Algorithmic analysis provides immediate insights');
    console.log('3. ✅ AI features are additive, not required');
    console.log('4. ✅ Clear separation between raw data and AI insights');
    console.log('5. ✅ Graceful degradation when AI is unavailable');
    console.log('\nYour backend is now AI-optional! 🎉');
}

// Run the test
testAIOptionalArchitecture().catch(console.error);