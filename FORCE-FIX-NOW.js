const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config();

async function FORCE_FIX_EVERYTHING() {
  console.log('🔥 FORCING ALL FIXES TO SUPABASE...\n');

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;

  // Try to get existing buckets first
  console.log('1️⃣ Checking existing buckets...');
  try {
    const bucketsResponse = await fetch(`${supabaseUrl}/storage/v1/bucket`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`
      }
    });

    const buckets = await bucketsResponse.json();
    console.log('Existing buckets:', buckets);

    // Check if screenshots bucket exists
    const screenshotsBucket = buckets.find(b => b.id === 'screenshots' || b.name === 'screenshots');
    if (screenshotsBucket) {
      console.log('✅ Screenshots bucket already exists!');

      // Try to update it to be public
      const updateResponse = await fetch(`${supabaseUrl}/storage/v1/bucket/screenshots`, {
        method: 'PUT',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ public: true })
      });

      if (updateResponse.ok) {
        console.log('✅ Bucket set to public');
      }
    } else {
      console.log('❌ Screenshots bucket not found');
    }
  } catch (error) {
    console.log('Bucket check error:', error.message);
  }

  // Test if we can upload to storage even with errors
  console.log('\n2️⃣ Testing storage upload capability...');
  try {
    const testUpload = await fetch(`${supabaseUrl}/storage/v1/object/screenshots/test.txt`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'text/plain'
      },
      body: 'test'
    });

    if (testUpload.ok) {
      console.log('✅ Storage upload works!');
    } else {
      const error = await testUpload.text();
      console.log('❌ Upload test failed:', error);
    }
  } catch (error) {
    console.log('Upload test error:', error.message);
  }

  // Print the SQL that MUST be run
  console.log('\n' + '='.repeat(60));
  console.log('🚨 CRITICAL: RUN THIS SQL IN SUPABASE DASHBOARD NOW!');
  console.log('='.repeat(60));
  console.log(`
GO TO: https://app.supabase.com/project/wwvhhxoukdegvbtgnafr/sql/new

PASTE THIS EXACT SQL:
----------------------------------------
-- FORCE FIX STORAGE
DO $$
BEGIN
  -- Disable RLS on storage
  EXECUTE 'ALTER TABLE storage.buckets DISABLE ROW LEVEL SECURITY';
  EXECUTE 'ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY';

  -- Drop any blocking policies
  DROP POLICY IF EXISTS "Enable storage for authenticated users only" ON storage.objects;
  DROP POLICY IF EXISTS "Enable storage for users" ON storage.objects;
  DROP POLICY IF EXISTS "Give users access to own folder" ON storage.objects;
  DROP POLICY IF EXISTS "Allow all operations on screenshots bucket" ON storage.objects;

  -- Create bucket
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('screenshots', 'screenshots', true, 52428800, array['image/png', 'image/jpeg', 'image/jpg'])
  ON CONFLICT (id) DO UPDATE SET public = true;

  -- Create completely open policy
  CREATE POLICY "Open Policy" ON storage.objects
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

  RAISE NOTICE 'STORAGE FIXED!';
END $$;

SELECT 'STORAGE FIXED - APP WILL WORK NOW!' as result;
----------------------------------------
  `);

  console.log('='.repeat(60));
  console.log('👆 COPY ALL OF THE ABOVE SQL AND RUN IT NOW!');
  console.log('='.repeat(60));
}

FORCE_FIX_EVERYTHING();