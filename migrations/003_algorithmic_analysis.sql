-- Add algorithmic analysis columns to work_sessions table
-- This migration adds columns for algorithm-based scores and analysis

-- Add algorithmic score columns to work_sessions
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS algorithmic_productivity_score DECIMAL(5,2) NULL CHECK (algorithmic_productivity_score >= 0 AND algorithmic_productivity_score <= 100);
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS algorithmic_focus_score DECIMAL(5,2) NULL CHECK (algorithmic_focus_score >= 0 AND algorithmic_focus_score <= 100);
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS algorithmic_analysis_version VARCHAR(10) DEFAULT '1.0';
ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS algorithmic_analysis_completed_at TIMESTAMP WITH TIME ZONE NULL;

-- Create table for algorithmic analysis results
CREATE TABLE IF NOT EXISTS algorithmic_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_session_id UUID UNIQUE NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Core algorithmic scores
    productivity_score DECIMAL(5,2) NOT NULL CHECK (productivity_score >= 0 AND productivity_score <= 100),
    productivity_factors JSONB NOT NULL DEFAULT '[]',
    focus_score DECIMAL(5,2) NOT NULL CHECK (focus_score >= 0 AND focus_score <= 100),
    focus_factors JSONB NOT NULL DEFAULT '[]',

    -- Session analysis
    session_summary JSONB NULL,
    key_metrics JSONB NULL,
    insights JSONB NULL DEFAULT '[]',

    -- App usage and activity patterns
    app_usage_analysis JSONB NULL DEFAULT '[]',
    activity_patterns JSONB NULL DEFAULT '{}',

    -- Metadata
    algorithm_version VARCHAR(20) NOT NULL DEFAULT '1.0',
    calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for algorithmic analysis
CREATE INDEX IF NOT EXISTS idx_algorithmic_analysis_session ON algorithmic_analysis(work_session_id);
CREATE INDEX IF NOT EXISTS idx_algorithmic_analysis_user_id ON algorithmic_analysis(user_id);
CREATE INDEX IF NOT EXISTS idx_algorithmic_analysis_calculated_at ON algorithmic_analysis(calculated_at DESC);

-- Create table for tracking analysis availability
CREATE TABLE IF NOT EXISTS analysis_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_session_id UUID UNIQUE NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Availability flags
    algorithmic_available BOOLEAN DEFAULT false,
    ai_available BOOLEAN DEFAULT false,

    -- Processing status
    algorithmic_processing_status VARCHAR(20) DEFAULT 'pending' CHECK (algorithmic_processing_status IN ('pending', 'processing', 'completed', 'failed')),
    ai_processing_status VARCHAR(20) DEFAULT 'pending' CHECK (ai_processing_status IN ('pending', 'processing', 'completed', 'failed', 'disabled')),

    -- Error tracking
    algorithmic_error_message TEXT NULL,
    ai_error_message TEXT NULL,

    -- Timestamps
    algorithmic_completed_at TIMESTAMP WITH TIME ZONE NULL,
    ai_completed_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for analysis availability
CREATE INDEX IF NOT EXISTS idx_analysis_availability_session ON analysis_availability(work_session_id);
CREATE INDEX IF NOT EXISTS idx_analysis_availability_user_id ON analysis_availability(user_id);
CREATE INDEX IF NOT EXISTS idx_analysis_availability_status ON analysis_availability(algorithmic_processing_status, ai_processing_status);

-- Enable RLS on new tables
ALTER TABLE algorithmic_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_availability ENABLE ROW LEVEL SECURITY;

-- Add RLS policies
CREATE POLICY "Users can access own algorithmic analysis" ON algorithmic_analysis FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can access own analysis availability" ON analysis_availability FOR ALL USING (user_id = auth.uid());

-- Add triggers for updated_at
CREATE TRIGGER update_analysis_availability_updated_at
    BEFORE UPDATE ON analysis_availability
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to automatically create analysis availability record when session is created
CREATE OR REPLACE FUNCTION create_analysis_availability()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO analysis_availability (work_session_id, user_id)
    VALUES (NEW.id, NEW.user_id);
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to create analysis availability record for new work sessions
CREATE TRIGGER create_analysis_availability_trigger
    AFTER INSERT ON work_sessions
    FOR EACH ROW EXECUTE FUNCTION create_analysis_availability();

-- Function to mark algorithmic analysis as completed
CREATE OR REPLACE FUNCTION mark_algorithmic_analysis_completed()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE analysis_availability
    SET
        algorithmic_available = true,
        algorithmic_processing_status = 'completed',
        algorithmic_completed_at = NOW(),
        updated_at = NOW()
    WHERE work_session_id = NEW.work_session_id;

    -- Also update the work_sessions table
    UPDATE work_sessions
    SET
        algorithmic_productivity_score = NEW.productivity_score,
        algorithmic_focus_score = NEW.focus_score,
        algorithmic_analysis_version = NEW.algorithm_version,
        algorithmic_analysis_completed_at = NOW()
    WHERE id = NEW.work_session_id;

    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to update availability when algorithmic analysis is completed
CREATE TRIGGER mark_algorithmic_analysis_completed_trigger
    AFTER INSERT ON algorithmic_analysis
    FOR EACH ROW EXECUTE FUNCTION mark_algorithmic_analysis_completed();

-- Add comments for documentation
COMMENT ON TABLE algorithmic_analysis IS 'Algorithm-based analysis results that work without AI';
COMMENT ON TABLE analysis_availability IS 'Tracks which types of analysis are available for each session';
COMMENT ON COLUMN work_sessions.algorithmic_productivity_score IS 'Algorithm-calculated productivity score (non-AI)';
COMMENT ON COLUMN work_sessions.algorithmic_focus_score IS 'Algorithm-calculated focus score (non-AI)';

-- Create view for easy querying of session data with all analysis types
CREATE OR REPLACE VIEW work_sessions_with_analysis AS
SELECT
    ws.*,
    aa.algorithmic_available,
    aa.ai_available,
    aa.algorithmic_processing_status,
    aa.ai_processing_status,
    alg.productivity_score as alg_productivity_score,
    alg.focus_score as alg_focus_score,
    alg.session_summary as alg_session_summary,
    alg.insights as alg_insights,
    ss.summary_text as ai_summary_text,
    ss.overall_productivity as ai_productivity_score
FROM work_sessions ws
LEFT JOIN analysis_availability aa ON ws.id = aa.work_session_id
LEFT JOIN algorithmic_analysis alg ON ws.id = alg.work_session_id
LEFT JOIN session_summaries ss ON ws.id = ss.work_session_id;

-- Grant access to the view
-- Note: RLS policies will still apply to the underlying tables