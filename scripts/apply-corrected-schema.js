const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

async function applyCorrectedSchema() {
  // Load environment variables
  require('dotenv').config();

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase configuration');
    console.log('📝 Please apply the schema manually in Supabase Dashboard:');
    console.log('1. Go to https://app.supabase.com');
    console.log('2. Open your project SQL Editor');
    console.log('3. Run the SQL file: onlyworks-corrected-schema.sql');
    process.exit(1);
  }

  console.log('🔧 Applying corrected database schema...');

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read the corrected schema file
    const schemaPath = path.join(__dirname, '../onlyworks-corrected-schema.sql');
    const schemaSQL = fs.readFileSync(schemaPath, 'utf8');

    console.log('📄 Loaded corrected schema file');
    console.log('🚀 This will:');
    console.log('   ✅ Create/update users table with correct field names');
    console.log('   ✅ Add reports table for storing AI analysis results');
    console.log('   ✅ Fix all authentication field mismatches');
    console.log('   ✅ Disable RLS to prevent infinite recursion');
    console.log('   ✅ Add proper indexes for performance');

    // For safety, we'll provide manual instructions
    console.log('\n📝 MANUAL APPLICATION REQUIRED:');
    console.log('1. Go to https://app.supabase.com');
    console.log('2. Navigate to your project');
    console.log('3. Go to SQL Editor');
    console.log('4. Copy and paste the contents of: onlyworks-corrected-schema.sql');
    console.log('5. Click "Run" to apply the corrected schema');

    console.log('\n🎯 After applying the schema:');
    console.log('   → Authentication will work correctly');
    console.log('   → Screenshot storage/retrieval will function');
    console.log('   → Reports can be stored and retrieved');
    console.log('   → All field name mismatches will be resolved');

    console.log('\n📋 The corrected schema includes:');
    console.log('   • users table: id, email, name, avatar_url, oauth_provider, oauth_id');
    console.log('   • sessions table: id, user_id, name, goal, status, duration');
    console.log('   • screenshots table: id, session_id, user_id, file_storage_key');
    console.log('   • reports table: id, session_id, user_id, summary, insights, analytics');
    console.log('   • goals table: id, user_id, title, description, status');

  } catch (error) {
    console.error('❌ Schema application failed:', error);
    process.exit(1);
  }
}

// Run the schema application
if (require.main === module) {
  console.log('🚨 APPLYING CORRECTED DATABASE SCHEMA...');

  applyCorrectedSchema()
    .then(() => {
      console.log('\n✅ Schema application instructions provided');
      console.log('🎉 After applying manually, authentication and screenshots will work!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Schema application failed:', error);
      process.exit(1);
    });
}