#!/usr/bin/env node
/**
 * REAL TEST - Report Generation Endpoint
 *
 * Instructions:
 * 1. Replace JWT_TOKEN with your actual token from Network tab
 * 2. Replace SESSION_IDS with 2-3 real session IDs from Supabase
 * 3. Run: node test-real.js
 */

const https = require('https');

// ============================================
// 🔧 CONFIGURATION - EDIT THESE VALUES
// ============================================

// Option 1: Paste your JWT token from Network tab
const JWT_TOKEN = 'PASTE_YOUR_JWT_TOKEN_HERE';

// Option 2: OR paste JWT_SECRET from Render and we'll generate a token
// Note: JWT_SECRET is not set in Render, so backend uses default: 'your-secret-key'
const JWT_SECRET = 'your-secret-key';  // Default from auth.js:77
const USER_ID = 'd87eeaa3-b57a-4d9e-96fc-85bd624e3cc1';  // From your Supabase data

// ✅ REAL SESSION IDS FROM YOUR SUPABASE (User 2)
const SESSION_IDS = [
  '1de1ac34-5944-4828-a6f0-f1359f256f4e',  // Work Session 11/20/2025, 10:31:21 PM
  'd4425a91-3a4f-42da-9501-f66bdd82d52f'   // Work Session 11/20/2025, 10:15:11 PM
];

const REPORT_TITLE = 'Test Report - ' + new Date().toISOString().split('T')[0];
const DEVELOPER_NAME = 'Test User';

// ============================================
// 🚀 TEST EXECUTION
// ============================================

console.log('🧪 Testing Report Generation Endpoint\n');

// Generate token if JWT_SECRET is provided
let actualToken = JWT_TOKEN;
if (JWT_SECRET !== 'PASTE_JWT_SECRET_FROM_RENDER' && JWT_TOKEN === 'PASTE_YOUR_JWT_TOKEN_HERE') {
  console.log('🔑 Generating JWT token from JWT_SECRET...\n');

  try {
    const jwt = require('jsonwebtoken');
    const payload = {
      userId: USER_ID,
      email: 'test@example.com',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
    };
    actualToken = jwt.sign(payload, JWT_SECRET);
    console.log('✅ Token generated successfully!\n');
  } catch (error) {
    console.error('❌ Failed to generate token:', error.message);
    console.error('   Make sure jsonwebtoken is installed: npm install jsonwebtoken\n');
    process.exit(1);
  }
}

console.log('📋 Configuration:');
console.log(`   User ID: ${USER_ID}`);
console.log(`   Token: ${actualToken.substring(0, 20)}...${actualToken.substring(actualToken.length - 10)}`);
console.log(`   Sessions: ${SESSION_IDS.length} IDs`);
console.log(`   Title: ${REPORT_TITLE}\n`);

if (actualToken === 'PASTE_YOUR_JWT_TOKEN_HERE') {
  console.error('❌ ERROR: Please provide either:');
  console.error('   Option 1: JWT_TOKEN from your browser');
  console.error('   Option 2: JWT_SECRET from Render (and I\'ll generate the token)\n');
  console.error('To get JWT_SECRET from Render:');
  console.error('   1. Go to https://dashboard.render.com');
  console.error('   2. Click onlyworks-backend-server → Environment');
  console.error('   3. Find JWT_SECRET and copy its value\n');
  process.exit(1);
}

const requestData = JSON.stringify({
  sessionIds: SESSION_IDS,
  title: REPORT_TITLE,
  developerName: DEVELOPER_NAME
});

const options = {
  hostname: 'onlyworks-backend-server.onrender.com',
  port: 443,
  path: '/api/reports/generate-from-sessions',
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${actualToken}`,
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(requestData)
  }
};

console.log('📤 Sending request to production...\n');
console.log(`POST https://${options.hostname}${options.path}`);
console.log(`Request Body: ${requestData}\n`);

const startTime = Date.now();

const req = https.request(options, (res) => {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(`📥 Response received in ${duration}s`);
  console.log(`   Status: ${res.statusCode} ${res.statusMessage}\n`);

  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);

      if (res.statusCode === 200 && response.success) {
        console.log('✅ SUCCESS! Report generated!\n');
        console.log('📄 Response:');
        console.log(JSON.stringify(response, null, 2));
        console.log('\n');

        if (response.data && response.data.shareUrl) {
          console.log('🔗 SHAREABLE URL:');
          console.log(`   ${response.data.shareUrl}`);
          console.log('\n');
          console.log('✨ Next Steps:');
          console.log(`   1. Open the URL in your browser: ${response.data.shareUrl}`);
          console.log('   2. Report should display WITHOUT login');
          console.log('   3. Check Supabase:');
          console.log('      - reports table → new entry');
          console.log('      - shared_reports table → new entry');
          console.log('      - reports storage bucket → new HTML file');
        }
      } else {
        console.log('❌ REQUEST FAILED\n');
        console.log('Response:');
        console.log(JSON.stringify(response, null, 2));
        console.log('\n');

        console.log('🔍 Troubleshooting:');
        if (response.error?.code === 'AUTH_REQUIRED') {
          console.log('   → JWT token is invalid or expired');
          console.log('   → Get a fresh token from Network tab');
        } else if (response.error?.includes('sessionIds')) {
          console.log('   → Check session IDs are correct UUIDs');
          console.log('   → Verify they exist in Supabase');
          console.log('   → Make sure they belong to the same user as the JWT token');
        } else {
          console.log('   → Check Render logs for more details');
          console.log('   → https://dashboard.render.com → onlyworks-backend-server → Logs');
        }
      }
    } catch (error) {
      console.log('❌ PARSE ERROR\n');
      console.log('Raw response:', data);
      console.log('Error:', error.message);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ REQUEST ERROR\n');
  console.error(error.message);
  console.error('\nPossible causes:');
  console.error('   - Network connection issue');
  console.error('   - Render server is down');
  console.error('   - Invalid hostname');
});

req.on('timeout', () => {
  console.error('❌ REQUEST TIMEOUT\n');
  console.error('The request took too long (>60s)');
  console.error('This might indicate:');
  console.error('   - Backend is processing but slow (check Render logs)');
  console.error('   - AI generation is taking a while');
  console.error('   - Storage upload is slow');
});

req.setTimeout(60000); // 60 second timeout
req.write(requestData);
req.end();

console.log('⏳ Waiting for response (this may take 30-60 seconds)...\n');
