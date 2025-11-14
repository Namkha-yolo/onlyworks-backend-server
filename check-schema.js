const { getSupabaseClient } = require('./src/config/database');

async function checkScreenshotsTable() {
  console.log('🔍 Checking screenshots table schema...');

  const supabase = getSupabaseClient();

  if (!supabase) {
    console.log('❌ No Supabase client available');
    return;
  }

  try {
    // Try to get a single screenshot to see the actual columns
    console.log('📋 Fetching sample record to see actual columns...');

    const { data, error } = await supabase
      .from('screenshots')
      .select('*')
      .limit(1);

    if (error) {
      console.log('⚠️  Query error:', error.message);

      // Try specific columns to see which ones exist
      console.log('\n🔍 Testing specific columns...');

      const testColumns = ['session_id', 'work_session_id', 'user_id', 'timestamp'];

      for (const col of testColumns) {
        try {
          const { error: colError } = await supabase
            .from('screenshots')
            .select(col)
            .limit(1);

          if (colError) {
            console.log(`❌ ${col}: ${colError.message}`);
          } else {
            console.log(`✅ ${col}: exists`);
          }
        } catch (e) {
          console.log(`❌ ${col}: ${e.message}`);
        }
      }

    } else {
      console.log('✅ Query successful!');
      console.log('📊 Sample record:', data[0] ? Object.keys(data[0]).join(', ') : 'No records found');
      if (data[0]) {
        console.log('📋 Available columns:');
        Object.keys(data[0]).forEach(col => {
          console.log(`   - ${col}: ${typeof data[0][col]} (${data[0][col]?.toString().substring(0, 50)})`);
        });
      }
    }

  } catch (error) {
    console.log('❌ Error checking table:', error.message);
  }
}

if (require.main === module) {
  checkScreenshotsTable()
    .then(() => {
      console.log('✅ Schema check completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Schema check failed:', error);
      process.exit(1);
    });
}

module.exports = { checkScreenshotsTable };