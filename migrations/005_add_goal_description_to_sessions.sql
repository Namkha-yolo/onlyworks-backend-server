-- ==========================================
-- Migration 005: Add goal_description to screenshot_sessions
-- ==========================================
-- Problem: Backend is trying to insert goal_description into screenshot_sessions
--          but the column doesn't exist, causing session creation to fail
--
-- Error: "Could not find the 'goal_description' column of 'screenshot_sessions'"
--
-- This migration:
-- 1. Adds goal_description column to screenshot_sessions table
-- 2. Refreshes Supabase schema cache
-- 3. Verifies the column was added successfully
-- ==========================================

BEGIN;

-- Step 1: Add goal_description column
ALTER TABLE public.screenshot_sessions
ADD COLUMN IF NOT EXISTS goal_description TEXT;

-- Step 2: Add index for performance (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_screenshot_sessions_goal_description
ON public.screenshot_sessions USING btree (goal_description);

-- Step 3: Verify column was added
DO $$
DECLARE
    column_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'screenshot_sessions'
        AND column_name = 'goal_description'
    ) INTO column_exists;

    IF column_exists THEN
        RAISE NOTICE 'SUCCESS: goal_description column added to screenshot_sessions';
    ELSE
        RAISE EXCEPTION 'FAILED: goal_description column was not added';
    END IF;
END $$;

COMMIT;

-- Step 4: Refresh Supabase schema cache (CRITICAL!)
NOTIFY pgrst, 'reload schema';

-- ==========================================
-- Verification Query (run after migration)
-- ==========================================
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'screenshot_sessions'
-- AND column_name = 'goal_description';
-- -- Should return: goal_description | text | YES
