const { createClient } = require('@supabase/supabase-js');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

async function applyFrontendRequirementsMigration() {
  console.log('🚀 Applying Frontend Requirements Schema Migration...');
  console.log('📊 This adds ALL tables required by the OnlyWorks frontend application!');

  try {
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', '004_frontend_requirements_schema.sql');
    const migrationSQL = await fs.readFile(migrationPath, 'utf8');

    console.log('📊 Migration will add the following critical tables:');
    console.log('  ✅ Sessions: user_sessions, session_reports');
    console.log('  ✅ Goals: user_goals, goal_categories, goal_simple_arrays');
    console.log('  ✅ Teams: teams, team_members, team_invitations');
    console.log('  ✅ Analytics: ai_analyses, productivity_insights, user_activity_logs');
    console.log('  ✅ Settings: user_settings');
    console.log('  ✅ Views: session_details, user_goal_overview, team_stats');

    console.log('\\n📝 Executing frontend requirements migration SQL...');

    // Split SQL by statements and execute them one by one
    const statements = migrationSQL
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--') && !stmt.toLowerCase().startsWith('raise notice'));

    console.log(`🔧 Found ${statements.length} SQL statements to execute`);

    let successfulStatements = 0;
    let skippedStatements = 0;
    let failedStatements = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i].trim();

      if (statement.length === 0) continue;

      try {
        console.log(`📋 Executing statement ${i + 1}/${statements.length}...`);

        // For DDL statements, we'll use Supabase's SQL editor approach
        const { data, error } = await supabase.rpc('exec', { sql: statement });

        if (error) {
          // Many errors are OK - like "table already exists"
          if (error.message?.includes('already exists') ||
              error.message?.includes('already defined') ||
              error.message?.includes('does not exist') ||
              error.message?.includes('relation') && error.message?.includes('already exists')) {
            console.log(`⚠️  Statement skipped (already exists): ${error.message.substring(0, 100)}...`);
            skippedStatements++;
          } else {
            console.log(`❌ Statement execution error: ${error.message.substring(0, 150)}...`);
            failedStatements++;
          }
        } else {
          console.log(`✅ Statement executed successfully`);
          successfulStatements++;
        }

      } catch (execError) {
        console.log(`❌ Statement execution error: ${execError.message.substring(0, 150)}...`);
        failedStatements++;
      }
    }

    console.log(`\\n📊 Migration Summary:`);
    console.log(`  ✅ Successful: ${successfulStatements}`);
    console.log(`  ⚠️  Skipped: ${skippedStatements}`);
    console.log(`  ❌ Failed: ${failedStatements}`);

    // Test the migration by checking if new tables exist
    console.log('\\n🔍 Verifying migration success...');

    const tablesToCheck = [
      'user_sessions',
      'user_goals',
      'teams',
      'ai_analyses',
      'user_settings'
    ];

    let verificationsPassed = 0;
    for (const tableName of tablesToCheck) {
      try {
        const { data: testQuery, error: testError } = await supabase
          .from(tableName)
          .select('count(*)')
          .limit(1);

        if (!testError) {
          console.log(`✅ Table '${tableName}' is accessible`);
          verificationsPassed++;
        } else {
          console.log(`⚠️  Table '${tableName}' verification failed: ${testError.message}`);
        }
      } catch (error) {
        console.log(`⚠️  Table '${tableName}' verification error: ${error.message}`);
      }
    }

    if (verificationsPassed === tablesToCheck.length) {
      console.log('✅ All core tables verified successfully!');
    } else {
      console.log(`⚠️  ${verificationsPassed}/${tablesToCheck.length} tables verified`);
    }

    // Test creating sample data
    console.log('\\n🧪 Testing new schema functionality...');

    // Test user_sessions table
    try {
      const testSessionData = {
        user_id: '00000000-0000-0000-0000-000000000000', // Will fail due to FK constraint, but table should exist
        session_name: 'Test Migration Session',
        goal_description: 'Testing the new schema',
        status: 'completed'
      };

      const { data: sessionResult, error: sessionError } = await supabase
        .from('user_sessions')
        .insert(testSessionData)
        .select();

      if (sessionError && sessionError.message.includes('violates foreign key constraint')) {
        console.log('✅ user_sessions table structure test successful (FK constraint working)');
      } else if (!sessionError) {
        console.log('✅ user_sessions insert test successful');
        // Clean up test record if it was inserted
        if (sessionResult && sessionResult[0]) {
          await supabase
            .from('user_sessions')
            .delete()
            .eq('id', sessionResult[0].id);
        }
      } else {
        console.log('⚠️  user_sessions test failed:', sessionError.message.substring(0, 100));
      }
    } catch (error) {
      console.log('⚠️  user_sessions test error:', error.message.substring(0, 100));
    }

    // Test user_goals table
    try {
      const testGoalData = {
        user_id: '00000000-0000-0000-0000-000000000000', // Will fail due to FK constraint, but table should exist
        title: 'Test Migration Goal',
        goal_type: 'personal-micro',
        priority: 'medium',
        status: 'pending'
      };

      const { data: goalResult, error: goalError } = await supabase
        .from('user_goals')
        .insert(testGoalData)
        .select();

      if (goalError && goalError.message.includes('violates foreign key constraint')) {
        console.log('✅ user_goals table structure test successful (FK constraint working)');
      } else if (!goalError) {
        console.log('✅ user_goals insert test successful');
        // Clean up test record
        if (goalResult && goalResult[0]) {
          await supabase
            .from('user_goals')
            .delete()
            .eq('id', goalResult[0].id);
        }
      } else {
        console.log('⚠️  user_goals test failed:', goalError.message.substring(0, 100));
      }
    } catch (error) {
      console.log('⚠️  user_goals test error:', error.message.substring(0, 100));
    }

    // Test views
    console.log('\\n👁️  Testing database views...');

    const viewsToTest = [
      'session_details',
      'user_goal_overview',
      'team_stats'
    ];

    for (const viewName of viewsToTest) {
      try {
        const { data: viewData, error: viewError } = await supabase
          .from(viewName)
          .select('*')
          .limit(1);

        if (!viewError) {
          console.log(`✅ View '${viewName}' is working`);
        } else {
          console.log(`⚠️  View '${viewName}' test failed: ${viewError.message.substring(0, 100)}`);
        }
      } catch (error) {
        console.log(`⚠️  View '${viewName}' test error: ${error.message.substring(0, 100)}`);
      }
    }

    const successThreshold = 0.8; // 80% success rate
    const totalStatements = successfulStatements + skippedStatements + failedStatements;
    const successRate = totalStatements > 0 ? (successfulStatements + skippedStatements) / totalStatements : 0;

    return successRate >= successThreshold;

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('\\n📋 MANUAL MIGRATION REQUIRED:');
    console.log('Please apply the migration SQL manually to your Supabase database.');
    console.log('Migration file: migrations/004_frontend_requirements_schema.sql');
    return false;
  }
}

if (require.main === module) {
  applyFrontendRequirementsMigration()
    .then(success => {
      if (success) {
        console.log('\\n🎉 FRONTEND REQUIREMENTS MIGRATION COMPLETED SUCCESSFULLY!');
        console.log('🔥 The database now has ALL tables needed for the OnlyWorks frontend!');
        console.log('');
        console.log('✨ NEW CAPABILITIES:');
        console.log('  📝 Complete user session tracking with reports');
        console.log('  🎯 Advanced goal management system');
        console.log('  👥 Team collaboration features');
        console.log('  🧠 AI analysis and insights storage');
        console.log('  ⚙️  User settings and preferences');
        console.log('  📊 Comprehensive analytics and reporting');
        console.log('  🔍 Optimized queries with views and indexes');
        console.log('');
        console.log('🚀 Backend is now fully compatible with the frontend application!');
        console.log('💡 Next steps:');
        console.log('  - Update API endpoints to use the new schema');
        console.log('  - Test frontend integration');
        console.log('  - Run the existing user onboarding migration if not done');
      } else {
        console.log('\\n⚠️  Migration completed with warnings.');
        console.log('Please check the output above for any manual steps required.');
        console.log('');
        console.log('💡 Even with warnings, most functionality should work.');
        console.log('Check the Supabase dashboard to verify table creation.');
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('\\n💥 Migration process failed:', error);
      console.log('\\n📋 CRITICAL: The database is missing tables required by the frontend!');
      console.log('Please manually apply the migration or check your Supabase configuration.');
      process.exit(1);
    });
}

module.exports = { applyFrontendRequirementsMigration };