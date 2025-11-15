-- Migration 001: Enhance users table with onboarding fields
-- Description: Add comprehensive onboarding fields to users table

-- Add new columns for onboarding
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS job_title VARCHAR(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS field_of_work VARCHAR(255);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS experience_level VARCHAR(50);
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Add constraints
ALTER TABLE public.users ADD CONSTRAINT users_username_length CHECK (char_length(username) >= 3);
ALTER TABLE public.users ADD CONSTRAINT users_experience_level_check
  CHECK (experience_level IN ('beginner', 'intermediate', 'advanced', 'expert', NULL));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users USING btree (username);
CREATE INDEX IF NOT EXISTS idx_users_company ON public.users USING btree (company);
CREATE INDEX IF NOT EXISTS idx_users_field_of_work ON public.users USING btree (field_of_work);
CREATE INDEX IF NOT EXISTS idx_users_onboarding_completed ON public.users USING btree (onboarding_completed);

-- Add comment
COMMENT ON COLUMN public.users.username IS 'Unique username/handle for the user';
COMMENT ON COLUMN public.users.job_title IS 'User job title/position';
COMMENT ON COLUMN public.users.field_of_work IS 'Industry or field of work (e.g., Software, Marketing, Design)';
COMMENT ON COLUMN public.users.experience_level IS 'Professional experience level: beginner, intermediate, advanced, expert';
