const AIAnalysisBacktestService = require('./src/services/AIAnalysisBacktestService');

async function testBacktest() {
  console.log('🧪 Starting AI Analysis Backtest Test...\n');

  const backtestService = new AIAnalysisBacktestService();

  try {
    // Run a small-scale backtest
    const result = await backtestService.runBacktest({
      testSampleSize: 10,
      models: ['gemini-1.5-flash'],
      confidenceThreshold: 0.7,
      enableRealTimeValidation: true
    });

    if (result.success) {
      console.log('✅ Backtest completed successfully!');
      console.log('\n📊 Results Summary:');
      console.log(`- Backtest ID: ${result.data.backtest_id}`);
      console.log(`- Total Tests: ${result.data.test_configuration.sample_size}`);
      console.log(`- Overall Accuracy: ${(result.data.overall_metrics.average_accuracy * 100).toFixed(1)}%`);
      console.log(`- Average Latency: ${result.data.overall_metrics.average_latency.toFixed(0)}ms`);
      console.log(`- Best Model: ${result.data.overall_metrics.best_performing_model}`);

      console.log('\n🎯 Model Performance:');
      Object.entries(result.data.model_results).forEach(([model, metrics]) => {
        console.log(`  ${model}:`);
        console.log(`    - Activity Detection: ${(metrics.accuracy_metrics.activity_detection.accuracy * 100).toFixed(1)}%`);
        console.log(`    - App Detection: ${(metrics.accuracy_metrics.app_detection.accuracy * 100).toFixed(1)}%`);
        console.log(`    - Average Latency: ${metrics.performance_metrics.average_latency_ms.toFixed(0)}ms`);
        console.log(`    - Average Confidence: ${(metrics.performance_metrics.average_confidence * 100).toFixed(1)}%`);
      });

      console.log('\n💡 Key Findings:');
      result.data.performance_summary.key_findings.forEach(finding => {
        console.log(`  - ${finding}`);
      });

      console.log('\n🔧 Recommendations:');
      if (result.data.detailed_analysis.recommendations.length > 0) {
        result.data.detailed_analysis.recommendations.forEach(rec => {
          console.log(`  - [${rec.priority.toUpperCase()}] ${rec.message}`);
          rec.suggested_actions.forEach(action => {
            console.log(`    • ${action}`);
          });
        });
      } else {
        console.log('  - No specific improvements needed at this time');
      }

      console.log('\n🚀 Production Readiness:');
      const prodReadiness = result.data.performance_summary.production_readiness;
      console.log(`  - Accuracy Threshold Met: ${prodReadiness.accuracy_threshold_met ? '✅' : '❌'}`);
      console.log(`  - Latency Threshold Met: ${prodReadiness.latency_threshold_met ? '✅' : '❌'}`);
      console.log(`  - Recommended Deployment: ${prodReadiness.recommended_deployment}`);

      // Test additional service methods
      console.log('\n🔍 Testing Additional Methods:');

      // Get backtest results
      const retrievedResults = await backtestService.getBacktestResults(result.data.backtest_id);
      console.log(`  - Backtest retrieval: ${retrievedResults.success ? '✅' : '❌'}`);

      // List all backtests
      const backtestList = await backtestService.listBacktests();
      console.log(`  - Backtest listing: ${backtestList.success ? '✅' : '❌'} (${backtestList.data.length} backtests)`);

      // Get performance metrics
      const performanceMetrics = await backtestService.getPerformanceMetrics();
      console.log(`  - Performance metrics: ${performanceMetrics.success ? '✅' : '❌'}`);

    } else {
      console.error('❌ Backtest failed:', result.error);
      return false;
    }

  } catch (error) {
    console.error('❌ Test failed with error:', error.message);
    console.error(error.stack);
    return false;
  }

  console.log('\n🎉 All backtest functionality tests passed!');
  return true;
}

// Run the test
if (require.main === module) {
  testBacktest()
    .then(success => {
      console.log(success ? '\n✅ Test completed successfully' : '\n❌ Test failed');
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('\n💥 Test crashed:', error);
      process.exit(1);
    });
}

module.exports = { testBacktest };