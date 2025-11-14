const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

async function forceApplySchema() {
  require('dotenv').config();

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('❌ Missing environment variables');
    process.exit(1);
  }

  console.log('🔧 Force applying minimal schema via REST API...');

  // Create work_sessions table with minimal SQL via RPC
  const sql = `
    CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

    CREATE TABLE IF NOT EXISTS work_sessions (
      id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
      user_id UUID NOT NULL,
      session_name VARCHAR(255),
      goal_description TEXT,
      status VARCHAR(50) DEFAULT 'active',
      started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      ended_at TIMESTAMP WITH TIME ZONE,
      duration_seconds INTEGER DEFAULT 0,
      productivity_score DECIMAL(3,2),
      focus_score DECIMAL(3,2),
      total_screenshots INTEGER DEFAULT 0,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    ALTER TABLE work_sessions DISABLE ROW LEVEL SECURITY;
  `;

  try {
    console.log('📡 Executing SQL...');

    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/sql`, {
      method: 'POST',
      headers: {
        'apikey': anonKey,
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query: sql })
    });

    if (response.ok) {
      console.log('✅ work_sessions table created!');

      // Test if table exists by querying it
      const testResponse = await fetch(`${supabaseUrl}/rest/v1/work_sessions?limit=1`, {
        headers: {
          'apikey': anonKey,
          'Authorization': `Bearer ${anonKey}`,
        }
      });

      if (testResponse.ok) {
        console.log('🎉 Schema applied successfully! Backend should work now.');
      } else {
        console.log('⚠️  Table creation may have failed');
      }

    } else {
      const error = await response.text();
      console.error('❌ SQL execution failed:', error);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

forceApplySchema();