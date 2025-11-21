-- Update user_settings table to include proper columns for frontend settings
-- Run this in Supabase SQL Editor

-- First, check if the table exists and its current structure
-- If the table doesn't have the individual columns, add them

ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS username VARCHAR(255),
ADD COLUMN IF NOT EXISTS email VARCHAR(255),
ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS theme VARCHAR(20) DEFAULT 'light',
ADD COLUMN IF NOT EXISTS language VARCHAR(10) DEFAULT 'en',
ADD COLUMN IF NOT EXISTS email_notifications BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS push_notifications BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS marketing_emails BOOLEAN DEFAULT false;

-- Add created_at if it doesn't exist
ALTER TABLE user_settings
ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Update the updated_at column to have a default value
ALTER TABLE user_settings
ALTER COLUMN updated_at SET DEFAULT NOW();

-- Create an index on user_id for better performance
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Add a comment to the table
COMMENT ON TABLE user_settings IS 'User preferences and settings';

-- Display the new table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'user_settings'
AND table_schema = 'public'
ORDER BY ordinal_position;