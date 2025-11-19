const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis(process.env.REDIS_URL);

// Real session data from database
const task = {
  session_id: '7fad081f-4a05-4c9e-9c81-512b82f99fb0',
  user_id: 'd87eeaa3-b57a-4d9e-96fc-85bd624e3cc1',
  screenshot_ids: [
    "721d9ad1-12a5-4ebc-94d4-5a7af386cbed",
    "6a41638d-1b2a-4b56-a39e-e7a1bfe0bc8c",
    "0ea06a68-16d1-40cb-8ae4-307f00022008",
    "0cee0b6c-bb6e-4630-adfc-29cc5c9f6236",
    "6c5522ea-d9c0-40ec-8425-2ab810300106",
    "23506419-6d8d-4cfc-8a2c-4efeb6c3f6c0",
    "221fcbcc-d828-428e-ad29-4b7a0824b5f3",
    "6adad911-95fe-4d7d-b14f-7a670215bb15",
    "c26f92d5-aeda-4790-9bde-9468c5b0b7cb",
    "ba9ca08c-d54f-453b-80af-65f802d18a4c",
    "e07207a1-3453-41ce-b947-ae3f9156b5e5",
    "87990e62-a127-40db-a40e-5b9105592088",
    "4cee5a01-affa-4b7e-80a5-1abd7b571717",
    "c8d97252-7db2-4d71-84f2-f204ec7e988f",
    "38f8bc7c-0b58-458f-aa02-e30bcc07ff9e",
    "e16141af-3df0-4cf9-8870-03d55631e267",
    "60d3288f-77a5-48e6-9f68-a8b473421d91",
    "a02fe5f2-d3a3-4519-93be-57de5633754e"
  ],
  timestamp: new Date().toISOString()
};

console.log('🚀 Queueing REAL session for AI analysis:');
console.log('   Session:', task.session_id);
console.log('   User:', task.user_id);
console.log('   Screenshots:', task.screenshot_ids.length);

redis.lpush('session_queue', JSON.stringify(task))
  .then(() => {
    console.log('\n✅ Real session queued successfully!');
    console.log('📊 GPU worker will now:');
    console.log('   1. Download 18 screenshots from Supabase Storage');
    console.log('   2. Analyze with Qwen3-VL-8B (vision model)');
    console.log('   3. Synthesize with Seed-OSS-36B (text model)');
    console.log('   4. Save comprehensive analysis to test_session_reports');
    console.log('\n⏱️  Expected time: ~40-60 seconds (1 batch)');
    redis.quit();
  })
  .catch(err => {
    console.error('❌ Error:', err);
    redis.quit();
  });
