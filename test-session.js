const jwt = require('jsonwebtoken');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testSession() {
  require('dotenv').config();

  // Create a test JWT token with valid user data
  const testUser = {
    userId: 'd08c4a7e-1116-4b15-af0d-48f5aca95be9', // Use existing user ID from logs
    email: 'kewadallay@gmail.com',
    name: 'Test User',
    avatar_url: 'https://example.com/avatar.jpg',
    provider: 'google'
  };

  const jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
  const token = jwt.sign(testUser, jwtSecret, { expiresIn: '1h' });

  console.log('🔧 Testing session creation with work_sessions table...');
  console.log('🔑 Generated test token for user:', testUser.email);

  try {
    // Test getting sessions first (should be empty but not error)
    console.log('\n📋 1. Testing GET /api/sessions...');
    const getResponse = await fetch('http://localhost:8080/api/sessions?limit=5', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const sessions = await getResponse.json();
    if (getResponse.ok) {
      console.log('✅ GET sessions successful:', sessions);
    } else {
      console.log('❌ GET sessions failed:', sessions);
      return;
    }

    // Test creating a session
    console.log('\n🚀 2. Testing POST /api/sessions/start...');
    const createResponse = await fetch('http://localhost:8080/api/sessions/start', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        session_name: 'Test Session',
        goal_description: 'Testing the work_sessions table functionality'
      })
    });

    const newSession = await createResponse.json();
    if (createResponse.ok) {
      console.log('🎉 SESSION CREATION SUCCESSFUL!');
      console.log('✅ New session created:', newSession);
      console.log('\n🎯 The work_sessions table is working correctly!');
    } else {
      console.log('❌ Session creation failed:', newSession);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testSession();