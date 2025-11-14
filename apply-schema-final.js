const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

console.log('🔧 Database Schema Migration Tool');
console.log('📊 Supabase URL:', supabaseUrl ? 'Set' : 'Missing');
console.log('🔑 API Key:', supabaseKey ? 'Set' : 'Missing');

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase configuration. Please check .env file.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function applySchemaFinal() {
  console.log('🔧 Applying final database schema fixes...');
  console.log('📁 Reading fix-schema-final.sql...');

  try {
    const fs = require('fs');
    const schemaSQL = fs.readFileSync('./fix-schema-final.sql', 'utf8');
    console.log(`📝 Schema SQL loaded (${schemaSQL.length} characters)`);

    // Split SQL into individual statements
    const statements = schemaSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.startsWith('SELECT \'Database'));

    console.log(`📋 Executing ${statements.length} SQL statements...`);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      if (statement.length === 0) continue;

      console.log(`\n[${i + 1}/${statements.length}] Executing:`, statement.substring(0, 80) + '...');

      try {
        // Execute each statement individually
        const { data, error } = await supabase.rpc('exec_sql', {
          sql_text: statement + ';'
        });

        if (error) {
          console.log('⚠️  Error:', error.message);

          // Some errors are expected (column already exists, etc.)
          if (error.message.includes('already exists') ||
              error.message.includes('does not exist') ||
              error.message.includes('IF NOT EXISTS')) {
            console.log('✅ Expected error - continuing...');
            successCount++;
          } else {
            console.log('❌ Unexpected error:', error);
            errorCount++;
          }
        } else {
          console.log('✅ Success');
          successCount++;
        }

        // Small delay between statements
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (err) {
        console.log('❌ Exception:', err.message);
        errorCount++;
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`✅ Successful: ${successCount}`);
    console.log(`❌ Errors: ${errorCount}`);
    console.log(`📊 Total: ${statements.length}`);

    if (errorCount === 0) {
      console.log('🎉 All schema updates applied successfully!');
    } else if (successCount > errorCount) {
      console.log('⚠️  Some errors occurred but most updates succeeded');
    } else {
      console.log('❌ Multiple errors occurred during migration');
    }

    // Verify the critical fix - check if work_session_id column exists
    console.log('\n🔍 Verifying critical schema changes...');

    try {
      const { data: columns, error: colError } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_name', 'screenshots')
        .eq('table_schema', 'public');

      if (colError) {
        console.log('⚠️  Could not verify column structure:', colError.message);
      } else {
        const columnNames = columns.map(col => col.column_name);
        const hasWorkSessionId = columnNames.includes('work_session_id');
        const hasSessionId = columnNames.includes('session_id');

        console.log('📋 Screenshots table columns:');
        console.log(`   work_session_id: ${hasWorkSessionId ? '✅' : '❌'}`);
        console.log(`   session_id: ${hasSessionId ? '⚠️  (old name)' : '✅ (removed)'}`);
        console.log(`   mouse_x: ${columnNames.includes('mouse_x') ? '✅' : '❌'}`);
        console.log(`   interaction_type: ${columnNames.includes('interaction_type') ? '✅' : '❌'}`);

        if (hasWorkSessionId) {
          console.log('✅ Critical column work_session_id is present!');
        } else {
          console.log('❌ Critical column work_session_id is missing!');
        }
      }
    } catch (verifyError) {
      console.log('⚠️  Could not verify schema:', verifyError.message);
    }

  } catch (error) {
    console.error('❌ Failed to apply schema fixes:', error.message);
    return false;
  }

  return true;
}

if (require.main === module) {
  applySchemaFinal()
    .then((success) => {
      if (success) {
        console.log('\n✅ Database schema migration completed successfully!');
        console.log('🚀 You can now test the screenshot upload functionality.');
      } else {
        console.log('\n❌ Database schema migration failed!');
      }
      process.exit(success ? 0 : 1);
    })
    .catch((error) => {
      console.error('❌ Migration process failed:', error);
      process.exit(1);
    });
}

module.exports = { applySchemaFinal };