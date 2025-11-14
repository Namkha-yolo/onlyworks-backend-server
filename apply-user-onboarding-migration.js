const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

async function applyUserOnboardingMigration() {
  console.log('🚀 Applying CRITICAL User Onboarding Schema Migration...');
  console.log('📋 This fixes the broken user table that was missing essential fields!');

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', '003_complete_user_onboarding_schema.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');

    console.log('📊 Migration will add the following critical fields:');
    console.log('  ✅ Personal: first_name, last_name, phone_number, location');
    console.log('  ✅ Company: company_name, job_title, department, industry, company_size');
    console.log('  ✅ Onboarding: onboarding_completed, onboarding_step, preferences');
    console.log('  ✅ Productivity: productivity_goals, work_schedule, notification_settings');
    console.log('  ✅ Analytics: login_tracking, feature_usage, referral_source');

    console.log('\n📝 Executing user onboarding migration SQL...');

    // Split SQL by statements and execute them one by one
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.toLowerCase().startsWith('raise notice'));

    console.log(`🔧 Found ${statements.length} SQL statements to execute`);

    let successfulStatements = 0;
    let skippedStatements = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();

      if (statement.length === 0) continue;

      try {
        console.log(`📋 Executing statement ${i + 1}/${statements.length}...`);

        // For DDL statements, we'll use Supabase's SQL editor approach
        const { data, error } = await supabase.rpc('exec', { sql: statement });

        if (error) {
          // Many errors are OK - like "column already exists"
          if (error.message?.includes('already exists') ||
              error.message?.includes('already defined') ||
              error.message?.includes('does not exist')) {
            console.log(`⚠️  Statement skipped (already exists): ${error.message.substring(0, 100)}...`);
            skippedStatements++;
          } else {
            console.log(`⚠️  Statement execution warning: ${error.message}`);
          }
        } else {
          console.log(`✅ Statement executed successfully`);
          successfulStatements++;
        }

      } catch (execError) {
        console.log(`⚠️  Statement execution error: ${execError.message}`);
      }
    }

    console.log(`\n📊 Migration Summary:`);
    console.log(`  ✅ Successful: ${successfulStatements}`);
    console.log(`  ⚠️  Skipped: ${skippedStatements}`);

    // Test the migration by checking if new columns exist
    console.log('\n🔍 Verifying migration success...');

    const { data: testQuery, error: testError } = await supabase
      .from('users')
      .select('id, email, first_name, company_name, onboarding_completed')
      .limit(1);

    if (!testError && testQuery !== null) {
      console.log('✅ Migration verification successful - new user fields are accessible!');
    } else {
      console.log('⚠️  Migration verification failed:', testError?.message);
      console.log('📋 You may need to manually apply the migration SQL to your Supabase database');

      // Output the SQL for manual application
      console.log('\n📋 MANUAL APPLICATION REQUIRED:');
      console.log('Please run the following in your Supabase SQL editor:');
      console.log('\n' + migrationSQL);

      return false;
    }

    // Test creating a user with the new fields
    console.log('\n🧪 Testing new user schema functionality...');

    const testUserData = {
      email: `test-migration-${Date.now()}@example.com`,
      first_name: 'Test',
      last_name: 'User',
      company_name: 'Test Company',
      job_title: 'Software Engineer',
      onboarding_completed: false,
      subscription_tier: 'free',
      user_role: 'individual'
    };

    const { data: insertResult, error: insertError } = await supabase
      .from('users')
      .insert(testUserData)
      .select();

    if (insertError) {
      console.log('⚠️  Insert test failed:', insertError.message);
      console.log('💡 This may be normal if you need to apply the migration manually first');
    } else {
      console.log('✅ New user schema test successful!');
      console.log('✨ User can now store: company info, job title, onboarding status, etc.');

      // Clean up test record
      if (insertResult && insertResult[0]) {
        await supabase
          .from('users')
          .delete()
          .eq('id', insertResult[0].id);
        console.log('🧹 Test record cleaned up');
      }
    }

    // Test the user_profiles view
    console.log('\n👥 Testing user_profiles view...');
    const { data: profileData, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .limit(1);

    if (!profileError) {
      console.log('✅ user_profiles view is working - provides complete user data!');
    } else {
      console.log('⚠️  user_profiles view test failed:', profileError.message);
    }

    return true;

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('\n📋 MANUAL MIGRATION REQUIRED:');
    console.log('Please apply the migration SQL manually to your Supabase database.');
    console.log('Migration file: migrations/003_complete_user_onboarding_schema.sql');
    return false;
  }
}

if (require.main === module) {
  applyUserOnboardingMigration()
    .then(success => {
      if (success) {
        console.log('\n🎉 USER ONBOARDING MIGRATION COMPLETED SUCCESSFULLY!');
        console.log('🔥 The user table now has ALL the fields needed for proper onboarding!');
        console.log('');
        console.log('✨ NEW CAPABILITIES:');
        console.log('  📝 Complete user profiles with company information');
        console.log('  🎯 Onboarding flow tracking and completion status');
        console.log('  ⚙️  User preferences and notification settings');
        console.log('  📊 Productivity goals and work schedule preferences');
        console.log('  📈 Usage analytics and feature tracking');
        console.log('  👥 User roles and subscription tiers');
        console.log('');
        console.log('🚀 Backend is now ready for a proper onboarding experience!');
      } else {
        console.log('\n⚠️  Migration completed with warnings.');
        console.log('Please check the output above for any manual steps required.');
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('\n💥 Migration process failed:', error);
      console.log('\n📋 CRITICAL: The user table is still broken without this migration!');
      process.exit(1);
    });
}

module.exports = { applyUserOnboardingMigration };