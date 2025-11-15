-- Rollback Script: Revert migration 002 if it partially ran
-- Run this ONLY if migration 002 failed and you need to restore FKs to profiles

BEGIN;

-- Restore all FKs back to profiles(id)

-- 1. admin_actions
ALTER TABLE public.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_admin_user_id_fkey;
ALTER TABLE public.admin_actions DROP CONSTRAINT IF EXISTS admin_actions_target_user_id_fkey;
ALTER TABLE public.admin_actions
  ADD CONSTRAINT admin_actions_admin_user_id_fkey
  FOREIGN KEY (admin_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.admin_actions
  ADD CONSTRAINT admin_actions_target_user_id_fkey
  FOREIGN KEY (target_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. batch_reports
ALTER TABLE public.batch_reports DROP CONSTRAINT IF EXISTS batch_reports_user_id_fkey;
ALTER TABLE public.batch_reports
  ADD CONSTRAINT batch_reports_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 3. email_logs
ALTER TABLE public.email_logs DROP CONSTRAINT IF EXISTS email_logs_user_id_fkey;
ALTER TABLE public.email_logs
  ADD CONSTRAINT email_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 4. goals
ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_user_id_fkey;
ALTER TABLE public.goals
  ADD CONSTRAINT goals_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 5. platform_usage
ALTER TABLE public.platform_usage DROP CONSTRAINT IF EXISTS platform_usage_user_id_fkey;
ALTER TABLE public.platform_usage
  ADD CONSTRAINT platform_usage_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 6. processing_queue
ALTER TABLE public.processing_queue DROP CONSTRAINT IF EXISTS processing_queue_user_id_fkey;
ALTER TABLE public.processing_queue
  ADD CONSTRAINT processing_queue_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 7. reports
ALTER TABLE public.reports DROP CONSTRAINT IF EXISTS reports_user_id_fkey;
ALTER TABLE public.reports
  ADD CONSTRAINT reports_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 8. screenshot_analysis
ALTER TABLE public.screenshot_analysis DROP CONSTRAINT IF EXISTS screenshot_analysis_user_id_fkey;
ALTER TABLE public.screenshot_analysis
  ADD CONSTRAINT screenshot_analysis_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 9. screenshot_sessions
ALTER TABLE public.screenshot_sessions DROP CONSTRAINT IF EXISTS screenshot_sessions_user_id_fkey;
ALTER TABLE public.screenshot_sessions
  ADD CONSTRAINT screenshot_sessions_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 10. screenshots
ALTER TABLE public.screenshots DROP CONSTRAINT IF EXISTS screenshots_user_id_fkey;
ALTER TABLE public.screenshots
  ADD CONSTRAINT screenshots_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 11. session_goals
ALTER TABLE public.session_goals DROP CONSTRAINT IF EXISTS session_goals_user_id_fkey;
ALTER TABLE public.session_goals
  ADD CONSTRAINT session_goals_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 12. session_reports
ALTER TABLE public.session_reports DROP CONSTRAINT IF EXISTS session_reports_user_id_fkey;
ALTER TABLE public.session_reports
  ADD CONSTRAINT session_reports_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 13. session_summaries
ALTER TABLE public.session_summaries DROP CONSTRAINT IF EXISTS session_summaries_user_id_fkey;
ALTER TABLE public.session_summaries
  ADD CONSTRAINT session_summaries_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 14. system_activity_logs
ALTER TABLE public.system_activity_logs DROP CONSTRAINT IF EXISTS system_activity_logs_user_id_fkey;
ALTER TABLE public.system_activity_logs
  ADD CONSTRAINT system_activity_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 15. user_insights
ALTER TABLE public.user_insights DROP CONSTRAINT IF EXISTS user_insights_user_id_fkey;
ALTER TABLE public.user_insights
  ADD CONSTRAINT user_insights_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

COMMIT;

-- After running this, run migrations in correct order:
-- 1. 001_enhance_users_table.sql (already done)
-- 2. 003_migrate_profiles_to_users.sql (run this next)
-- 3. 002_update_foreign_keys_to_users.sql (run this last)
