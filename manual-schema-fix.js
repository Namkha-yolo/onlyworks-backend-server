const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function applyManualSchemaFix() {
  console.log('🔧 Applying manual schema fixes...');

  try {
    // Check current table structure first
    console.log('🔍 Checking current table structure...');

    const { data: tableInfo, error: infoError } = await supabase
      .from('information_schema.columns')
      .select('column_name')
      .eq('table_name', 'screenshots')
      .eq('table_schema', 'public');

    if (infoError) {
      console.log('⚠️ Could not query table info, proceeding with fixes...');
    } else {
      const columnNames = tableInfo.map(col => col.column_name);
      console.log('📋 Current columns in screenshots table:', columnNames);

      const hasWorkSessionId = columnNames.includes('work_session_id');
      const hasSessionId = columnNames.includes('session_id');

      console.log(`Has work_session_id: ${hasWorkSessionId}, Has session_id: ${hasSessionId}`);
    }

    // Test if we can create tables (this will help us understand what we can do)
    console.log('🧪 Testing table creation abilities...');

    // Try to create analysis_reports table
    console.log('📝 Creating analysis_reports table...');
    const { error: createError1 } = await supabase
      .from('analysis_reports')
      .select('id')
      .limit(1);

    if (createError1 && createError1.code === '42P01') {
      console.log('⚠️ analysis_reports table does not exist - needs to be created via database admin');
    } else {
      console.log('✅ analysis_reports table exists');
    }

    // Try to create goals table
    console.log('📝 Checking goals table...');
    const { error: createError2 } = await supabase
      .from('goals')
      .select('id')
      .limit(1);

    if (createError2 && createError2.code === '42P01') {
      console.log('⚠️ goals table does not exist - needs to be created via database admin');
    } else {
      console.log('✅ goals table exists');
    }

    // Try to create user_settings table
    console.log('📝 Checking user_settings table...');
    const { error: createError3 } = await supabase
      .from('user_settings')
      .select('id')
      .limit(1);

    if (createError3 && createError3.code === '42P01') {
      console.log('⚠️ user_settings table does not exist - needs to be created via database admin');
    } else {
      console.log('✅ user_settings table exists');
    }

    // Test screenshot table operations
    console.log('🔍 Testing screenshot table operations...');

    try {
      // Try to query with work_session_id
      const { data: testData1, error: testError1 } = await supabase
        .from('screenshots')
        .select('work_session_id')
        .limit(1);

      if (testError1) {
        console.log('❌ work_session_id column issue:', testError1.message);
      } else {
        console.log('✅ work_session_id column is accessible');
      }
    } catch (e) {
      console.log('❌ Error testing work_session_id:', e.message);
    }

    try {
      // Try to query with session_id
      const { data: testData2, error: testError2 } = await supabase
        .from('screenshots')
        .select('session_id')
        .limit(1);

      if (testError2) {
        console.log('❌ session_id column issue:', testError2.message);
      } else {
        console.log('⚠️ session_id column exists (should be work_session_id)');
      }
    } catch (e) {
      console.log('✅ session_id column does not exist (good if work_session_id exists)');
    }

    // Test other required columns
    const requiredColumns = [
      'ai_analysis_completed',
      'processed_at',
      'batch_report_id',
      'retention_expires_at',
      'ocr_text',
      'window_title',
      'active_app',
      'capture_trigger'
    ];

    for (const column of requiredColumns) {
      try {
        const { error } = await supabase
          .from('screenshots')
          .select(column)
          .limit(1);

        if (error) {
          console.log(`❌ Column '${column}' missing:`, error.message);
        } else {
          console.log(`✅ Column '${column}' exists`);
        }
      } catch (e) {
        console.log(`❌ Column '${column}' error:`, e.message);
      }
    }

  } catch (error) {
    console.error('❌ Manual schema check failed:', error.message);
  }

  console.log('🎯 Manual schema check completed');
  console.log('');
  console.log('📋 SUMMARY:');
  console.log('- This script can only READ/check existing schema');
  console.log('- Schema modifications require database admin access');
  console.log('- The SQL in fix-database-schema.sql needs to be applied directly to the database');
  console.log('- Contact your database administrator to apply the schema changes');
}

if (require.main === module) {
  applyManualSchemaFix()
    .then(() => {
      console.log('✅ Schema check completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Schema check failed:', error);
      process.exit(1);
    });
}

module.exports = { applyManualSchemaFix };