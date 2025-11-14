const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function applySchemaFix() {
  console.log('🔧 Applying database schema fixes...');

  try {
    // Read the schema fix SQL
    const fs = require('fs');
    const schemaSQL = fs.readFileSync('./fix-database-schema.sql', 'utf8');

    console.log('📝 Executing schema fixes...');

    // Execute the schema SQL using raw query
    const { data, error } = await supabase.rpc('exec_sql', { sql_text: schemaSQL });

    if (error) {
      console.error('❌ Schema fix failed:', error);

      // Try individual fixes if the bulk update fails
      console.log('🔄 Trying individual fixes...');

      // Fix 1: Rename column
      try {
        const { error: renameError } = await supabase.rpc('exec_sql', {
          sql_text: 'ALTER TABLE screenshots RENAME COLUMN session_id TO work_session_id;'
        });
        if (renameError && !renameError.message.includes('already exists')) {
          console.log('Column rename:', renameError.message);
        } else {
          console.log('✅ Column renamed: session_id -> work_session_id');
        }
      } catch (e) {
        console.log('Column already named correctly or already exists');
      }

      // Fix 2: Add missing columns
      const columnsToAdd = [
        'ai_analysis_completed BOOLEAN DEFAULT FALSE',
        'processed_at TIMESTAMP WITH TIME ZONE',
        'batch_report_id UUID',
        'retention_expires_at TIMESTAMP WITH TIME ZONE',
        'ocr_text TEXT',
        'window_title TEXT',
        'active_app TEXT',
        'capture_trigger TEXT DEFAULT \'timer_15s\''
      ];

      for (const column of columnsToAdd) {
        try {
          const { error: colError } = await supabase.rpc('exec_sql', {
            sql_text: `ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS ${column};`
          });
          if (colError) {
            console.log(`Column add (${column.split(' ')[0]}):`, colError.message);
          } else {
            console.log(`✅ Added column: ${column.split(' ')[0]}`);
          }
        } catch (e) {
          console.log(`Column ${column.split(' ')[0]} already exists or error:`, e.message);
        }
      }

    } else {
      console.log('✅ Schema fixes applied successfully:', data);
    }

  } catch (error) {
    console.error('❌ Failed to apply schema fixes:', error.message);

    // Manual fixes as fallback
    console.log('🔄 Attempting manual column fixes...');

    try {
      // Check if work_session_id exists
      const { data: tableInfo } = await supabase
        .from('information_schema.columns')
        .select('column_name')
        .eq('table_name', 'screenshots')
        .eq('table_schema', 'public');

      const hasWorkSessionId = tableInfo?.some(col => col.column_name === 'work_session_id');
      const hasSessionId = tableInfo?.some(col => col.column_name === 'session_id');

      console.log(`Has work_session_id: ${hasWorkSessionId}, Has session_id: ${hasSessionId}`);

      if (!hasWorkSessionId && hasSessionId) {
        console.log('🔄 Manual column rename needed - this requires database admin access');
      }

    } catch (infoError) {
      console.log('Could not query table info:', infoError.message);
    }
  }

  console.log('🎯 Schema fix process completed');
}

if (require.main === module) {
  applySchemaFix()
    .then(() => {
      console.log('✅ Database schema update completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Database schema update failed:', error);
      process.exit(1);
    });
}

module.exports = { applySchemaFix };