const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

async function fixAuthUserIds() {
  try {
    console.log('Fetching users without auth_user_id...');

    // Get all users where auth_user_id is null
    const { data: users, error: fetchError } = await supabaseAdmin
      .from('users')
      .select('id, email, auth_user_id')
      .is('auth_user_id', null);

    if (fetchError) {
      console.error('Error fetching users:', fetchError);
      return;
    }

    if (!users || users.length === 0) {
      console.log('No users found with null auth_user_id');
      return;
    }

    console.log(`Found ${users.length} users without auth_user_id`);

    // Update each user to set auth_user_id = id
    for (const user of users) {
      console.log(`Updating user ${user.id} (${user.email})...`);

      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({ auth_user_id: user.id })
        .eq('id', user.id);

      if (updateError) {
        console.error(`Error updating user ${user.id}:`, updateError);
      } else {
        console.log(`✓ Updated user ${user.id}`);
      }
    }

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run the migration
fixAuthUserIds();