-- Migration: Add batch processing tables and columns
-- This adds the required database schema for batch processing and report generation

-- 1. Create batch_reports table
CREATE TABLE IF NOT EXISTS batch_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    screenshot_count INTEGER NOT NULL DEFAULT 0,
    analysis_type VARCHAR(50) NOT NULL DEFAULT 'standard',
    analysis_result JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create shared_reports table
CREATE TABLE IF NOT EXISTS shared_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    share_token VARCHAR(255) UNIQUE NOT NULL,
    summary_data JSONB,
    expires_at TIMESTAMPTZ,
    include_private_data BOOLEAN DEFAULT FALSE,
    share_with_team BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Add missing columns to screenshots table
DO $$
BEGIN
    -- Add ai_analysis_completed column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'screenshots' AND column_name = 'ai_analysis_completed') THEN
        ALTER TABLE screenshots ADD COLUMN ai_analysis_completed BOOLEAN DEFAULT FALSE;
    END IF;

    -- Add processed_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'screenshots' AND column_name = 'processed_at') THEN
        ALTER TABLE screenshots ADD COLUMN processed_at TIMESTAMPTZ;
    END IF;

    -- Add batch_report_id column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'screenshots' AND column_name = 'batch_report_id') THEN
        ALTER TABLE screenshots ADD COLUMN batch_report_id UUID REFERENCES batch_reports(id) ON DELETE SET NULL;
    END IF;

    -- Add ocr_text column if it doesn't exist (for OCR analysis)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'screenshots' AND column_name = 'ocr_text') THEN
        ALTER TABLE screenshots ADD COLUMN ocr_text TEXT;
    END IF;

    -- Add retention_expires_at column if it doesn't exist (for cleanup)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'screenshots' AND column_name = 'retention_expires_at') THEN
        ALTER TABLE screenshots ADD COLUMN retention_expires_at TIMESTAMPTZ;
    END IF;
END $$;

-- 4. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_batch_reports_session_user ON batch_reports(session_id, user_id);
CREATE INDEX IF NOT EXISTS idx_batch_reports_created_at ON batch_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shared_reports_user_id ON shared_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_shared_reports_share_token ON shared_reports(share_token);
CREATE INDEX IF NOT EXISTS idx_shared_reports_expires_at ON shared_reports(expires_at);
CREATE INDEX IF NOT EXISTS idx_screenshots_ai_analysis ON screenshots(ai_analysis_completed);
CREATE INDEX IF NOT EXISTS idx_screenshots_batch_report ON screenshots(batch_report_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_processed_at ON screenshots(processed_at);

-- 5. Enable Row Level Security (RLS) on new tables
ALTER TABLE batch_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_reports ENABLE ROW LEVEL SECURITY;

-- 6. Create RLS policies for batch_reports
CREATE POLICY "Users can view their own batch reports" ON batch_reports
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own batch reports" ON batch_reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own batch reports" ON batch_reports
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own batch reports" ON batch_reports
    FOR DELETE USING (auth.uid() = user_id);

-- 7. Create RLS policies for shared_reports
CREATE POLICY "Users can view their own shared reports" ON shared_reports
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own shared reports" ON shared_reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own shared reports" ON shared_reports
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own shared reports" ON shared_reports
    FOR DELETE USING (auth.uid() = user_id);

-- 8. Allow public access to shared reports via share_token (for sharing functionality)
CREATE POLICY "Allow public access to non-expired shared reports" ON shared_reports
    FOR SELECT USING (
        expires_at IS NULL OR expires_at > NOW()
    );

-- 9. Create updated_at triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_batch_reports_updated_at
    BEFORE UPDATE ON batch_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_shared_reports_updated_at
    BEFORE UPDATE ON shared_reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 10. Add comments for documentation
COMMENT ON TABLE batch_reports IS 'Stores results of batch AI analysis on screenshots';
COMMENT ON TABLE shared_reports IS 'Stores shareable session reports with configurable access';
COMMENT ON COLUMN screenshots.ai_analysis_completed IS 'Indicates if AI analysis has been completed';
COMMENT ON COLUMN screenshots.processed_at IS 'Timestamp when screenshot was processed';
COMMENT ON COLUMN screenshots.batch_report_id IS 'Links to the batch report that processed this screenshot';
COMMENT ON COLUMN screenshots.ocr_text IS 'Extracted text content from OCR analysis';
COMMENT ON COLUMN screenshots.retention_expires_at IS 'Expiration date for automatic cleanup';