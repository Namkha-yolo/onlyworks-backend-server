-- COMPLETE OnlyWorks Database Schema
-- This creates ALL tables needed for full frontend functionality
-- Handles dependencies correctly and includes all features

-- ============================================================================
-- PHASE 1: EXTENSIONS AND SETUP
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- PHASE 2: CORE TABLES (NO DEPENDENCIES)
-- ============================================================================

-- Goal categories table (referenced by user_goals)
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
    ('personal-micro', 'Personal short-term goals (1-2 weeks)', true, true),
    ('personal-macro', 'Personal long-term goals (quarters/year)', true, false),
    ('team-micro', 'Team short-term goals (sprints/immediate)', false, true),
    ('team-macro', 'Team long-term goals (organizational objectives)', false, false)
ON CONFLICT (name) DO NOTHING;

-- Teams table (independent)
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    team_code VARCHAR(50) UNIQUE,
    is_public BOOLEAN DEFAULT false,
    max_members INTEGER DEFAULT 50,
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL, -- Will add FK constraint later if users table exists
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- PHASE 3: USER-DEPENDENT TABLES
-- ============================================================================

-- User sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- FK constraint added later
    session_name VARCHAR(255) NOT NULL DEFAULT 'Work Session',
    goal_description TEXT,
    session_type VARCHAR(50) DEFAULT 'work' CHECK (session_type IN ('work', 'break', 'meeting', 'deep_work', 'planning')),
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE NULL,
    duration_minutes INTEGER DEFAULT 0,
    planned_duration_minutes INTEGER DEFAULT NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
    productivity_score DECIMAL(3,1) DEFAULT NULL CHECK (productivity_score >= 0 AND productivity_score <= 10),
    focus_score DECIMAL(3,1) DEFAULT NULL CHECK (focus_score >= 0 AND focus_score <= 10),
    workspace_context JSONB DEFAULT '{}',
    interruptions_count INTEGER DEFAULT 0,
    break_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Session reports table
CREATE TABLE IF NOT EXISTS session_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES user_sessions(id) ON DELETE CASCADE,
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    report_version VARCHAR(20) DEFAULT '1.0',
    summary JSONB DEFAULT '{}',
    insights JSONB DEFAULT '{}',
    ai_analyses JSONB DEFAULT '[]',
    performance_metrics JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User goals table
CREATE TABLE IF NOT EXISTS user_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- FK constraint added later
    category_id UUID REFERENCES goal_categories(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    goal_type VARCHAR(50) NOT NULL CHECK (goal_type IN ('personal-micro', 'personal-macro', 'team-micro', 'team-macro')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in-progress', 'completed', 'blocked', 'cancelled')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    due_date TIMESTAMP WITH TIME ZONE NULL,
    completed_at TIMESTAMP WITH TIME ZONE NULL,
    tags TEXT[] DEFAULT '{}',
    parent_goal_id UUID REFERENCES user_goals(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Goal simple arrays table for frontend compatibility
CREATE TABLE IF NOT EXISTS goal_simple_arrays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- FK constraint added later
    personal_micro_goals TEXT[] DEFAULT '{}',
    personal_macro_goals TEXT[] DEFAULT '{}',
    team_micro_goals TEXT[] DEFAULT '{}',
    team_macro_goals TEXT[] DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Team members table
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- FK constraint added later
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member', 'viewer')),
    permissions JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'banned')),
    current_activity VARCHAR(255) NULL,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    invited_by UUID NULL, -- FK constraint added later
    UNIQUE(team_id, user_id)
);

-- Team invitations table
CREATE TABLE IF NOT EXISTS team_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL, -- FK constraint added later
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'member',
    invitation_code VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
    responded_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- AI analysis results table
CREATE TABLE IF NOT EXISTS ai_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES user_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL, -- FK constraint added later
    analysis_type VARCHAR(50) NOT NULL,
    model_used VARCHAR(100) NOT NULL,
    confidence_score DECIMAL(5,4) DEFAULT NULL,
    screenshot_url TEXT NULL,
    context_data JSONB DEFAULT '{}',
    detected_activity VARCHAR(255) NULL,
    productivity_score DECIMAL(3,1) NULL CHECK (productivity_score >= 0 AND productivity_score <= 10),
    focus_level DECIMAL(3,1) NULL CHECK (focus_level >= 0 AND focus_level <= 10),
    applications_detected TEXT[] DEFAULT '{}',
    distraction_indicators JSONB DEFAULT '{}',
    recommendations TEXT[] DEFAULT '{}',
    raw_analysis_data JSONB DEFAULT '{}',
    processing_time_ms INTEGER DEFAULT NULL,
    analysis_version VARCHAR(20) DEFAULT '1.0',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Productivity insights table
CREATE TABLE IF NOT EXISTS productivity_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- FK constraint added later
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly')),
    total_sessions INTEGER DEFAULT 0,
    total_focus_time_minutes INTEGER DEFAULT 0,
    average_productivity_score DECIMAL(3,1) DEFAULT NULL,
    average_focus_score DECIMAL(3,1) DEFAULT NULL,
    most_productive_hours INTEGER[] DEFAULT '{}',
    most_productive_days INTEGER[] DEFAULT '{}',
    focus_trends JSONB DEFAULT '[]',
    activity_breakdown JSONB DEFAULT '{}',
    application_usage JSONB DEFAULT '{}',
    recommendations JSONB DEFAULT '[]',
    improvement_opportunities TEXT[] DEFAULT '{}',
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    version VARCHAR(20) DEFAULT '1.0'
);

-- User activity logs table
CREATE TABLE IF NOT EXISTS user_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- FK constraint added later
    session_id UUID REFERENCES user_sessions(id) ON DELETE CASCADE,
    activity_type VARCHAR(100) NOT NULL,
    activity_description TEXT,
    metadata JSONB DEFAULT '{}',
    ip_address INET NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User settings table
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL, -- FK constraint added later
    capture_settings JSONB DEFAULT '{"interval": 30000, "quality": 80, "includeMousePosition": false, "privacyMode": false, "enableEventTriggers": false}',
    ai_settings JSONB DEFAULT '{"model": "gemini-1.5-flash", "analysisLevel": "standard", "enableRealTimeAnalysis": true, "confidenceThreshold": 0.7, "enableSmartSuggestions": true}',
    ui_preferences JSONB DEFAULT '{"theme": "light", "language": "en", "dashboardLayout": "default", "overlayPosition": "top-right", "showNotifications": true}',
    productivity_settings JSONB DEFAULT '{"sessionReminderInterval": 60, "breakReminderInterval": 25, "focusModeEnabled": false, "distractionBlocking": false}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- PHASE 4: BACKTEST TABLES (FROM EXISTING MIGRATION)
-- ============================================================================

-- Backtest runs table
CREATE TABLE IF NOT EXISTS backtest_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    backtest_id VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID NULL, -- FK constraint added later
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE NULL,
    total_duration_ms BIGINT NULL,
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    sample_size INTEGER NOT NULL DEFAULT 0,
    models_tested TEXT[] NOT NULL DEFAULT '{}',
    confidence_threshold DECIMAL(3,2) DEFAULT 0.7,
    real_time_validation BOOLEAN DEFAULT false,
    total_tests INTEGER DEFAULT 0,
    average_accuracy DECIMAL(5,4) DEFAULT 0,
    average_latency_ms DECIMAL(8,2) DEFAULT 0,
    best_performing_model VARCHAR(100) NULL,
    accuracy_threshold_met BOOLEAN DEFAULT false,
    latency_threshold_met BOOLEAN DEFAULT false,
    recommended_deployment VARCHAR(100) NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Backtest model results table
CREATE TABLE IF NOT EXISTS backtest_model_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    backtest_run_id UUID NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
    model_name VARCHAR(100) NOT NULL,
    activity_detection_accuracy DECIMAL(5,4) DEFAULT 0,
    activity_detection_correct INTEGER DEFAULT 0,
    activity_detection_total INTEGER DEFAULT 0,
    app_detection_accuracy DECIMAL(5,4) DEFAULT 0,
    app_detection_correct INTEGER DEFAULT 0,
    app_detection_total INTEGER DEFAULT 0,
    productivity_score_mae DECIMAL(6,3) DEFAULT 0,
    productivity_score_rmse DECIMAL(6,3) DEFAULT 0,
    productivity_score_correlation DECIMAL(5,4) DEFAULT 0,
    blocker_identification_precision DECIMAL(5,4) DEFAULT 0,
    blocker_identification_recall DECIMAL(5,4) DEFAULT 0,
    blocker_identification_f1 DECIMAL(5,4) DEFAULT 0,
    average_latency_ms DECIMAL(8,2) DEFAULT 0,
    min_latency_ms DECIMAL(8,2) DEFAULT 0,
    max_latency_ms DECIMAL(8,2) DEFAULT 0,
    total_tokens_used BIGINT DEFAULT 0,
    average_confidence DECIMAL(5,4) DEFAULT 0,
    tests_run INTEGER DEFAULT 0,
    total_test_duration_ms BIGINT DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Backtest test results table
CREATE TABLE IF NOT EXISTS backtest_test_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    backtest_run_id UUID NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
    model_result_id UUID NOT NULL REFERENCES backtest_model_results(id) ON DELETE CASCADE,
    test_id VARCHAR(255) NOT NULL,
    predicted_activity VARCHAR(100),
    predicted_productivity_score DECIMAL(5,2),
    predicted_apps JSONB DEFAULT '[]',
    predicted_is_blocked BOOLEAN DEFAULT false,
    predicted_blocker_type VARCHAR(50),
    predicted_confidence DECIMAL(5,4),
    ground_truth_activity VARCHAR(100),
    ground_truth_productivity_score DECIMAL(5,2),
    ground_truth_apps JSONB DEFAULT '[]',
    ground_truth_is_blocked BOOLEAN DEFAULT false,
    ground_truth_blocker_type VARCHAR(50),
    activity_match BOOLEAN DEFAULT false,
    productivity_score_diff DECIMAL(6,3) DEFAULT 0,
    app_match BOOLEAN DEFAULT false,
    blocker_match BOOLEAN DEFAULT false,
    overall_accuracy_score DECIMAL(5,4) DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    processing_time_ms INTEGER DEFAULT 0,
    model_version VARCHAR(100),
    test_failed BOOLEAN DEFAULT false,
    error_message TEXT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Backtest recommendations table
CREATE TABLE IF NOT EXISTS backtest_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    backtest_run_id UUID NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
    model_name VARCHAR(100),
    recommendation_type VARCHAR(50) NOT NULL,
    priority VARCHAR(10) CHECK (priority IN ('low', 'medium', 'high')),
    message TEXT NOT NULL,
    suggested_actions TEXT[] DEFAULT '{}',
    severity VARCHAR(20) DEFAULT 'medium',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Backtest performance insights table
CREATE TABLE IF NOT EXISTS backtest_performance_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    backtest_run_id UUID NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
    key_findings TEXT[] DEFAULT '{}',
    improvement_opportunities TEXT[] DEFAULT '{}',
    confidence_correlation JSONB DEFAULT '{}',
    confidence_calibration JSONB DEFAULT '{}',
    overconfidence_patterns JSONB DEFAULT '{}',
    common_failure_scenarios TEXT[] DEFAULT '{}',
    error_patterns JSONB DEFAULT '{}',
    real_time_validation_data JSONB DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- ============================================================================
-- PHASE 5: INDEXES FOR PERFORMANCE
-- ============================================================================

-- User sessions indexes
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_start_time ON user_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_user_sessions_status ON user_sessions(status);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_status ON user_sessions(user_id, status);

-- Session reports indexes
CREATE INDEX IF NOT EXISTS idx_session_reports_session_id ON session_reports(session_id);
CREATE INDEX IF NOT EXISTS idx_session_reports_generated_at ON session_reports(generated_at);

-- User goals indexes
CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON user_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_category_id ON user_goals(category_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_status ON user_goals(status);
CREATE INDEX IF NOT EXISTS idx_user_goals_goal_type ON user_goals(goal_type);
CREATE INDEX IF NOT EXISTS idx_user_goals_due_date ON user_goals(due_date);

-- Goal simple arrays indexes
CREATE INDEX IF NOT EXISTS idx_goal_simple_arrays_user_id ON goal_simple_arrays(user_id);

-- Teams indexes
CREATE INDEX IF NOT EXISTS idx_teams_team_code ON teams(team_code);
CREATE INDEX IF NOT EXISTS idx_teams_created_by ON teams(created_by);
CREATE INDEX IF NOT EXISTS idx_teams_is_active ON teams(is_active);

-- Team members indexes
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_status ON team_members(status);

-- Team invitations indexes
CREATE INDEX IF NOT EXISTS idx_team_invitations_team_id ON team_invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON team_invitations(status);
CREATE INDEX IF NOT EXISTS idx_team_invitations_expires_at ON team_invitations(expires_at);

-- AI analyses indexes
CREATE INDEX IF NOT EXISTS idx_ai_analyses_session_id ON ai_analyses(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_user_id ON ai_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_analysis_type ON ai_analyses(analysis_type);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_created_at ON ai_analyses(created_at);

-- Productivity insights indexes
CREATE INDEX IF NOT EXISTS idx_productivity_insights_user_id ON productivity_insights(user_id);
CREATE INDEX IF NOT EXISTS idx_productivity_insights_period ON productivity_insights(date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_productivity_insights_type ON productivity_insights(period_type);

-- User activity logs indexes
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_id ON user_activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_session_id ON user_activity_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_activity_type ON user_activity_logs(activity_type);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_created_at ON user_activity_logs(created_at);

-- User settings indexes
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Backtest indexes
CREATE INDEX IF NOT EXISTS idx_backtest_runs_user_id ON backtest_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_started_at ON backtest_runs(started_at);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_status ON backtest_runs(status);
CREATE INDEX IF NOT EXISTS idx_backtest_runs_backtest_id ON backtest_runs(backtest_id);

CREATE INDEX IF NOT EXISTS idx_backtest_model_results_run_id ON backtest_model_results(backtest_run_id);
CREATE INDEX IF NOT EXISTS idx_backtest_model_results_model_name ON backtest_model_results(model_name);

CREATE INDEX IF NOT EXISTS idx_backtest_test_results_run_id ON backtest_test_results(backtest_run_id);
CREATE INDEX IF NOT EXISTS idx_backtest_test_results_model_result_id ON backtest_test_results(model_result_id);
CREATE INDEX IF NOT EXISTS idx_backtest_test_results_test_id ON backtest_test_results(test_id);

CREATE INDEX IF NOT EXISTS idx_backtest_recommendations_run_id ON backtest_recommendations(backtest_run_id);
CREATE INDEX IF NOT EXISTS idx_backtest_recommendations_priority ON backtest_recommendations(priority);

CREATE INDEX IF NOT EXISTS idx_backtest_performance_insights_run_id ON backtest_performance_insights(backtest_run_id);

-- ============================================================================
-- PHASE 6: ADD FOREIGN KEY CONSTRAINTS (CONDITIONAL)
-- ============================================================================

-- Add foreign key constraints only if users table exists
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') THEN
        -- Add user_id foreign key constraints
        IF NOT EXISTS (SELECT constraint_name FROM information_schema.table_constraints
                      WHERE table_name = 'user_sessions' AND constraint_name = 'user_sessions_user_id_fkey') THEN
            ALTER TABLE user_sessions ADD CONSTRAINT user_sessions_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT constraint_name FROM information_schema.table_constraints
                      WHERE table_name = 'user_goals' AND constraint_name = 'user_goals_user_id_fkey') THEN
            ALTER TABLE user_goals ADD CONSTRAINT user_goals_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT constraint_name FROM information_schema.table_constraints
                      WHERE table_name = 'goal_simple_arrays' AND constraint_name = 'goal_simple_arrays_user_id_fkey') THEN
            ALTER TABLE goal_simple_arrays ADD CONSTRAINT goal_simple_arrays_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT constraint_name FROM information_schema.table_constraints
                      WHERE table_name = 'team_members' AND constraint_name = 'team_members_user_id_fkey') THEN
            ALTER TABLE team_members ADD CONSTRAINT team_members_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT constraint_name FROM information_schema.table_constraints
                      WHERE table_name = 'team_members' AND constraint_name = 'team_members_invited_by_fkey') THEN
            ALTER TABLE team_members ADD CONSTRAINT team_members_invited_by_fkey
            FOREIGN KEY (invited_by) REFERENCES users(id);
        END IF;

        IF NOT EXISTS (SELECT constraint_name FROM information_schema.table_constraints
                      WHERE table_name = 'team_invitations' AND constraint_name = 'team_invitations_invited_by_fkey') THEN
            ALTER TABLE team_invitations ADD CONSTRAINT team_invitations_invited_by_fkey
            FOREIGN KEY (invited_by) REFERENCES users(id);
        END IF;

        IF NOT EXISTS (SELECT constraint_name FROM information_schema.table_constraints
                      WHERE table_name = 'teams' AND constraint_name = 'teams_created_by_fkey') THEN
            ALTER TABLE teams ADD CONSTRAINT teams_created_by_fkey
            FOREIGN KEY (created_by) REFERENCES users(id);
        END IF;

        IF NOT EXISTS (SELECT constraint_name FROM information_schema.table_constraints
                      WHERE table_name = 'ai_analyses' AND constraint_name = 'ai_analyses_user_id_fkey') THEN
            ALTER TABLE ai_analyses ADD CONSTRAINT ai_analyses_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT constraint_name FROM information_schema.table_constraints
                      WHERE table_name = 'productivity_insights' AND constraint_name = 'productivity_insights_user_id_fkey') THEN
            ALTER TABLE productivity_insights ADD CONSTRAINT productivity_insights_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT constraint_name FROM information_schema.table_constraints
                      WHERE table_name = 'user_activity_logs' AND constraint_name = 'user_activity_logs_user_id_fkey') THEN
            ALTER TABLE user_activity_logs ADD CONSTRAINT user_activity_logs_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT constraint_name FROM information_schema.table_constraints
                      WHERE table_name = 'user_settings' AND constraint_name = 'user_settings_user_id_fkey') THEN
            ALTER TABLE user_settings ADD CONSTRAINT user_settings_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;

        IF NOT EXISTS (SELECT constraint_name FROM information_schema.table_constraints
                      WHERE table_name = 'backtest_runs' AND constraint_name = 'backtest_runs_user_id_fkey') THEN
            ALTER TABLE backtest_runs ADD CONSTRAINT backtest_runs_user_id_fkey
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;
        END IF;
    END IF;
END $$;

-- ============================================================================
-- PHASE 7: TRIGGERS AND FUNCTIONS
-- ============================================================================

-- Function to update session duration automatically
CREATE OR REPLACE FUNCTION update_session_duration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.end_time IS NOT NULL AND NEW.start_time IS NOT NULL THEN
        NEW.duration_minutes = EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60;
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for session duration updates
DROP TRIGGER IF EXISTS trigger_update_session_duration ON user_sessions;
CREATE TRIGGER trigger_update_session_duration
    BEFORE UPDATE ON user_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_session_duration();

-- Function to auto-update goal status based on progress
CREATE OR REPLACE FUNCTION update_goal_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.progress = 100 AND NEW.status != 'completed' THEN
        NEW.status = 'completed';
        NEW.completed_at = NOW();
    END IF;
    IF NEW.progress > 0 AND OLD.progress = 0 AND NEW.status = 'pending' THEN
        NEW.status = 'in-progress';
    END IF;
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for goal status updates
DROP TRIGGER IF EXISTS trigger_update_goal_status ON user_goals;
CREATE TRIGGER trigger_update_goal_status
    BEFORE UPDATE ON user_goals
    FOR EACH ROW
    EXECUTE FUNCTION update_goal_status();

-- Function to update backtest runs updated_at
CREATE OR REPLACE FUNCTION update_backtest_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for backtest runs updated_at
DROP TRIGGER IF EXISTS trigger_update_backtest_runs_updated_at ON backtest_runs;
CREATE TRIGGER trigger_update_backtest_runs_updated_at
    BEFORE UPDATE ON backtest_runs
    FOR EACH ROW
    EXECUTE FUNCTION update_backtest_runs_updated_at();

-- ============================================================================
-- PHASE 8: HELPFUL VIEWS
-- ============================================================================

-- View for complete session data with reports
CREATE OR REPLACE VIEW session_details AS
SELECT
    s.*,
    sr.summary as report_summary,
    sr.insights as report_insights,
    sr.generated_at as report_generated_at
FROM user_sessions s
LEFT JOIN session_reports sr ON s.id = sr.session_id;

-- View for user goal overview (works without users table)
CREATE OR REPLACE VIEW user_goal_overview AS
SELECT
    g.user_id,
    COUNT(*) as total_goals,
    COUNT(*) FILTER (WHERE g.status = 'completed') as completed_goals,
    COUNT(*) FILTER (WHERE g.status = 'in-progress') as active_goals,
    AVG(g.progress) as average_progress
FROM user_goals g
GROUP BY g.user_id;

-- View for team statistics
CREATE OR REPLACE VIEW team_stats AS
SELECT
    t.*,
    COUNT(tm.id) as member_count,
    COUNT(tm.id) FILTER (WHERE tm.status = 'active') as active_members,
    MAX(tm.last_active_at) as last_team_activity
FROM teams t
LEFT JOIN team_members tm ON t.id = tm.team_id
GROUP BY t.id;

-- View for user profiles (if users table exists)
CREATE OR REPLACE VIEW user_profiles AS
SELECT
    CASE
        WHEN EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'users') THEN
            (SELECT row_to_json(u.*) FROM users u WHERE u.id = us.user_id LIMIT 1)
        ELSE
            json_build_object('id', us.user_id, 'email', 'unknown')
    END as user_data,
    COUNT(us.id) as total_sessions,
    AVG(us.productivity_score) as avg_productivity,
    AVG(us.focus_score) as avg_focus
FROM user_sessions us
GROUP BY us.user_id;

-- ============================================================================
-- PHASE 9: HELPFUL COMMENTS
-- ============================================================================

COMMENT ON TABLE user_sessions IS 'Work sessions with timing and performance data';
COMMENT ON TABLE session_reports IS 'Detailed analytical reports for completed sessions';
COMMENT ON TABLE user_goals IS 'User goals with progress tracking';
COMMENT ON TABLE goal_categories IS 'Goal category definitions';
COMMENT ON TABLE goal_simple_arrays IS 'Frontend-compatible goal arrays';
COMMENT ON TABLE teams IS 'User teams for collaboration';
COMMENT ON TABLE team_members IS 'Team membership with roles';
COMMENT ON TABLE team_invitations IS 'Pending team invitations';
COMMENT ON TABLE ai_analyses IS 'AI analysis results from screenshots';
COMMENT ON TABLE productivity_insights IS 'Generated productivity insights';
COMMENT ON TABLE user_activity_logs IS 'User action audit trail';
COMMENT ON TABLE user_settings IS 'User preferences and settings';
COMMENT ON TABLE backtest_runs IS 'AI model backtest execution records';
COMMENT ON TABLE backtest_model_results IS 'Model performance metrics';
COMMENT ON TABLE backtest_test_results IS 'Individual test case results';

-- ============================================================================
-- COMPLETION
-- ============================================================================

-- Success message
SELECT
    'SUCCESS: Complete OnlyWorks database schema created!' as status,
    'All tables, indexes, triggers, and views are now available.' as message,
    'Frontend should now work without errors.' as result;