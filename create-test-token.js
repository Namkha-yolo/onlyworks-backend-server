#!/usr/bin/env node
/**
 * Create a test JWT token for a Supabase user
 *
 * Usage:
 * 1. Get your user_id from Supabase (from auth.users table)
 * 2. Set JWT_SECRET from your .env on Render
 * 3. Run: node create-test-token.js
 */

const jwt = require('jsonwebtoken');

// ============================================
// 🔧 CONFIGURATION - GET THESE FROM RENDER
// ============================================

const JWT_SECRET = 'PASTE_YOUR_JWT_SECRET_FROM_RENDER';  // From Render env vars
const USER_ID = 'PASTE_YOUR_USER_ID_FROM_SUPABASE';      // From Supabase auth.users table

// ============================================

if (JWT_SECRET === 'PASTE_YOUR_JWT_SECRET_FROM_RENDER' || USER_ID === 'PASTE_YOUR_USER_ID_FROM_SUPABASE') {
  console.error('❌ Please edit the configuration at the top of this file!\n');
  console.error('1. Get JWT_SECRET from Render:');
  console.error('   https://dashboard.render.com → your service → Environment');
  console.error('');
  console.error('2. Get USER_ID from Supabase:');
  console.error('   https://supabase.com/dashboard → SQL Editor → Run:');
  console.error('   SELECT id, email FROM auth.users ORDER BY created_at DESC LIMIT 5;');
  console.error('');
  process.exit(1);
}

// Create JWT token
const payload = {
  userId: USER_ID,
  email: 'test@example.com',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24 hours
};

const token = jwt.sign(payload, JWT_SECRET);

console.log('✅ Test JWT Token Created!\n');
console.log('Token:', token);
console.log('\nCopy this token and use it in your test script!\n');
