const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function testRelease() {
  console.log('🚀 RELEASE DAY TESTING - ONLYWORKS\n');
  console.log('=' .repeat(50));

  let allTestsPassed = true;

  // Test 1: Backend Health
  console.log('\n1️⃣ Testing Backend Health...');
  try {
    const health = await fetch('http://localhost:8080/health');
    const healthData = await health.json();
    if (healthData.status === 'healthy') {
      console.log('✅ Backend is healthy');
    } else {
      console.log('❌ Backend health check failed');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('❌ Backend not running:', error.message);
    allTestsPassed = false;
  }

  // Test 2: Database Tables
  console.log('\n2️⃣ Testing Database Tables...');
  const supabaseUrl = 'https://wwvhhxoukdegvbtgnafr.supabase.co';
  const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind3dmhoeG91a2RlZ3ZidGduYWZyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTgxNTUzMDQsImV4cCI6MjA3MzczMTMwNH0.JKarzWyV91GJuN_VULZ8ht-dbZ8kwwKYAK2tEOyCQHE';

  const tables = ['work_sessions', 'screenshots', 'reports'];
  for (const table of tables) {
    try {
      const response = await fetch(`${supabaseUrl}/rest/v1/${table}?limit=1`, {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`
        }
      });
      if (response.ok) {
        console.log(`✅ Table '${table}' exists and is accessible`);
      } else {
        console.log(`❌ Table '${table}' error:`, response.status);
        allTestsPassed = false;
      }
    } catch (error) {
      console.log(`❌ Table '${table}' test failed:`, error.message);
      allTestsPassed = false;
    }
  }

  // Test 3: Storage Bucket
  console.log('\n3️⃣ Testing Storage Bucket...');
  try {
    const bucketResponse = await fetch(`${supabaseUrl}/storage/v1/bucket/screenshots`, {
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`
      }
    });
    if (bucketResponse.ok) {
      console.log('✅ Screenshots bucket exists');
    } else {
      console.log('❌ Screenshots bucket not found');
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('❌ Storage test failed:', error.message);
    allTestsPassed = false;
  }

  // Test 4: OAuth Endpoints
  console.log('\n4️⃣ Testing OAuth Endpoints...');
  try {
    const oauthResponse = await fetch('http://localhost:8080/oauth/google/init');
    if (oauthResponse.ok) {
      console.log('✅ OAuth endpoint working');
    } else {
      console.log('❌ OAuth endpoint error:', oauthResponse.status);
      allTestsPassed = false;
    }
  } catch (error) {
    console.log('❌ OAuth test failed:', error.message);
    allTestsPassed = false;
  }

  // Final Result
  console.log('\n' + '=' .repeat(50));
  if (allTestsPassed) {
    console.log('🎉 ALL TESTS PASSED - READY FOR RELEASE!');
    console.log('✅ Backend: Running');
    console.log('✅ Database: All tables exist');
    console.log('✅ Storage: Configured');
    console.log('✅ OAuth: Ready');
    console.log('\n🚀 YOUR APP IS READY FOR CUSTOMERS!');
  } else {
    console.log('⚠️ SOME TESTS FAILED - CHECK ABOVE');
    console.log('\n📝 Apply EMERGENCY-FIX-ALL.sql in Supabase SQL Editor');
    console.log('👉 https://app.supabase.com/project/wwvhhxoukdegvbtgnafr/sql/new');
  }
}

// Run tests
setTimeout(() => {
  testRelease();
}, 2000); // Wait 2 seconds for backend to start