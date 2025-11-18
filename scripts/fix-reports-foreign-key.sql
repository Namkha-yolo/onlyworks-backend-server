-- Remove the foreign key constraint from reports.user_id to auth.users
-- This allows OAuth users (who don't exist in auth.users) to have reports

-- First, drop the existing foreign key constraint
ALTER TABLE reports
DROP CONSTRAINT IF EXISTS reports_user_id_fkey;

-- Add a new foreign key constraint to public.users instead
ALTER TABLE reports
ADD CONSTRAINT reports_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES public.users(id)
ON DELETE CASCADE;

-- Now reports.user_id will reference public.users(id) instead of auth.users(id)
-- This makes it compatible with OAuth users