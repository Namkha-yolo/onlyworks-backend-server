/**
 * Test Email Sending Endpoint
 *
 * This tests the POST /api/reports/share-via-email endpoint
 */

const jwt = require('jsonwebtoken');

// Configuration
const API_URL = 'https://onlyworks-backend-server.onrender.com';
const JWT_SECRET = 'your-secret-key';  // Default from auth.js
const USER_ID = 'd87eeaa3-b57a-4d9e-96fc-85bd624e3cc1';  // Test user ID

// Test data
const TEST_SHARE_URL = 'https://only-works.com/r/659f4c70-a3b9-479a-adac-91bbe65be715';
const TEST_RECIPIENTS = [
  {
    email: 'brodeywang2004@gmail.com',
    name: 'Brodey'
  }
];
const TEST_TITLE = 'Productivity Report - 11/15/2025 - 11/21/2025';
const TEST_MESSAGE = 'Hey! Check out this productivity report. Let me know what you think!';

async function testEmailSending() {
  try {
    console.log('🧪 Testing Email Sending Endpoint\n');

    // Generate JWT token
    console.log('🔑 Generating JWT token...\n');
    const payload = {
      userId: USER_ID,
      email: 'test@example.com',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60) // 1 hour
    };
    const token = jwt.sign(payload, JWT_SECRET);
    console.log('✅ Token generated successfully!\n');

    // Prepare request body
    const requestBody = {
      shareUrl: TEST_SHARE_URL,
      recipients: TEST_RECIPIENTS,
      title: TEST_TITLE,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
      message: TEST_MESSAGE,
      senderName: 'Test User'
    };

    console.log('📋 Request Configuration:');
    console.log(`   Endpoint: POST ${API_URL}/api/reports/share-via-email`);
    console.log(`   Recipients: ${TEST_RECIPIENTS.map(r => `${r.name} <${r.email}>`).join(', ')}`);
    console.log(`   Share URL: ${TEST_SHARE_URL}`);
    console.log(`   Title: ${TEST_TITLE}\n`);

    console.log('📤 Sending request...\n');

    const response = await fetch(`${API_URL}/api/reports/share-via-email`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(requestBody)
    });

    const responseTime = Date.now();

    console.log(`📥 Response received`);
    console.log(`   Status: ${response.status} ${response.statusText}\n`);

    const responseData = await response.json();

    if (response.ok) {
      console.log('✅ SUCCESS! Email sent!\n');
      console.log('📄 Response:');
      console.log(JSON.stringify(responseData, null, 2));
      console.log('\n');

      if (responseData.data) {
        console.log('📊 Summary:');
        console.log(`   ✅ Sent to: ${responseData.data.sent.length} recipient(s)`);
        if (responseData.data.sent.length > 0) {
          responseData.data.sent.forEach(email => {
            console.log(`      - ${email}`);
          });
        }
        if (responseData.data.failed.length > 0) {
          console.log(`   ❌ Failed: ${responseData.data.failed.length} recipient(s)`);
          responseData.data.failed.forEach(failed => {
            console.log(`      - ${failed.email}: ${failed.error}`);
          });
        }
      }

      console.log('\n✨ Next Steps:');
      console.log('   1. Check the recipient\'s inbox for the email');
      console.log('   2. Verify the email contains the share link');
      console.log('   3. Test clicking the share link in the email');
    } else {
      console.log('❌ REQUEST FAILED\n');
      console.log('Response:');
      console.log(JSON.stringify(responseData, null, 2));
      console.log('\n');

      console.log('🔍 Troubleshooting:');
      if (response.status === 400) {
        console.log('   ❌ VALIDATION ERROR - Check request body format');
      } else if (response.status === 401) {
        console.log('   ❌ AUTHENTICATION ERROR - Check JWT token');
      } else if (response.status === 503) {
        console.log('   ❌ SERVICE UNAVAILABLE - RESEND_API_KEY not configured on server');
      } else {
        console.log('   ❌ UNEXPECTED ERROR - Check server logs');
      }
    }

  } catch (error) {
    console.error('\n💥 EXCEPTION:', error.message);
    console.error('\nFull error:', error);
  }
}

// Run the test
testEmailSending();
