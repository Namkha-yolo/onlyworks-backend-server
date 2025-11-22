#!/usr/bin/env node
/**
 * Test script for report generation feature
 *
 * Usage:
 *   node test-report-generation.js
 *
 * This will:
 * 1. Check environment variables
 * 2. Fetch sample session IDs from database
 * 3. Generate a test HTTP request you can use
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

console.log('🧪 Report Generation Test Setup\n');

// Step 1: Check environment variables
console.log('📋 Step 1: Checking Environment Variables...\n');

const requiredVars = {
  'SUPABASE_URL': process.env.SUPABASE_URL,
  'SUPABASE_SERVICE_ROLE_KEY': process.env.SUPABASE_SERVICE_ROLE_KEY,
  'GOOGLE_API_KEY': process.env.GOOGLE_API_KEY,
  'JWT_SECRET': process.env.JWT_SECRET,
  'WEBSITE_URL (optional)': process.env.WEBSITE_URL || 'https://only-works.com (default)'
};

let missingVars = [];
for (const [key, value] of Object.entries(requiredVars)) {
  const status = value ? '✅' : '❌';
  const preview = value
    ? (value.length > 20 ? value.substring(0, 20) + '...' : value)
    : 'NOT SET';
  console.log(`${status} ${key}: ${preview}`);

  if (!value && !key.includes('optional')) {
    missingVars.push(key);
  }
}

console.log('');

if (missingVars.length > 0) {
  console.error('❌ Missing required environment variables:');
  missingVars.forEach(v => console.error(`   - ${v}`));
  console.error('\nPlease set these in your .env file or environment.');
  process.exit(1);
}

// Step 2: Fetch sample sessions
console.log('📋 Step 2: Fetching Sample Sessions...\n');

async function getSampleSessions() {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get recent sessions
    const { data: sessions, error } = await supabase
      .from('screenshot_sessions')
      .select('id, user_id, session_name, started_at, status, screenshot_count')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('❌ Database query failed:', error.message);
      return null;
    }

    if (!sessions || sessions.length === 0) {
      console.warn('⚠️  No sessions found in database');
      console.log('   Create a session first by using the OnlyWorks app');
      return null;
    }

    console.log(`✅ Found ${sessions.length} recent sessions:\n`);

    sessions.forEach((session, index) => {
      console.log(`${index + 1}. Session: ${session.session_name || 'Unnamed'}`);
      console.log(`   ID: ${session.id}`);
      console.log(`   User: ${session.user_id}`);
      console.log(`   Status: ${session.status}`);
      console.log(`   Screenshots: ${session.screenshot_count || 0}`);
      console.log(`   Started: ${new Date(session.started_at).toLocaleString()}`);
      console.log('');
    });

    return sessions;

  } catch (error) {
    console.error('❌ Failed to fetch sessions:', error.message);
    return null;
  }
}

// Step 3: Generate test request
async function generateTestRequest(sessions) {
  console.log('📋 Step 3: Test Request Generation\n');

  if (!sessions || sessions.length < 2) {
    console.warn('⚠️  Need at least 2 sessions for testing');
    console.log('   Using placeholder session IDs in example');

    const exampleRequest = {
      sessionIds: ['session-uuid-1', 'session-uuid-2'],
      title: 'Test Report',
      developerName: 'Test User'
    };

    console.log('\n📄 Example cURL Request:\n');
    console.log('curl -X POST http://localhost:10000/api/reports/generate-from-sessions \\');
    console.log('  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\');
    console.log('  -H "Content-Type: application/json" \\');
    console.log(`  -d '${JSON.stringify(exampleRequest, null, 2)}'`);
    console.log('');

    console.log('⚠️  IMPORTANT: Replace YOUR_JWT_TOKEN with actual token');
    console.log('⚠️  IMPORTANT: Replace session-uuid-1 and session-uuid-2 with real session IDs');
    return;
  }

  // Use first 2 sessions
  const sessionIds = sessions.slice(0, 2).map(s => s.id);
  const userId = sessions[0].user_id;

  const testRequest = {
    sessionIds: sessionIds,
    title: 'Test Report - ' + new Date().toISOString().split('T')[0],
    developerName: 'Test User'
  };

  console.log('✅ Generated test request with real session IDs:\n');
  console.log(JSON.stringify(testRequest, null, 2));
  console.log('');

  console.log('📄 cURL Command (localhost):\n');
  console.log('curl -X POST http://localhost:10000/api/reports/generate-from-sessions \\');
  console.log('  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log(`  -d '${JSON.stringify(testRequest)}'`);
  console.log('');

  console.log('📄 cURL Command (production):\n');
  console.log('curl -X POST https://onlyworks-backend-server.onrender.com/api/reports/generate-from-sessions \\');
  console.log('  -H "Authorization: Bearer YOUR_JWT_TOKEN" \\');
  console.log('  -H "Content-Type: application/json" \\');
  console.log(`  -d '${JSON.stringify(testRequest)}'`);
  console.log('');

  console.log('🔑 To get JWT token:');
  console.log('   1. Log into OnlyWorks app');
  console.log('   2. Open DevTools → Application → Local Storage');
  console.log('   3. Find "authToken" or similar key');
  console.log('   4. Copy the token value');
  console.log('');

  console.log('📋 Step 4: Expected Response:\n');
  console.log(JSON.stringify({
    "success": true,
    "id": "report-uuid",
    "shareUrl": "https://only-works.com/r/unique-token",
    "shareToken": "unique-token",
    "expiresAt": "2025-12-21T...",
    "title": testRequest.title,
    "summary": "Comprehensive report generated from 2 work sessions...",
    "start_date": "2025-11-15",
    "end_date": "2025-11-21",
    "productivity_score": 0.85
  }, null, 2));
  console.log('');

  console.log('✅ Test Setup Complete!\n');
  console.log('Next steps:');
  console.log('1. Copy one of the cURL commands above');
  console.log('2. Replace YOUR_JWT_TOKEN with your actual JWT token');
  console.log('3. Run the command in your terminal');
  console.log('4. Check the response matches the expected format');
  console.log('5. Visit the shareUrl to see the report on the website');
}

// Run the test
(async () => {
  const sessions = await getSampleSessions();
  await generateTestRequest(sessions);
})();
