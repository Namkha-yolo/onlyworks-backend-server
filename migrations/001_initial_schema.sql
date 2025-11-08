-- OnlyWorks Database Schema v1.0
-- Initial schema with core tables for productivity tracking

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- ===============================================
-- 1. USERS & AUTHENTICATION
-- ===============================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NULL, -- OAuth users may not have password
    display_name VARCHAR(100) NOT NULL,
    avatar_url TEXT NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',
    email_verified BOOLEAN DEFAULT false,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deleted')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    device_info JSONB DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================================
-- 2. WORK SESSIONS & PRODUCTIVITY TRACKING
-- ===============================================

CREATE TABLE work_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_name VARCHAR(255) NULL,
    goal_description TEXT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ended_at TIMESTAMP WITH TIME ZONE NULL,
    duration_seconds INTEGER NULL,
    productivity_score DECIMAL(5,2) NULL CHECK (productivity_score >= 0 AND productivity_score <= 100),
    focus_score DECIMAL(5,2) NULL CHECK (focus_score >= 0 AND focus_score <= 100),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'abandoned')),
    ai_summary TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE screenshots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_session_id UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    file_storage_key TEXT NOT NULL UNIQUE,
    file_size_bytes INTEGER NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    capture_trigger VARCHAR(20) DEFAULT 'timer_15s' CHECK (capture_trigger IN (
        'timer_5s', 'timer_15s', 'timer_30s', 'click', 'keypress', 'app_switch', 'manual'
    )),
    window_title TEXT NULL,
    active_app VARCHAR(255) NULL,
    ocr_text TEXT NULL,
    ai_analysis_completed BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    retention_expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '90 days')
);

CREATE TABLE activity_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_session_id UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL CHECK (event_type IN (
        'keypress', 'click', 'scroll', 'app_switch', 'idle_start', 'idle_end'
    )),
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    application_name VARCHAR(255) NULL,
    window_title TEXT NULL,
    keystroke_count INTEGER DEFAULT 0,
    click_count INTEGER DEFAULT 0,
    idle_duration_seconds INTEGER NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================================
-- 3. AI ANALYSIS RESULTS
-- ===============================================

CREATE TABLE screenshot_analysis (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    screenshot_id UUID UNIQUE NOT NULL REFERENCES screenshots(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_detected VARCHAR(50) NULL,
    productivity_score DECIMAL(5,2) NULL CHECK (productivity_score >= 0 AND productivity_score <= 100),
    confidence_score DECIMAL(5,2) NULL CHECK (confidence_score >= 0 AND confidence_score <= 100),
    detected_apps JSONB NULL,
    detected_tasks JSONB NULL,
    is_blocked BOOLEAN DEFAULT false,
    blocker_type VARCHAR(50) NULL,
    model_version VARCHAR(50) NOT NULL,
    processing_time_ms INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE session_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_session_id UUID UNIQUE NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    summary_text TEXT NOT NULL,
    tasks_completed JSONB NULL,
    blockers_encountered JSONB NULL,
    time_breakdown JSONB NULL,
    next_steps JSONB NULL,
    overall_productivity DECIMAL(5,2) NOT NULL CHECK (overall_productivity >= 0 AND overall_productivity <= 100),
    focus_periods JSONB NULL,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================================
-- 4. GOALS & TASK MANAGEMENT
-- ===============================================

CREATE TABLE goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    target_completion_date DATE NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
    progress_percentage DECIMAL(5,2) DEFAULT 0.00 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    auto_tracked BOOLEAN DEFAULT true,
    completion_criteria JSONB NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE detected_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_session_id UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal_id UUID NULL REFERENCES goals(id) ON DELETE SET NULL,
    task_description TEXT NOT NULL,
    detection_confidence DECIMAL(5,2) NOT NULL CHECK (detection_confidence >= 0 AND detection_confidence <= 100),
    evidence_screenshot_ids JSONB NULL,
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    verified_by_user BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================================
-- 5. TEAMS & COLLABORATION
-- ===============================================

CREATE TABLE teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT NULL,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    invite_code VARCHAR(20) UNIQUE NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) DEFAULT 'member' CHECK (role IN ('admin', 'member', 'viewer')),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- ===============================================
-- 6. REPORTS & ANALYTICS
-- ===============================================

CREATE TABLE generated_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    report_type VARCHAR(20) NOT NULL CHECK (report_type IN ('daily', 'weekly', 'monthly', 'custom', 'goal_progress')),
    title VARCHAR(255) NOT NULL,
    date_range_start DATE NOT NULL,
    date_range_end DATE NOT NULL,
    filters JSONB DEFAULT '{}',
    report_data JSONB NOT NULL,
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================================
-- 7. CONFIGURATION & SETTINGS
-- ===============================================

CREATE TABLE user_settings (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    screenshot_frequency VARCHAR(10) DEFAULT '15s' CHECK (screenshot_frequency IN ('5s', '15s', '30s', '60s')),
    capture_on_events JSONB DEFAULT '["click", "keypress"]',
    privacy_mode_apps JSONB DEFAULT '[]',
    work_hours_start TIME DEFAULT '09:00',
    work_hours_end TIME DEFAULT '17:00',
    auto_pause_idle_minutes INTEGER DEFAULT 5,
    ai_analysis_enabled BOOLEAN DEFAULT true,
    report_sharing_enabled BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================================
-- 8. FILE STORAGE TRACKING
-- ===============================================

CREATE TABLE file_storage (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    storage_key VARCHAR(500) UNIQUE NOT NULL,
    original_filename VARCHAR(255) NULL,
    file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('screenshot', 'report', 'export')),
    file_size_bytes BIGINT NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    uploaded_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ===============================================
-- INDEXES FOR PERFORMANCE
-- ===============================================

-- User sessions
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Work sessions
CREATE INDEX idx_work_sessions_user_id_started_at ON work_sessions(user_id, started_at DESC);
CREATE INDEX idx_work_sessions_status ON work_sessions(status) WHERE status IN ('active', 'paused');

-- Screenshots
CREATE INDEX idx_screenshots_session_timestamp ON screenshots(work_session_id, timestamp DESC);
CREATE INDEX idx_screenshots_user_id ON screenshots(user_id);
CREATE INDEX idx_screenshots_retention_expires_at ON screenshots(retention_expires_at);

-- Activity events
CREATE INDEX idx_activity_events_session_timestamp ON activity_events(work_session_id, timestamp DESC);
CREATE INDEX idx_activity_events_user_id ON activity_events(user_id);

-- Screenshot analysis
CREATE INDEX idx_screenshot_analysis_user_id ON screenshot_analysis(user_id);
CREATE INDEX idx_screenshot_analysis_created_at ON screenshot_analysis(created_at DESC);

-- Goals
CREATE INDEX idx_goals_user_id_status ON goals(user_id, status);

-- Team members
CREATE INDEX idx_team_members_team_id ON team_members(team_id);
CREATE INDEX idx_team_members_user_id ON team_members(user_id);

-- Generated reports
CREATE INDEX idx_generated_reports_user_id_created_at ON generated_reports(user_id, created_at DESC);

-- File storage
CREATE INDEX idx_file_storage_uploaded_by_user_id ON file_storage(uploaded_by_user_id);
CREATE INDEX idx_file_storage_expires_at ON file_storage(expires_at) WHERE expires_at IS NOT NULL;

-- ===============================================
-- FUNCTIONS & TRIGGERS
-- ===============================================

-- Update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add update triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_work_sessions_updated_at BEFORE UPDATE ON work_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_goals_updated_at BEFORE UPDATE ON goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_teams_updated_at BEFORE UPDATE ON teams FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_user_settings_updated_at BEFORE UPDATE ON user_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to calculate session duration
CREATE OR REPLACE FUNCTION calculate_session_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.ended_at IS NOT NULL AND NEW.started_at IS NOT NULL THEN
        NEW.duration_seconds = EXTRACT(EPOCH FROM (NEW.ended_at - NEW.started_at));
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER calculate_work_session_duration
    BEFORE INSERT OR UPDATE ON work_sessions
    FOR EACH ROW EXECUTE FUNCTION calculate_session_duration();

-- ===============================================
-- ROW LEVEL SECURITY (RLS)
-- ===============================================

-- Enable RLS on all user-specific tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE screenshot_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE detected_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE generated_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_storage ENABLE ROW LEVEL SECURITY;

-- Basic policies (users can only access their own data)
CREATE POLICY "Users can access own data" ON work_sessions FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can access own screenshots" ON screenshots FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can access own activities" ON activity_events FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can access own analysis" ON screenshot_analysis FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can access own summaries" ON session_summaries FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can access own goals" ON goals FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can access own tasks" ON detected_tasks FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can access own reports" ON generated_reports FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can access own settings" ON user_settings FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Users can access own files" ON file_storage FOR ALL USING (uploaded_by_user_id = auth.uid());

-- ===============================================
-- INITIAL DATA SEEDING
-- ===============================================

-- Create default user settings for new users
CREATE OR REPLACE FUNCTION create_user_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO user_settings (user_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER create_user_settings_trigger
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION create_user_settings();

-- ===============================================
-- COMMENTS FOR DOCUMENTATION
-- ===============================================

COMMENT ON TABLE users IS 'Core user accounts with authentication info';
COMMENT ON TABLE work_sessions IS 'Individual work sessions - the core entity';
COMMENT ON TABLE screenshots IS 'Screenshot captures during work sessions';
COMMENT ON TABLE activity_events IS 'Granular activity tracking (clicks, keystrokes, etc)';
COMMENT ON TABLE screenshot_analysis IS 'AI analysis results per screenshot';
COMMENT ON TABLE session_summaries IS 'AI-generated summaries per work session';
COMMENT ON TABLE goals IS 'User-defined goals and objectives';
COMMENT ON TABLE detected_tasks IS 'AI-detected task completions';
COMMENT ON TABLE teams IS 'Team collaboration groups';
COMMENT ON TABLE generated_reports IS 'Saved productivity reports';
COMMENT ON TABLE user_settings IS 'User preferences and configuration';
COMMENT ON TABLE file_storage IS 'Tracking for uploaded files and storage cleanup';