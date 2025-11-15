#!/usr/bin/env node
/**
 * Test script to verify RLS fix for screenshot_sessions
 *
 * This reproduces the production error:
 * 1. Creates a session with admin client (bypasses RLS)
 * 2. Reads session with regular client (blocked by RLS if not fixed)
 * 3. Updates session with regular client (blocked by RLS if not fixed)
 */

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing environment variables');
  console.error('Required: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const regularClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testRLSFix() {
  console.log('🧪 Testing RLS fix for screenshot_sessions...\n');

  // Get test user ID from production logs
  const testUserId = '391d9929-6afc-4d39-8ef1-fdc62bc02158';

  let sessionId;

  try {
    // Step 1: Create session with admin client (simulates BaseRepository.create())
    console.log('1️⃣  Creating session with admin client...');
    const { data: session, error: createError } = await adminClient
      .from('screenshot_sessions')
      .insert([{
        user_id: testUserId,
        session_name: 'RLS Test Session',
        goal_description: 'Testing RLS fix',
        status: 'active',
        started_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (createError) {
      console.error('❌ Create failed:', createError.message);
      return false;
    }

    sessionId = session.id;
    console.log(`✅ Session created: ${sessionId}\n`);

    // Step 2: Read session with regular client (simulates BaseRepository.findById())
    console.log('2️⃣  Reading session with regular client...');
    const { data: readSession, error: readError } = await regularClient
      .from('screenshot_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (readError) {
      console.error('❌ Read failed:', readError.message);
      console.error('   This is the EXACT error from production logs!');
      console.error('   The fix is NOT applied correctly.\n');

      // Cleanup
      await adminClient.from('screenshot_sessions').delete().eq('id', sessionId);
      return false;
    }

    console.log(`✅ Session read successfully: ${readSession.session_name}\n`);

    // Step 3: Update session with regular client (simulates BaseRepository.update())
    console.log('3️⃣  Updating session with regular client...');
    const { data: updatedSession, error: updateError } = await regularClient
      .from('screenshot_sessions')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Update failed:', updateError.message);
      console.error('   The fix is NOT applied correctly.\n');

      // Cleanup
      await adminClient.from('screenshot_sessions').delete().eq('id', sessionId);
      return false;
    }

    console.log(`✅ Session updated successfully: ${updatedSession.status}\n`);

    // Cleanup
    console.log('4️⃣  Cleaning up test session...');
    await adminClient.from('screenshot_sessions').delete().eq('id', sessionId);
    console.log('✅ Test session deleted\n');

    console.log('🎉 ALL TESTS PASSED!');
    console.log('   The RLS fix is working correctly.');
    console.log('   You can deploy to production safely.\n');

    return true;

  } catch (error) {
    console.error('❌ Unexpected error:', error.message);

    // Cleanup on error
    if (sessionId) {
      await adminClient.from('screenshot_sessions').delete().eq('id', sessionId);
    }

    return false;
  }
}

// Run test
testRLSFix()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
