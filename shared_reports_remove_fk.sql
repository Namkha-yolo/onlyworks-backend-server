-- Migration: Remove foreign key constraint from shared_reports
-- Date: 2025-11-22
-- Description: Remove FK constraint to allow flexibility with user IDs

-- Drop the existing foreign key constraint
DO $$
BEGIN
    -- Drop foreign key constraint if it exists
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints
               WHERE constraint_name = 'shared_reports_user_id_fkey'
               AND table_name = 'shared_reports') THEN
        ALTER TABLE shared_reports DROP CONSTRAINT shared_reports_user_id_fkey;
    END IF;
END $$;

-- Note: user_id is still indexed for performance but not enforced with FK
