const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis(process.env.REDIS_URL);

// Real session data from database - Session: 00479e20-d6ca-4eff-acc6-efb1a689682e
const task = {
  session_id: '00479e20-d6ca-4eff-acc6-efb1a689682e',
  user_id: 'd87eeaa3-b57a-4d9e-96fc-85bd624e3cc1',
  screenshot_ids: [
    "2860a9cb-268e-4a32-ab04-2be5eb7114af",
    "e792fc58-f7f4-427a-ab0d-5c51b091e328",
    "1dcd4ad2-ccbb-4e0c-ac9d-7d44e14fe12a",
    "a3a36720-acba-429e-b6dd-a5f39824c6de",
    "319c20cb-c796-402b-87f7-13a7566a52e8",
    "009b8615-a80a-4985-a981-e5b2fc45abf1",
    "45b18426-c712-4f40-924d-b21cf67458a5",
    "59f28b76-e5b4-472f-bda4-d5b6ccff6c75",
    "d92981fd-48af-4d68-8640-6e46eae6e0c9",
    "377661ef-ca09-4c9d-a8ea-357cb5ba6afa",
    "1ce86b7f-111d-4d9f-b776-8b3311a0ba49",
    "8af2d22e-7927-4b9e-b863-8484a48ade43",
    "6371da9d-ac17-475d-949e-8fa2b9a4aad8",
    "dad4b0d6-1a5f-4795-855d-a93fd926e190",
    "ab29f18c-825a-43a1-b355-f975b4bfd4da",
    "20239073-58a2-495b-8a36-b7e5d4b9e5f9",
    "491e4799-482c-4447-a05d-c19b966d277c",
    "334b1814-b188-4553-b466-3ba3dcb3c4b0",
    "5b37788e-eef2-4b80-aa09-5e1a5d9054c4",
    "18ca6fd1-59f4-4839-9841-d83719bf180f",
    "7e0397e3-8cda-4eac-af46-b7b844df17d7",
    "08c242d6-0331-4f36-a2ad-ad5466953869",
    "6a6bffb7-7aee-43e3-8ae0-80d32a1cc3ac",
    "cfbe8d2e-f3d8-4327-aea8-e6a729665e27"
  ],
  timestamp: new Date().toISOString()
};

console.log('🚀 Queueing REAL session for AI analysis:');
console.log('   Session:', task.session_id);
console.log('   User:', task.user_id);
console.log('   Screenshots:', task.screenshot_ids.length);
console.log('   Session Name: Work Session 11/17/2025, 4:28:13 PM');

redis.lpush('session_queue', JSON.stringify(task))
  .then(() => {
    console.log('\n✅ Real session queued successfully!');
    console.log('📊 GPU worker will now:');
    console.log('   1. Download 24 screenshots from Supabase Storage');
    console.log('   2. Analyze with Qwen3-VL-8B (vision model)');
    console.log('   3. Synthesize with Seed-OSS-36B (text model)');
    console.log('   4. Save comprehensive analysis to test_session_reports');
    console.log('\n⏱️  Expected time: ~50 seconds (2 batches of 20+4)');
    redis.quit();
  })
  .catch(err => {
    console.error('❌ Error:', err);
    redis.quit();
  });
