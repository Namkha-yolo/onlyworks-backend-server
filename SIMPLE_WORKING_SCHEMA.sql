-- ========================================
-- ONLYWORKS DATABASE SCHEMA - WORKING VERSION
-- Simplified to avoid column conflicts
-- ========================================

-- Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========================================
-- 1. CORE TABLES
-- ========================================

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    display_name VARCHAR(255),
    avatar_url TEXT,
    timezone VARCHAR(50) DEFAULT 'UTC',
    oauth_provider VARCHAR(50),
    oauth_id VARCHAR(255),
    oauth_provider_id VARCHAR(255),
    status VARCHAR(20) DEFAULT 'active',
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    team_code VARCHAR(50) UNIQUE,
    invite_code VARCHAR(50) UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Team Members table
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member',
    status VARCHAR(20) DEFAULT 'active',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- Goal Categories table
CREATE TABLE IF NOT EXISTS goal_categories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_personal BOOLEAN NOT NULL DEFAULT true,
    is_micro BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default goal categories
INSERT INTO goal_categories (name, description, is_personal, is_micro) VALUES
    ('personal-micro', 'Personal short-term goals', true, true),
    ('personal-macro', 'Personal long-term goals', true, false),
    ('team-micro', 'Team short-term goals', false, true),
    ('team-macro', 'Team long-term goals', false, false)
ON CONFLICT (name) DO NOTHING;

-- Goals table
CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    category_id UUID REFERENCES goal_categories(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    goal_type VARCHAR(50) NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    progress_percentage INTEGER DEFAULT 0,
    target_completion_date DATE,
    due_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Goals view
CREATE VIEW user_goals AS SELECT * FROM goals WHERE team_id IS NULL;

-- Work Sessions table
CREATE TABLE IF NOT EXISTS work_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
    session_name VARCHAR(255) NOT NULL DEFAULT 'Work Session',
    goal_description TEXT,
    goal_id UUID REFERENCES goals(id),
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    end_time TIMESTAMP WITH TIME ZONE,
    duration_minutes INTEGER DEFAULT 0,
    duration_seconds INTEGER DEFAULT 0,
    planned_duration_minutes INTEGER,
    status VARCHAR(20) DEFAULT 'active',
    productivity_score DECIMAL(3,1),
    focus_score DECIMAL(3,1),
    workspace_context JSONB DEFAULT '{}',
    interruptions_count INTEGER DEFAULT 0,
    break_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Sessions view
CREATE VIEW user_sessions AS SELECT * FROM work_sessions;

-- Sessions view
CREATE VIEW sessions AS SELECT * FROM work_sessions;

-- Screenshots table
CREATE TABLE IF NOT EXISTS screenshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    work_session_id UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    session_id UUID REFERENCES work_sessions(id) ON DELETE CASCADE,
    file_storage_key TEXT NOT NULL,
    file_path TEXT,
    supabase_url TEXT,
    file_size_bytes BIGINT,
    file_size BIGINT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    window_title TEXT,
    active_app VARCHAR(255),
    capture_trigger TEXT DEFAULT 'timer_15s',
    trigger_type VARCHAR(50),
    trigger_details JSONB DEFAULT '{}',
    mouse_x INTEGER,
    mouse_y INTEGER,
    screen_width INTEGER,
    screen_height INTEGER,
    interaction_type VARCHAR(50),
    interaction_data JSONB DEFAULT '{}',
    image_hash VARCHAR(128),
    metadata JSONB DEFAULT '{}',
    ai_analysis_completed BOOLEAN DEFAULT FALSE,
    analysis_status VARCHAR(50) DEFAULT 'pending',
    processed_at TIMESTAMP WITH TIME ZONE,
    batch_report_id UUID,
    retention_expires_at TIMESTAMP WITH TIME ZONE,
    ocr_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI Analyses table
CREATE TABLE IF NOT EXISTS ai_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES work_sessions(id),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    screenshot_ids JSONB DEFAULT '[]',
    analysis_type VARCHAR(50) NOT NULL,
    ai_provider VARCHAR(50) DEFAULT 'gemini',
    model_used VARCHAR(100) NOT NULL,
    model_version VARCHAR(100),
    confidence_score DECIMAL(5,4),
    screenshot_url TEXT,
    context_data JSONB DEFAULT '{}',
    analysis_data JSONB DEFAULT '{}',
    detected_activity VARCHAR(255),
    productivity_score DECIMAL(3,1),
    focus_level DECIMAL(3,1),
    applications_detected TEXT[] DEFAULT '{}',
    distraction_indicators JSONB DEFAULT '{}',
    recommendations TEXT[] DEFAULT '{}',
    raw_analysis_data JSONB DEFAULT '{}',
    tokens_used INTEGER,
    processing_time_ms INTEGER,
    cost_usd DECIMAL(10,6),
    analysis_version VARCHAR(20) DEFAULT '1.0',
    status VARCHAR(20) DEFAULT 'pending',
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analysis Reports table
CREATE TABLE IF NOT EXISTS analysis_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    analysis_type VARCHAR(50) DEFAULT 'standard',
    analysis_data JSONB NOT NULL DEFAULT '{}',
    work_completed JSONB DEFAULT '[]',
    alignment_score DECIMAL(3,2) DEFAULT 0,
    productivity_insights TEXT,
    focus_analysis TEXT,
    screenshot_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Session Reports table
CREATE TABLE IF NOT EXISTS session_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    report_version VARCHAR(20) DEFAULT '1.0',
    summary JSONB DEFAULT '{}',
    insights JSONB DEFAULT '{}',
    ai_analyses JSONB DEFAULT '[]',
    performance_metrics JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Batch Reports table
CREATE TABLE IF NOT EXISTS batch_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES work_sessions(id),
    user_id UUID NOT NULL REFERENCES users(id),
    screenshot_count INTEGER NOT NULL,
    analysis_type VARCHAR(50) NOT NULL,
    analysis_result TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Shared Reports table
CREATE TABLE IF NOT EXISTS shared_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES work_sessions(id),
    user_id UUID NOT NULL REFERENCES users(id),
    share_token VARCHAR(255) UNIQUE NOT NULL,
    summary_data TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    include_private_data BOOLEAN DEFAULT FALSE,
    share_with_team BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Settings table
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    settings JSONB NOT NULL DEFAULT '{}',
    capture_settings JSONB DEFAULT '{"autoCapture": true, "captureFrequency": 30, "enableEventTriggers": true}',
    ai_settings JSONB DEFAULT '{"enableAI": true, "privacyMode": false, "aiProvider": "gemini"}',
    ui_preferences JSONB DEFAULT '{"theme": "light", "language": "en"}',
    notification_settings JSONB DEFAULT '{"enableNotifications": true}',
    productivity_settings JSONB DEFAULT '{"sessionReminderInterval": 60}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Productivity Insights table
CREATE TABLE IF NOT EXISTS productivity_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    period_type VARCHAR(20) NOT NULL,
    total_sessions INTEGER DEFAULT 0,
    total_focus_time_minutes INTEGER DEFAULT 0,
    total_time_minutes INTEGER DEFAULT 0,
    average_session_duration INTEGER DEFAULT 0,
    average_productivity_score DECIMAL(3,1),
    average_focus_score DECIMAL(3,1),
    goal_alignment_avg DECIMAL(3,1),
    most_productive_hours INTEGER[] DEFAULT '{}',
    most_productive_days INTEGER[] DEFAULT '{}',
    focus_trends JSONB DEFAULT '[]',
    activity_breakdown JSONB DEFAULT '{}',
    application_usage JSONB DEFAULT '{}',
    top_applications JSONB DEFAULT '[]',
    metrics JSONB DEFAULT '{}',
    insights JSONB DEFAULT '{}',
    recommendations JSONB DEFAULT '[]',
    improvement_opportunities TEXT[] DEFAULT '{}',
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version VARCHAR(20) DEFAULT '1.0'
);

-- Activity Events table
CREATE TABLE IF NOT EXISTS activity_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_session_id UUID REFERENCES work_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    keystroke_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    event_type VARCHAR(100),
    event_data JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Activity Logs table
CREATE TABLE IF NOT EXISTS user_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id UUID REFERENCES work_sessions(id),
    activity_type VARCHAR(100) NOT NULL,
    activity_description TEXT,
    metadata JSONB DEFAULT '{}',
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- 2. INDEXES FOR PERFORMANCE
-- ========================================

-- Core indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_teams_team_code ON teams(team_code);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_user_id ON work_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_start_time ON work_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_work_sessions_status ON work_sessions(status);
CREATE INDEX IF NOT EXISTS idx_screenshots_work_session ON screenshots(work_session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_screenshots_user_id ON screenshots(user_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_ai_analysis ON screenshots(ai_analysis_completed);
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_team_id ON goals(team_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_user_id ON ai_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_session_id ON ai_analyses(session_id);
CREATE INDEX IF NOT EXISTS idx_analysis_reports_session ON analysis_reports(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_reports_session ON session_reports(session_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_events_session ON activity_events(work_session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user ON user_activity_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_productivity_insights_user ON productivity_insights(user_id, period_type, date_from);

-- ========================================
-- 3. TRIGGERS & FUNCTIONS
-- ========================================

-- Function to update session duration
CREATE OR REPLACE FUNCTION update_session_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ended_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
        NEW.duration_minutes = EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at)) / 60;
        NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at));
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for session duration calculation
DROP TRIGGER IF EXISTS trigger_update_session_duration ON work_sessions;
CREATE TRIGGER trigger_update_session_duration
    BEFORE UPDATE ON work_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_session_duration();

-- Function to update goal progress based on completion
CREATE OR REPLACE FUNCTION update_goal_progress()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'completed' THEN
        NEW.progress = 100;
        NEW.progress_percentage = 100;
        NEW.completed_at = COALESCE(NEW.completed_at, NOW());
    ELSIF NEW.status = 'pending' OR NEW.status = 'active' THEN
        NEW.completed_at = NULL;
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for goal progress updates
DROP TRIGGER IF EXISTS trigger_update_goal_progress ON goals;
CREATE TRIGGER trigger_update_goal_progress
    BEFORE UPDATE ON goals
    FOR EACH ROW
    EXECUTE FUNCTION update_goal_progress();

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers to relevant tables
DO $$
DECLARE
    table_name TEXT;
BEGIN
    FOR table_name IN
        SELECT unnest(ARRAY[
            'users', 'teams', 'team_members', 'goals',
            'work_sessions', 'screenshots', 'user_settings', 'analysis_reports'
        ])
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS trigger_updated_at ON %I', table_name);
        EXECUTE format('CREATE TRIGGER trigger_updated_at
                       BEFORE UPDATE ON %I
                       FOR EACH ROW
                       EXECUTE FUNCTION update_updated_at_column()', table_name);
    END LOOP;
END $$;

-- ========================================
-- SUCCESS MESSAGE
-- ========================================

SELECT 'SUCCESS: OnlyWorks database schema created successfully!' as result,
       'All core tables created with proper relationships' as features,
       'No column conflicts - ready for production!' as status;