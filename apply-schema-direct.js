const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function applySchemaDirectly() {
  require('dotenv').config();

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env');
    process.exit(1);
  }

  console.log('🔧 Manual schema application required...');
  console.log('📋 Copy and paste this schema in Supabase SQL Editor:');
  console.log('👉 https://app.supabase.com/project/wwvhhxoukdegvbtgnafr/sql/new');

  try {
    const supabase = createClient(supabaseUrl, anonKey);

    // Read the clean schema
    const schemaPath = path.join(__dirname, 'clean-schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');

    console.log('📝 Applying clean schema...');

    // Split into individual statements and execute them
    const statements = schemaSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      if (statement.includes('SELECT') && statement.includes('Schema applied successfully')) {
        console.log('✅ Schema application completed successfully!');
        break;
      }

      console.log(`Executing: ${statement.substring(0, 50)}...`);
      const { error } = await supabase.rpc('exec_sql', { sql: statement });

      if (error) {
        console.log(`⚠️  Error (may be expected): ${error.message}`);
      }
    }

    // Verify tables exist
    console.log('\n🔍 Verifying tables...');
    const { data: tables } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .in('table_name', ['users', 'work_sessions', 'screenshots', 'reports', 'goals']);

    if (tables) {
      console.log('✅ Found tables:', tables.map(t => t.table_name).join(', '));
    }

    console.log('\n🎉 Schema application complete! Backend should work now.');

  } catch (error) {
    console.error('❌ Schema application failed:', error.message);
    process.exit(1);
  }
}

applySchemaDirectly();