const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis(process.env.REDIS_URL);

const task = {
  session_id: 'test-session-' + Date.now(),
  user_id: 'test-user-123',
  screenshot_ids: [
    'screenshot-1',
    'screenshot-2',
    'screenshot-3'
  ],
  timestamp: new Date().toISOString()
};

console.log('📤 Queuing task:', task);

redis.lpush('session_queue', JSON.stringify(task))
  .then(() => {
    console.log('✅ Task queued successfully!');
    console.log('Session ID:', task.session_id);
    redis.quit();
  })
  .catch(err => {
    console.error('❌ Error:', err);
    redis.quit();
  });
