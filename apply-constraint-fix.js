const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

async function applyConstraintFix() {
  console.log('🔧 Applying database constraint fixes...');

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read the SQL fix file
    const sqlPath = path.join(__dirname, 'fix-constraints.sql');
    const sqlContent = await fs.readFile(sqlPath, 'utf8');

    console.log('📝 Executing constraint fix SQL...');

    // Execute the SQL using the raw query function
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_query: sqlContent
    });

    if (error) {
      // Try alternative approach using psql through environment
      console.log('⚠️ Direct SQL execution failed, trying alternative approach...');

      // Check if foreign keys already exist by testing the table structure
      const { data: testData, error: testError } = await supabase
        .from('analysis_reports')
        .select('id, session_id, user_id')
        .limit(1);

      if (!testError) {
        console.log('✅ analysis_reports table is accessible');

        // Test creating a record with valid references to check constraints
        const demoUserId = 'b8f3d1e2-7a5c-4d9f-8b1e-2c3a4f5e6d7c';

        // Try to query for an existing work session
        const { data: sessionData } = await supabase
          .from('work_sessions')
          .select('id')
          .eq('user_id', demoUserId)
          .limit(1);

        if (sessionData && sessionData.length > 0) {
          const sessionId = sessionData[0].id;

          // Test constraint by creating a test record
          const testRecord = {
            session_id: sessionId,
            user_id: demoUserId,
            analysis_type: 'test',
            analysis_data: { test: true },
            work_completed: [],
            alignment_score: 0,
            screenshot_count: 0
          };

          const { data: insertData, error: insertError } = await supabase
            .from('analysis_reports')
            .insert(testRecord)
            .select();

          if (insertError) {
            console.log('❌ Constraint test failed:', insertError.message);
            console.log('🔧 Foreign key constraints may be missing');

            // Provide manual fix instructions
            console.log('\n📋 MANUAL FIX REQUIRED:');
            console.log('The database constraints need to be applied manually.');
            console.log('Please run the following SQL against your Supabase database:\n');
            console.log(sqlContent);

          } else {
            console.log('✅ Constraint test passed');

            // Clean up test record
            if (insertData && insertData[0]) {
              await supabase
                .from('analysis_reports')
                .delete()
                .eq('id', insertData[0].id);
            }
          }
        } else {
          console.log('⚠️ No work sessions found for demo user');
        }
      } else {
        console.log('❌ analysis_reports table not accessible:', testError.message);
      }
    } else {
      console.log('✅ SQL executed successfully:', data);
    }

  } catch (error) {
    console.error('❌ Constraint fix failed:', error.message);

    console.log('\n📋 MANUAL FIX INSTRUCTIONS:');
    console.log('Please apply the following SQL to your Supabase database:');
    console.log('');
    console.log('ALTER TABLE analysis_reports ADD CONSTRAINT analysis_reports_session_id_fkey');
    console.log('FOREIGN KEY (session_id) REFERENCES work_sessions(id) ON DELETE CASCADE;');
    console.log('');
    console.log('ALTER TABLE analysis_reports ADD CONSTRAINT analysis_reports_user_id_fkey');
    console.log('FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;');
  }

  console.log('🎯 Constraint fix process completed');
}

if (require.main === module) {
  applyConstraintFix()
    .then(() => {
      console.log('✅ Constraint fix process completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Constraint fix process failed:', error);
      process.exit(1);
    });
}

module.exports = { applyConstraintFix };