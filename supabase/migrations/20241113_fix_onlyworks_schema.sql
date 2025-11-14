-- Fix OnlyWorks Database Schema
-- Migration: 20241113_fix_onlyworks_schema
-- Description: Fix critical schema mismatches for AI analysis and reporting

-- 1. Fix screenshots table column name mismatch
-- Backend expects work_session_id but database has session_id
ALTER TABLE screenshots RENAME COLUMN session_id TO work_session_id;

-- 2. Ensure all required columns exist for screenshots
ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS ai_analysis_completed BOOLEAN DEFAULT FALSE;
ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS processed_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS batch_report_id UUID;
ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS retention_expires_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS ocr_text TEXT;
ALTER TABLE screenshots ADD COLUMN IF NOT EXISTS capture_trigger TEXT DEFAULT 'timer_15s';

-- 3. Create analysis_reports table if not exists
CREATE TABLE IF NOT EXISTS analysis_reports (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    session_id UUID NOT NULL,
    user_id UUID NOT NULL,
    analysis_type VARCHAR(50) DEFAULT 'standard', -- 'batch', 'final', 'standard'
    analysis_data JSONB NOT NULL DEFAULT '{}',
    work_completed JSONB DEFAULT '[]',
    alignment_score DECIMAL(3,2) DEFAULT 0,
    productivity_insights TEXT,
    focus_analysis TEXT,
    screenshot_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create user_settings table for /users/settings endpoint
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id)
);

-- 5. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_screenshots_work_session ON screenshots(work_session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_screenshots_ai_analysis ON screenshots(ai_analysis_completed);
CREATE INDEX IF NOT EXISTS idx_analysis_reports_session ON analysis_reports(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_reports_user ON analysis_reports(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_settings_user ON user_settings(user_id);

-- 6. Grant permissions
GRANT ALL ON analysis_reports TO anon, authenticated;
GRANT ALL ON user_settings TO anon, authenticated;

-- 7. Add helpful comments
COMMENT ON TABLE analysis_reports IS 'Stores AI analysis results for screenshot batches and sessions';
COMMENT ON TABLE user_settings IS 'User-specific settings and preferences storage';
COMMENT ON COLUMN screenshots.work_session_id IS 'References work_sessions(id) - renamed from session_id';
COMMENT ON COLUMN screenshots.ai_analysis_completed IS 'Tracks whether screenshot has been processed by AI';
COMMENT ON COLUMN screenshots.capture_trigger IS 'What triggered the screenshot capture (timer_15s, manual, etc)';

-- Verification query
SELECT
    'OnlyWorks schema migration completed successfully! Tables: ' ||
    string_agg(tablename, ', ') as status
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN ('screenshots', 'analysis_reports', 'goals', 'user_settings');