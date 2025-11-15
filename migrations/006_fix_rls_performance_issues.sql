-- ==========================================
-- Migration 006: Fix RLS Performance Issues
-- ==========================================
-- Problem: Multiple RLS performance issues identified:
-- 1. RLS policies using auth.<function>() instead of (select auth.<function>()) causing slow performance
-- 2. Duplicate RLS policies on screenshot_sessions and screenshots tables
-- 3. Duplicate indexes on screenshot_sessions table
--
-- This migration:
-- 1. Drops and recreates RLS policies with optimized (select auth.<function>()) pattern
-- 2. Removes duplicate RLS policies
-- 3. Removes duplicate indexes
-- 4. Ensures each table has clean, optimized RLS policies
-- ==========================================

BEGIN;

-- ==========================================
-- Step 1: Fix profiles table RLS policies
-- ==========================================

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Users can view own profile" ON public.profiles
    FOR SELECT USING (id = (select auth.uid()));

CREATE POLICY "Users can update own profile" ON public.profiles
    FOR UPDATE USING (id = (select auth.uid()));

CREATE POLICY "Users can insert own profile" ON public.profiles
    FOR INSERT WITH CHECK (id = (select auth.uid()));

-- ==========================================
-- Step 2: Fix screenshots table RLS policies (remove duplicates and optimize)
-- ==========================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view own screenshots" ON public.screenshots;
DROP POLICY IF EXISTS "Users can insert own screenshots" ON public.screenshots;
DROP POLICY IF EXISTS "Users can update own screenshots" ON public.screenshots;
DROP POLICY IF EXISTS "Users can manage own screenshots" ON public.screenshots;

-- Create single optimized policy set
CREATE POLICY "Users can view own screenshots" ON public.screenshots
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own screenshots" ON public.screenshots
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own screenshots" ON public.screenshots
    FOR UPDATE USING (user_id = (select auth.uid()));

-- ==========================================
-- Step 3: Fix screenshot_sessions table RLS policies (remove duplicates and optimize)
-- ==========================================

-- Drop all existing policies
DROP POLICY IF EXISTS "Users can view own sessions" ON public.screenshot_sessions;
DROP POLICY IF EXISTS "Users can insert own sessions" ON public.screenshot_sessions;
DROP POLICY IF EXISTS "Users can update own sessions" ON public.screenshot_sessions;
DROP POLICY IF EXISTS "Users can manage own sessions" ON public.screenshot_sessions;

-- Create single optimized policy set
CREATE POLICY "Users can view own sessions" ON public.screenshot_sessions
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own sessions" ON public.screenshot_sessions
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own sessions" ON public.screenshot_sessions
    FOR UPDATE USING (user_id = (select auth.uid()));

-- ==========================================
-- Step 4: Fix system_activity_logs table RLS policies
-- ==========================================

DROP POLICY IF EXISTS "Users can view own activity" ON public.system_activity_logs;
DROP POLICY IF EXISTS "Users can insert own activity" ON public.system_activity_logs;

CREATE POLICY "Users can view own activity" ON public.system_activity_logs
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own activity" ON public.system_activity_logs
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

-- ==========================================
-- Step 5: Fix goals table RLS policies
-- ==========================================

DROP POLICY IF EXISTS "Users can view own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can insert own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can update own goals" ON public.goals;
DROP POLICY IF EXISTS "Users can delete own goals" ON public.goals;

CREATE POLICY "Users can view own goals" ON public.goals
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own goals" ON public.goals
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own goals" ON public.goals
    FOR UPDATE USING (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own goals" ON public.goals
    FOR DELETE USING (user_id = (select auth.uid()));

-- ==========================================
-- Step 6: Fix users table RLS policies
-- ==========================================

DROP POLICY IF EXISTS "Users can view own profile" ON public.users;
DROP POLICY IF EXISTS "Users can update own profile" ON public.users;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.users;

-- Use auth_user_id for users table since it references auth.users(id)
CREATE POLICY "Users can view own profile" ON public.users
    FOR SELECT USING (auth_user_id = (select auth.uid()));

CREATE POLICY "Users can update own profile" ON public.users
    FOR UPDATE USING (auth_user_id = (select auth.uid()));

CREATE POLICY "Users can insert own profile" ON public.users
    FOR INSERT WITH CHECK (auth_user_id = (select auth.uid()));

-- ==========================================
-- Step 7: Fix screenshot_analysis table RLS policies
-- ==========================================

DROP POLICY IF EXISTS "Users can manage own analysis" ON public.screenshot_analysis;

CREATE POLICY "Users can view own analysis" ON public.screenshot_analysis
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own analysis" ON public.screenshot_analysis
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own analysis" ON public.screenshot_analysis
    FOR UPDATE USING (user_id = (select auth.uid()));

-- ==========================================
-- Step 8: Fix session_summaries table RLS policies
-- ==========================================

DROP POLICY IF EXISTS "Users can manage own summaries" ON public.session_summaries;

CREATE POLICY "Users can view own summaries" ON public.session_summaries
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own summaries" ON public.session_summaries
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own summaries" ON public.session_summaries
    FOR UPDATE USING (user_id = (select auth.uid()));

-- ==========================================
-- Step 9: Fix batch_reports table RLS policies
-- ==========================================

DROP POLICY IF EXISTS "Users can manage own batch reports" ON public.batch_reports;

CREATE POLICY "Users can view own batch reports" ON public.batch_reports
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own batch reports" ON public.batch_reports
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own batch reports" ON public.batch_reports
    FOR UPDATE USING (user_id = (select auth.uid()));

-- ==========================================
-- Step 10: Fix session_reports table RLS policies
-- ==========================================

DROP POLICY IF EXISTS "Users can manage own session reports" ON public.session_reports;

CREATE POLICY "Users can view own session reports" ON public.session_reports
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own session reports" ON public.session_reports
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own session reports" ON public.session_reports
    FOR UPDATE USING (user_id = (select auth.uid()));

-- ==========================================
-- Step 11: Fix session_goals table RLS policies
-- ==========================================

DROP POLICY IF EXISTS "Users can manage own goals" ON public.session_goals;

CREATE POLICY "Users can view own goals" ON public.session_goals
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own goals" ON public.session_goals
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own goals" ON public.session_goals
    FOR UPDATE USING (user_id = (select auth.uid()));

CREATE POLICY "Users can delete own goals" ON public.session_goals
    FOR DELETE USING (user_id = (select auth.uid()));

-- ==========================================
-- Step 12: Fix reports table RLS policies
-- ==========================================

DROP POLICY IF EXISTS "Users can manage own reports" ON public.reports;

CREATE POLICY "Users can view own reports" ON public.reports
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own reports" ON public.reports
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own reports" ON public.reports
    FOR UPDATE USING (user_id = (select auth.uid()));

-- ==========================================
-- Step 13: Fix user_insights table RLS policies
-- ==========================================

DROP POLICY IF EXISTS "Users can manage own insights" ON public.user_insights;

CREATE POLICY "Users can view own insights" ON public.user_insights
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own insights" ON public.user_insights
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own insights" ON public.user_insights
    FOR UPDATE USING (user_id = (select auth.uid()));

-- ==========================================
-- Step 14: Fix platform_usage table RLS policies
-- ==========================================

DROP POLICY IF EXISTS "Users can manage own platform usage" ON public.platform_usage;

CREATE POLICY "Users can view own platform usage" ON public.platform_usage
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own platform usage" ON public.platform_usage
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own platform usage" ON public.platform_usage
    FOR UPDATE USING (user_id = (select auth.uid()));

-- ==========================================
-- Step 15: Fix processing_queue table RLS policies
-- ==========================================

DROP POLICY IF EXISTS "Users can manage own processing queue" ON public.processing_queue;

CREATE POLICY "Users can view own processing queue" ON public.processing_queue
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own processing queue" ON public.processing_queue
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

CREATE POLICY "Users can update own processing queue" ON public.processing_queue
    FOR UPDATE USING (user_id = (select auth.uid()));

-- ==========================================
-- Step 16: Fix email_logs table RLS policies
-- ==========================================

DROP POLICY IF EXISTS "Users can view own email logs" ON public.email_logs;

CREATE POLICY "Users can view own email logs" ON public.email_logs
    FOR SELECT USING (user_id = (select auth.uid()));

-- ==========================================
-- Step 17: Fix admin_actions table RLS policies
-- ==========================================

DROP POLICY IF EXISTS "Admins can view own actions" ON public.admin_actions;

-- For admin_actions, use admin_user_id column
CREATE POLICY "Admins can view own actions" ON public.admin_actions
    FOR SELECT USING (admin_user_id = (select auth.uid()));

-- ==========================================
-- Step 18: Fix user_settings table RLS policies
-- ==========================================

DROP POLICY IF EXISTS "Users can view own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can update own settings" ON public.user_settings;
DROP POLICY IF EXISTS "Users can insert own settings" ON public.user_settings;

CREATE POLICY "Users can view own settings" ON public.user_settings
    FOR SELECT USING (user_id = (select auth.uid()));

CREATE POLICY "Users can update own settings" ON public.user_settings
    FOR UPDATE USING (user_id = (select auth.uid()));

CREATE POLICY "Users can insert own settings" ON public.user_settings
    FOR INSERT WITH CHECK (user_id = (select auth.uid()));

-- ==========================================
-- Step 19: Remove duplicate indexes
-- ==========================================

-- Remove duplicate index on screenshot_sessions (keep the more descriptive one)
DROP INDEX IF EXISTS public.idx_screenshot_sessions_user;
-- Keep: idx_screenshot_sessions_user_id

COMMIT;

-- ==========================================
-- Step 20: Refresh Supabase schema cache
-- ==========================================
NOTIFY pgrst, 'reload schema';

-- ==========================================
-- Verification Queries (run after migration)
-- ==========================================
-- Check for remaining duplicate policies:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- ORDER BY tablename, cmd, policyname;

-- Check for duplicate indexes:
-- SELECT schemaname, tablename, indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'screenshot_sessions'
-- ORDER BY tablename, indexname;

-- Test query performance (should be much faster now):
-- EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM screenshot_sessions WHERE user_id = auth.uid() LIMIT 10;