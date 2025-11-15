-- Migration 003: Migrate data from profiles to users and drop profiles table
-- Description: Copy any existing profile data to users table, then drop profiles

-- IMPORTANT: Run this BEFORE migration 002 (FK updates)
-- This ensures all user data is in the users table before FKs are updated

BEGIN;

-- Step 1: Migrate data from profiles to users (if profiles has data that users doesn't)
-- Only insert profiles that don't already exist in users table (by ID or EMAIL)
INSERT INTO public.users (
  id,
  auth_user_id,
  email,
  full_name,
  avatar_url,
  onboarding_completed,
  created_at,
  updated_at
)
SELECT
  p.id,
  p.id as auth_user_id,  -- profiles.id is linked to auth.users.id
  p.email,
  COALESCE(p.full_name, p.name) as full_name,
  p.avatar_url,
  p.onboarding_completed,
  p.created_at,
  p.updated_at
FROM public.profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM public.users u
  WHERE u.id = p.id
     OR u.auth_user_id = p.id
     OR u.email = p.email  -- Also check email to avoid duplicates
)
ON CONFLICT (id) DO NOTHING;  -- Skip if ID conflict
-- Note: Email conflicts are prevented by WHERE clause above

-- Step 2: Update users table with any additional data from profiles
-- (For users that exist in both tables, merge the data)
-- This handles cases like kewadallay@gmail.com where user exists in both tables
UPDATE public.users u
SET
  avatar_url = COALESCE(u.avatar_url, p.avatar_url),
  full_name = COALESCE(u.full_name, p.full_name, p.name),
  onboarding_completed = COALESCE(u.onboarding_completed, p.onboarding_completed),
  updated_at = GREATEST(u.updated_at, p.updated_at)
FROM public.profiles p
WHERE u.auth_user_id = p.id OR u.id = p.id OR u.email = p.email;

-- Step 3: Verify migration
-- This will fail if there are orphaned records
DO $$
DECLARE
  orphaned_count INTEGER;
BEGIN
  -- Check for profiles not migrated to users (by ID, auth_user_id, or email)
  SELECT COUNT(*) INTO orphaned_count
  FROM public.profiles p
  WHERE NOT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p.id
       OR u.auth_user_id = p.id
       OR u.email = p.email
  );

  IF orphaned_count > 0 THEN
    RAISE EXCEPTION 'Migration incomplete: % profiles not migrated to users', orphaned_count;
  END IF;

  RAISE NOTICE 'Data migration successful. All profiles migrated to users.';
END $$;

-- Step 4: Drop profiles table (after FK migration 002 is complete)
-- COMMENTED OUT: Uncomment this after running migration 002
-- DROP TABLE IF EXISTS public.profiles CASCADE;

COMMIT;

-- NOTE: After running migrations 001, 003, and 002 in that order:
-- 1. Uncomment the DROP TABLE line above
-- 2. Run this migration again to clean up the profiles table
