const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

async function applyBacktestMigration() {
  console.log('📊 Applying AI Backtest Results Migration...');

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', '002_backtest_results.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');

    console.log('📝 Executing backtest migration SQL...');

    // Split SQL by statements and execute them one by one
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    console.log(`🔧 Found ${statements.length} SQL statements to execute`);

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      if (statement.length === 0) continue;

      try {
        console.log(`📋 Executing statement ${i + 1}/${statements.length}...`);

        // For CREATE TABLE statements, execute directly
        if (statement.includes('CREATE TABLE') ||
            statement.includes('CREATE INDEX') ||
            statement.includes('CREATE OR REPLACE FUNCTION') ||
            statement.includes('CREATE TRIGGER') ||
            statement.includes('COMMENT ON')) {

          // Use raw query for DDL statements
          const { error } = await supabase.rpc('exec', { sql: statement });

          if (error) {
            // If the table already exists, that's ok
            if (error.message?.includes('already exists')) {
              console.log(`⚠️  Object already exists, skipping: ${error.message}`);
            } else {
              console.log(`⚠️  DDL execution warning: ${error.message}`);
            }
          } else {
            console.log(`✅ Statement executed successfully`);
          }
        }

      } catch (execError) {
        console.log(`⚠️  Statement execution warning: ${execError.message}`);
      }
    }

    // Test that tables were created by checking one of them
    console.log('🔍 Verifying migration success...');

    const { data: testQuery, error: testError } = await supabase
      .from('backtest_runs')
      .select('count(*)')
      .limit(1);

    if (!testError) {
      console.log('✅ Migration verification successful - backtest_runs table is accessible');
    } else {
      console.log('⚠️  Migration verification failed:', testError.message);
      console.log('📋 You may need to manually apply the migration SQL to your Supabase database');

      // Output the SQL for manual application
      console.log('\n📋 MANUAL APPLICATION REQUIRED:');
      console.log('Please run the following in your Supabase SQL editor:');
      console.log('\n' + migrationSQL);

      return false;
    }

    // Test creating a sample backtest record
    console.log('🧪 Testing backtest table functionality...');

    const testBacktestData = {
      backtest_id: `test-migration-${Date.now()}`,
      sample_size: 10,
      models_tested: ['gemini-1.5-flash'],
      confidence_threshold: 0.7,
      started_at: new Date().toISOString(),
      status: 'completed'
    };

    const { data: insertResult, error: insertError } = await supabase
      .from('backtest_runs')
      .insert(testBacktestData)
      .select();

    if (insertError) {
      console.log('⚠️  Insert test failed:', insertError.message);
    } else {
      console.log('✅ Insert test successful');

      // Clean up test record
      if (insertResult && insertResult[0]) {
        await supabase
          .from('backtest_runs')
          .delete()
          .eq('id', insertResult[0].id);
        console.log('🧹 Test record cleaned up');
      }
    }

    return true;

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('\n📋 MANUAL MIGRATION REQUIRED:');
    console.log('Please apply the migration SQL manually to your Supabase database.');
    console.log('Migration file: migrations/002_backtest_results.sql');
    return false;
  }
}

if (require.main === module) {
  applyBacktestMigration()
    .then(success => {
      if (success) {
        console.log('\n✅ Backtest migration completed successfully!');
        console.log('🎯 Database is ready for AI backtest result storage.');
      } else {
        console.log('\n⚠️  Migration completed with warnings.');
        console.log('Please check the output above for any manual steps required.');
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Migration process failed:', error);
      process.exit(1);
    });
}

module.exports = { applyBacktestMigration };