-- Migration: Add Terms of Service and Privacy Policy tracking to profiles table
-- Date: 2025-11-20
-- Description: Add columns to track user acceptance of Terms of Service and Privacy Policy

-- Add Terms of Service tracking columns
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS terms_version VARCHAR(50),
ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- Add Privacy Policy tracking columns
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS privacy_accepted BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS privacy_version VARCHAR(50),
ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_profiles_terms_accepted
ON public.profiles (terms_accepted);

CREATE INDEX IF NOT EXISTS idx_profiles_terms_version
ON public.profiles (terms_version);

CREATE INDEX IF NOT EXISTS idx_profiles_privacy_accepted
ON public.profiles (privacy_accepted);

-- Add comments for documentation
COMMENT ON COLUMN public.profiles.terms_accepted IS 'Whether user has accepted Terms of Service';
COMMENT ON COLUMN public.profiles.terms_version IS 'Version of Terms of Service accepted (e.g., 2024-11-02)';
COMMENT ON COLUMN public.profiles.terms_accepted_at IS 'Timestamp when Terms of Service was accepted';
COMMENT ON COLUMN public.profiles.privacy_accepted IS 'Whether user has accepted Privacy Policy';
COMMENT ON COLUMN public.profiles.privacy_version IS 'Version of Privacy Policy accepted (e.g., 2024-11-02)';
COMMENT ON COLUMN public.profiles.privacy_accepted_at IS 'Timestamp when Privacy Policy was accepted';
