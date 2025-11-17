-- Migration: Update reports table for session-based comprehensive reports
-- This replaces the existing coding-focused reports with comprehensive session reports

-- Step 1: Backup existing reports data (optional - for safety)
-- CREATE TABLE IF NOT EXISTS reports_backup AS SELECT * FROM reports;

-- Step 2: Drop existing reports table and recreate with new structure
DROP TABLE IF EXISTS reports CASCADE;

-- Step 3: Create new reports table for comprehensive session reports
CREATE TABLE IF NOT EXISTS reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES screenshot_sessions(id) ON DELETE CASCADE,
    report_date DATE NOT NULL DEFAULT CURRENT_DATE,
    title VARCHAR(255),
    comprehensive_report JSONB NOT NULL,
    executive_summary TEXT,
    productivity_score DECIMAL(3,2),
    focus_score DECIMAL(3,2),
    session_duration_minutes INTEGER,
    screenshot_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Ensure one report per session
    UNIQUE(session_id)
);

-- Step 4: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_session_id ON reports(session_id);
CREATE INDEX IF NOT EXISTS idx_reports_date ON reports(report_date DESC);
CREATE INDEX IF NOT EXISTS idx_reports_user_date ON reports(user_id, report_date DESC);

-- Step 5: Enable Row Level Security (RLS)
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies for reports
CREATE POLICY "Users can view their own reports" ON reports
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reports" ON reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reports" ON reports
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reports" ON reports
    FOR DELETE USING (auth.uid() = user_id);

-- Step 7: Create updated_at trigger
CREATE TRIGGER update_reports_updated_at
    BEFORE UPDATE ON reports
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Step 8: Add comments for documentation
COMMENT ON TABLE reports IS 'Stores comprehensive session reports with AI analysis results';
COMMENT ON COLUMN reports.comprehensive_report IS 'Full JSON report with detailed analysis, activities, insights, and recommendations';
COMMENT ON COLUMN reports.executive_summary IS 'Brief summary of the session for quick overview';
COMMENT ON COLUMN reports.session_id IS 'Links to the work session this report analyzes';
COMMENT ON COLUMN reports.productivity_score IS 'Overall productivity score from 0.00 to 1.00';
COMMENT ON COLUMN reports.focus_score IS 'Focus/attention score from 0.00 to 1.00';