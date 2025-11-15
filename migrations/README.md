# Database Migrations Guide

## Overview

This directory contains SQL migrations to unify the user data model and fix foreign key references across the database.

## Problem Being Solved

The database had duplicate user tables (`users` and `profiles`) with foreign keys pointing to `profiles`, but the backend code was creating users in the `users` table. This caused FK constraint failures when creating screenshots, sessions, etc.

## ⚠️ CRITICAL: If You Already Ran Migration 002

If you tried to run `002_update_foreign_keys_to_users.sql` and got an FK constraint error, you need to rollback first:

```sql
-- Run the rollback script
\i migrations/000_rollback_002_if_needed.sql
```

This will restore all FKs back to `profiles` so you can run migrations in the correct order.

---

## Migration Order

**IMPORTANT:** Run migrations in this exact order:

### 1. `001_enhance_users_table.sql`
**Purpose:** Add new onboarding fields to the `users` table

**What it does:**
- Adds `username`, `job_title`, `field_of_work`, `experience_level`, `avatar_url` columns
- Creates indexes for performance
- Adds constraints for data validation

**Run this first:**
```sql
-- In Supabase SQL Editor
\i migrations/001_enhance_users_table.sql
```

### 2. `003_migrate_profiles_to_users.sql` ⚠️ **RUN THIS BEFORE 002!**
**Purpose:** Migrate data from `profiles` to `users` table

**What it does:**
- Copies all profile data to users table (including user c032430f-15c5-408e-bfdb-47086e982b70)
- Merges data for users that exist in both tables
- Verifies migration completeness

**WHY RUN THIS SECOND:** Migration 002 updates FKs to point to `users` table. But if user data isn't in `users` yet, FK constraints will fail. This migration ensures all user IDs exist in `users` BEFORE FKs are updated.

**Run this second:**
```sql
-- In Supabase SQL Editor
\i migrations/003_migrate_profiles_to_users.sql
```

**Verify migration:**
```sql
-- Check if all profiles migrated
SELECT COUNT(*) FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM users u WHERE u.id = p.id OR u.auth_user_id = p.id
);
-- Should return 0
```

### 3. `002_update_foreign_keys_to_users.sql`
**Purpose:** Update all FK constraints to reference `users(id)` instead of `profiles(id)`

**What it does:**
- Updates FKs for 15+ tables (screenshots, goals, sessions, etc.)
- Points all `user_id` foreign keys to `users` table
- Uses CASCADE delete for data integrity

**Run this third:**
```sql
-- In Supabase SQL Editor
\i migrations/002_update_foreign_keys_to_users.sql
```

**Verify FKs updated:**
```sql
-- Check foreign keys now point to users
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'user_id'
ORDER BY tc.table_name;
```

### 4. Drop `profiles` table (Manual)

After verifying all migrations succeeded:

```sql
-- Verify no FKs reference profiles
SELECT
  tc.table_name,
  tc.constraint_name
FROM information_schema.table_constraints tc
JOIN information_schema.constraint_column_usage ccu
  ON tc.constraint_name = ccu.constraint_name
WHERE ccu.table_name = 'profiles'
  AND tc.constraint_type = 'FOREIGN KEY';
-- Should return 0 rows

-- Drop the profiles table
DROP TABLE IF EXISTS public.profiles CASCADE;
```

## Backend Code Changes

The following code changes have already been made:

### 1. **WorkSessionRepository.js**
```javascript
// Changed from 'work_sessions' to match DB table name
super('screenshot_sessions');
```

### 2. **UserRepository.js**
```javascript
// Updated allowed fields for profile updates
const allowedFields = [
  'full_name', 'given_name', 'family_name', 'username',
  'job_title', 'company', 'field_of_work', 'experience_level',
  'occupation', 'age', 'use_case', 'terms_accepted'
  // ... etc
];
```

### 3. **New Onboarding API**
- **Controller:** `src/controllers/OnboardingController.js`
- **Routes:** `src/routes/onboardingRoutes.js`
- **Endpoints:**
  - `GET /api/onboarding/status` - Get onboarding progress
  - `POST /api/onboarding/basic-info` - Update name, username, age
  - `POST /api/onboarding/work-info` - Update company, job title, field
  - `POST /api/onboarding/preferences` - Update use case
  - `POST /api/onboarding/complete` - Mark onboarding done
  - `POST /api/onboarding/skip` - Skip onboarding

## Testing After Migration

### 1. Test OAuth Flow
```bash
# Try logging in with Google OAuth
# Should create user in users table successfully
```

### 2. Test Screenshot Upload
```bash
curl -X POST https://your-api.com/api/screenshots/upload \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "screenshot=@test.png" \
  -F "sessionId=SESSION_ID"
# Should work without FK constraint errors
```

### 3. Test Onboarding
```bash
# Get status
curl https://your-api.com/api/onboarding/status \
  -H "Authorization: Bearer YOUR_TOKEN"

# Update basic info
curl -X POST https://your-api.com/api/onboarding/basic-info \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "full_name": "John Doe",
    "username": "johndoe",
    "age": 28
  }'
```

## Rollback (If Needed)

If something goes wrong:

```sql
-- Restore profiles table from backup
-- Revert FK changes by running 002 migration in reverse

-- Example: Restore one FK
ALTER TABLE screenshots DROP CONSTRAINT screenshots_user_id_fkey;
ALTER TABLE screenshots
  ADD CONSTRAINT screenshots_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES profiles(id);
```

## New User Table Schema

After migration, the `users` table will have:

**Identity:**
- `id` (PK, UUID)
- `auth_user_id` (FK to auth.users)
- `email` (unique)
- `username` (unique, new)

**Personal Info:**
- `full_name`, `given_name`, `family_name`
- `picture_url` / `avatar_url`
- `age`

**Work Info (new fields):**
- `company`
- `job_title`
- `field_of_work`
- `experience_level` (beginner/intermediate/advanced/expert)
- `occupation`

**OAuth:**
- `provider` (google/github)
- `provider_id`

**Onboarding:**
- `onboarding_completed`
- `use_case`
- `terms_accepted`

**Status:**
- `email_verified`, `phone_verified`
- `created_at`, `updated_at`, `last_login_at`
