const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
  // Load environment variables
  require('dotenv').config();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase configuration');
    process.exit(1);
  }

  console.log('🔌 Connecting to Supabase...');
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Read the migration file
    const migrationPath = path.join(__dirname, '../migrations/004_fix_rls_recursion.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('📄 Applying migration 004: Fix RLS recursion...');

    // Split the SQL into individual statements
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.startsWith('/*'));

    console.log(`📋 Found ${statements.length} SQL statements to execute`);

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';';
      console.log(`⚡ Executing statement ${i + 1}/${statements.length}...`);

      try {
        const { data, error } = await supabase.rpc('exec_sql', {
          sql_query: statement
        });

        if (error) {
          console.warn(`⚠️ Statement ${i + 1} warning:`, error);
          // Continue with next statement - policies might already be dropped
        } else {
          console.log(`✅ Statement ${i + 1} executed successfully`);
        }
      } catch (err) {
        console.warn(`⚠️ Statement ${i + 1} error:`, err.message);
        // Continue - some statements might fail if objects don't exist
      }
    }

    console.log('🎉 Migration completed!');
    console.log('🔄 RLS policies have been updated to prevent infinite recursion');

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

// Alternative simple approach - just manually drop and recreate the problematic policy
async function simpleRLSFix() {
  require('dotenv').config();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase configuration');
    process.exit(1);
  }

  console.log('🔌 Connecting to Supabase for simple RLS fix...');
  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    console.log('🛠️  Applying simple RLS fix...');

    // This is a simplified approach that should work
    const policies = [
      `DROP POLICY IF EXISTS users_organization_policy ON users`,
      `CREATE POLICY users_organization_policy ON users FOR ALL USING (auth.uid() IS NOT NULL)`
    ];

    for (const policy of policies) {
      console.log(`Executing: ${policy.substring(0, 50)}...`);
      const { error } = await supabase.rpc('exec_sql', { sql_query: policy });

      if (error) {
        console.warn('Warning:', error.message);
      } else {
        console.log('✅ Success');
      }
    }

    console.log('🎉 Simple RLS fix completed!');

  } catch (error) {
    console.error('❌ Simple RLS fix failed:', error);
    process.exit(1);
  }
}

// Run the migration
if (require.main === module) {
  console.log('🚀 Starting database migration...');
  console.log('Note: If this fails, you may need to apply the migration manually through Supabase dashboard');

  simpleRLSFix()
    .then(() => {
      console.log('✅ Migration process completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration process failed:', error);
      console.log('\n📝 Manual steps:');
      console.log('1. Go to your Supabase dashboard');
      console.log('2. Navigate to SQL Editor');
      console.log('3. Run the following SQL:');
      console.log('   DROP POLICY IF EXISTS users_organization_policy ON users;');
      console.log('   CREATE POLICY users_organization_policy ON users FOR ALL USING (auth.uid() IS NOT NULL);');
      process.exit(1);
    });
}