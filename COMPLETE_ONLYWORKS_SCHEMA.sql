-- ========================================
-- COMPLETE ONLYWORKS DATABASE SCHEMA
-- Generated from comprehensive frontend + backend analysis
-- ========================================

-- Enable Required Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ========================================
-- 1. ORGANIZATIONS & USERS
-- ========================================

-- Organizations table (for multi-tenancy)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    subscription_tier VARCHAR(50) DEFAULT 'free' CHECK (subscription_tier IN ('free', 'pro', 'enterprise')),
    max_users INTEGER DEFAULT 5,
    max_storage_gb INTEGER DEFAULT 1,
    max_ai_analyses_monthly INTEGER DEFAULT 100,
    settings JSONB DEFAULT '{}',
    ai_provider VARCHAR(50) DEFAULT 'gemini',
    ai_model VARCHAR(100) DEFAULT 'gemini-1.5-flash',
    stripe_customer_id VARCHAR(255),
    subscription_status VARCHAR(50) DEFAULT 'active',
    subscription_expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Users table (core user management)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255),
    display_name VARCHAR(255),
    avatar_url TEXT,
    timezone VARCHAR(50) DEFAULT 'UTC',
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'manager', 'member', 'viewer')),
    permissions JSONB DEFAULT '[]',
    oauth_provider VARCHAR(50) CHECK (oauth_provider IN ('google', 'github', 'microsoft', 'apple')),
    oauth_id VARCHAR(255),
    oauth_provider_id VARCHAR(255),
    oauth_refresh_token TEXT,
    preferences JSONB DEFAULT '{}',
    onboarding_completed BOOLEAN DEFAULT FALSE,
    onboarding_step INTEGER DEFAULT 0,
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'deactivated', 'pending')),
    email_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- 2. TEAMS & COLLABORATION
-- ========================================

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    team_code VARCHAR(50) UNIQUE,
    invite_code VARCHAR(50) UNIQUE,
    is_public BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    max_members INTEGER DEFAULT 50,
    settings JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_by UUID NOT NULL REFERENCES users(id),
    created_by_user_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Team Members table
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'moderator', 'member', 'viewer', 'leader')),
    permissions JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'pending', 'banned', 'invited', 'removed')),
    current_activity VARCHAR(255),
    last_active_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    invited_by UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- Team Invitations table
CREATE TABLE IF NOT EXISTS team_invitations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES users(id),
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'member',
    invitation_code VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
    expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '7 days'),
    responded_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- 3. GOALS MANAGEMENT
-- ========================================

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

-- Goals table (renamed from user_goals for broader scope)
CREATE TABLE IF NOT EXISTS goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    category_id UUID REFERENCES goal_categories(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    goal_type VARCHAR(50) NOT NULL CHECK (goal_type IN ('personal-micro', 'personal-macro', 'team-micro', 'team-macro')),
    type VARCHAR(50) CHECK (type IN ('macro', 'micro')),
    priority VARCHAR(20) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'in-progress', 'completed', 'blocked', 'cancelled')),
    progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    target_completion_date DATE,
    due_date TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    auto_tracked BOOLEAN DEFAULT TRUE,
    completion_criteria TEXT,
    tags JSONB DEFAULT '[]',
    parent_goal_id UUID REFERENCES goals(id),
    created_by_user_id UUID REFERENCES users(id),
    assigned_to_user_id UUID REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Goals (alias table for compatibility)
CREATE VIEW user_goals AS SELECT * FROM goals WHERE team_id IS NULL;

-- Team Goals table
CREATE TABLE IF NOT EXISTS team_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    created_by_user_id UUID NOT NULL REFERENCES users(id),
    assigned_to_user_id UUID REFERENCES users(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL CHECK (type IN ('macro', 'micro')),
    target_completion_date DATE,
    status VARCHAR(20) DEFAULT 'active',
    progress_percentage INTEGER DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Goal Simple Arrays (for frontend compatibility)
CREATE TABLE IF NOT EXISTS goal_simple_arrays (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    personal_micro_goals TEXT[] DEFAULT '{}',
    personal_macro_goals TEXT[] DEFAULT '{}',
    team_micro_goals TEXT[] DEFAULT '{}',
    team_macro_goals TEXT[] DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- 4. WORK SESSIONS & TRACKING
-- ========================================

-- Work Sessions table (primary session tracking)
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
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
    productivity_score DECIMAL(3,1) CHECK (productivity_score >= 0 AND productivity_score <= 10),
    focus_score DECIMAL(3,1) CHECK (focus_score >= 0 AND focus_score <= 10),
    workspace_context JSONB DEFAULT '{}',
    interruptions_count INTEGER DEFAULT 0,
    break_count INTEGER DEFAULT 0,
    screenshot_count INTEGER DEFAULT 0,
    analysis_count INTEGER DEFAULT 0,
    settings JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User Sessions (alias view for backend compatibility)
CREATE VIEW user_sessions AS SELECT * FROM work_sessions;

-- Sessions (alias view for frontend compatibility)
CREATE VIEW sessions AS SELECT * FROM work_sessions;

-- Goal Sessions junction table
CREATE TABLE IF NOT EXISTS goal_sessions (
    goal_id UUID NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    alignment_score DECIMAL(3,1) CHECK (alignment_score >= 0 AND alignment_score <= 10),
    contribution_notes TEXT,
    PRIMARY KEY (goal_id, session_id)
);

-- ========================================
-- 5. SCREENSHOTS & MEDIA
-- ========================================

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
    trigger_type VARCHAR(50) CHECK (trigger_type IN ('interval', 'click', 'keypress', 'window_switch', 'enter_key', 'cmd_c', 'cmd_v', 'tab_switch')),
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
    analysis_status VARCHAR(50) DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'processing', 'completed', 'failed')),
    processed_at TIMESTAMP WITH TIME ZONE,
    batch_report_id UUID,
    retention_expires_at TIMESTAMP WITH TIME ZONE,
    ocr_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- 6. AI ANALYSIS & INSIGHTS
-- ========================================

-- AI Analyses table
CREATE TABLE IF NOT EXISTS ai_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES work_sessions(id),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    screenshot_ids JSONB DEFAULT '[]',
    analysis_type VARCHAR(50) NOT NULL CHECK (analysis_type IN ('comprehensive', 'activity_summary', 'goal_alignment', 'standard')),
    ai_provider VARCHAR(50) DEFAULT 'gemini',
    model_used VARCHAR(100) NOT NULL,
    model_version VARCHAR(100),
    confidence_score DECIMAL(5,4),
    screenshot_url TEXT,
    context_data JSONB DEFAULT '{}',
    analysis_data JSONB DEFAULT '{}',
    detected_activity VARCHAR(255),
    productivity_score DECIMAL(3,1) CHECK (productivity_score >= 0 AND productivity_score <= 10),
    focus_level DECIMAL(3,1) CHECK (focus_level >= 0 AND focus_level <= 10),
    applications_detected TEXT[] DEFAULT '{}',
    distraction_indicators JSONB DEFAULT '{}',
    recommendations TEXT[] DEFAULT '{}',
    raw_analysis_data JSONB DEFAULT '{}',
    tokens_used INTEGER,
    processing_time_ms INTEGER,
    cost_usd DECIMAL(10,6),
    analysis_version VARCHAR(20) DEFAULT '1.0',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Analysis Reports table
CREATE TABLE IF NOT EXISTS analysis_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    analysis_type VARCHAR(50) DEFAULT 'standard' CHECK (analysis_type IN ('batch', 'final', 'standard')),
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

-- ========================================
-- 7. USER SETTINGS & PREFERENCES
-- ========================================

-- User Settings table
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    settings JSONB NOT NULL DEFAULT '{}',
    capture_settings JSONB DEFAULT '{"autoCapture": true, "captureFrequency": 30, "enableEventTriggers": true, "triggers": ["interval", "click", "keypress", "window_switch"], "interval": 30000, "quality": 80, "includeMousePosition": false, "privacyMode": false}',
    ai_settings JSONB DEFAULT '{"enableAI": true, "privacyMode": false, "aiProvider": "gemini", "autoAnalysis": true, "analysisFrequency": "auto", "includeScreenshots": true, "shareAnonymousData": false, "model": "gemini-1.5-flash", "analysisLevel": "standard", "enableRealTimeAnalysis": true, "confidenceThreshold": 0.7, "enableSmartSuggestions": true}',
    ui_preferences JSONB DEFAULT '{"theme": "light", "language": "en", "dashboardLayout": "default", "overlayPosition": "top-right", "showNotifications": true}',
    notification_settings JSONB DEFAULT '{"enableNotifications": true, "sessionReminders": true, "goalDeadlines": true, "teamUpdates": true}',
    productivity_settings JSONB DEFAULT '{"sessionReminderInterval": 60, "breakReminderInterval": 25, "focusModeEnabled": false, "distractionBlocking": false}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- 8. ANALYTICS & INSIGHTS
-- ========================================

-- Productivity Insights table
CREATE TABLE IF NOT EXISTS productivity_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly', 'quarterly')),
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

-- Analytics Aggregates table
CREATE TABLE IF NOT EXISTS analytics_aggregates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
    period_type VARCHAR(20) NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    metrics JSONB DEFAULT '{}',
    insights JSONB DEFAULT '{}',
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- 9. ACTIVITY & AUDIT LOGS
-- ========================================

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

-- Session Summaries table
CREATE TABLE IF NOT EXISTS session_summaries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_session_id UUID NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
    summary_text TEXT,
    key_activities TEXT[] DEFAULT '{}',
    productivity_highlights TEXT[] DEFAULT '{}',
    generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- 10. BACKTEST & ML VALIDATION TABLES
-- ========================================

-- Backtest Runs table
CREATE TABLE IF NOT EXISTS backtest_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    backtest_id VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id),
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    total_duration_ms BIGINT,
    status VARCHAR(20) DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
    sample_size INTEGER NOT NULL DEFAULT 0,
    models_tested TEXT[] NOT NULL DEFAULT '{}',
    confidence_threshold DECIMAL(3,2) DEFAULT 0.7,
    real_time_validation BOOLEAN DEFAULT FALSE,
    total_tests INTEGER DEFAULT 0,
    average_accuracy DECIMAL(5,4) DEFAULT 0,
    average_latency_ms DECIMAL(8,2) DEFAULT 0,
    best_performing_model VARCHAR(100),
    accuracy_threshold_met BOOLEAN DEFAULT FALSE,
    latency_threshold_met BOOLEAN DEFAULT FALSE,
    recommended_deployment VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Backtest Model Results table
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Backtest Test Results table
CREATE TABLE IF NOT EXISTS backtest_test_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    backtest_run_id UUID NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
    model_result_id UUID NOT NULL REFERENCES backtest_model_results(id) ON DELETE CASCADE,
    test_id VARCHAR(255) NOT NULL,
    predicted_activity VARCHAR(100),
    predicted_productivity_score DECIMAL(5,2),
    predicted_apps JSONB DEFAULT '[]',
    predicted_is_blocked BOOLEAN DEFAULT FALSE,
    predicted_blocker_type VARCHAR(50),
    predicted_confidence DECIMAL(5,4),
    ground_truth_activity VARCHAR(100),
    ground_truth_productivity_score DECIMAL(5,2),
    ground_truth_apps JSONB DEFAULT '[]',
    ground_truth_is_blocked BOOLEAN DEFAULT FALSE,
    ground_truth_blocker_type VARCHAR(50),
    activity_match BOOLEAN DEFAULT FALSE,
    productivity_score_diff DECIMAL(6,3) DEFAULT 0,
    app_match BOOLEAN DEFAULT FALSE,
    blocker_match BOOLEAN DEFAULT FALSE,
    overall_accuracy_score DECIMAL(5,4) DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    processing_time_ms INTEGER DEFAULT 0,
    model_version VARCHAR(100),
    test_failed BOOLEAN DEFAULT FALSE,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Backtest Recommendations table
CREATE TABLE IF NOT EXISTS backtest_recommendations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    backtest_run_id UUID NOT NULL REFERENCES backtest_runs(id) ON DELETE CASCADE,
    model_name VARCHAR(100),
    recommendation_type VARCHAR(50) NOT NULL,
    priority VARCHAR(10) CHECK (priority IN ('low', 'medium', 'high')),
    message TEXT NOT NULL,
    suggested_actions TEXT[] DEFAULT '{}',
    severity VARCHAR(20) DEFAULT 'medium',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Backtest Performance Insights table
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ========================================
-- 11. INDEXES FOR PERFORMANCE
-- ========================================

-- Core entity indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id);
CREATE INDEX IF NOT EXISTS idx_users_organization ON users(organization_id);

-- Team indexes
CREATE INDEX IF NOT EXISTS idx_teams_organization ON teams(organization_id);
CREATE INDEX IF NOT EXISTS idx_teams_team_code ON teams(team_code);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);

-- Session indexes
CREATE INDEX IF NOT EXISTS idx_work_sessions_user_id ON work_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_work_sessions_start_time ON work_sessions(start_time);
CREATE INDEX IF NOT EXISTS idx_work_sessions_status ON work_sessions(status);
CREATE INDEX IF NOT EXISTS idx_work_sessions_team_id ON work_sessions(team_id);

-- Screenshot indexes
CREATE INDEX IF NOT EXISTS idx_screenshots_work_session ON screenshots(work_session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_screenshots_user_id ON screenshots(user_id);
CREATE INDEX IF NOT EXISTS idx_screenshots_ai_analysis ON screenshots(ai_analysis_completed);
CREATE INDEX IF NOT EXISTS idx_screenshots_analysis_status ON screenshots(analysis_status);

-- Goal indexes
CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
CREATE INDEX IF NOT EXISTS idx_goals_team_id ON goals(team_id);
CREATE INDEX IF NOT EXISTS idx_goals_status ON goals(status);
CREATE INDEX IF NOT EXISTS idx_goals_type ON goals(goal_type);

-- AI Analysis indexes
CREATE INDEX IF NOT EXISTS idx_ai_analyses_user_id ON ai_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_session_id ON ai_analyses(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_created_at ON ai_analyses(created_at);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_status ON ai_analyses(status);

-- Report indexes
CREATE INDEX IF NOT EXISTS idx_analysis_reports_session ON analysis_reports(session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_session_reports_session ON session_reports(session_id);

-- Settings indexes
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Activity indexes
CREATE INDEX IF NOT EXISTS idx_activity_events_session ON activity_events(work_session_id, timestamp);
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user ON user_activity_logs(user_id, created_at DESC);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_productivity_insights_user ON productivity_insights(user_id, period_type, date_from);
CREATE INDEX IF NOT EXISTS idx_analytics_aggregates_user ON analytics_aggregates(user_id, period_type, period_start);

-- ========================================
-- 12. HELPFUL VIEWS
-- ========================================

-- Session Details View (with reports)
CREATE VIEW session_details AS
SELECT
    s.*,
    sr.summary as report_summary,
    sr.insights as report_insights,
    sr.generated_at as report_generated_at,
    COUNT(ss.id) as screenshot_count,
    COUNT(aa.id) as analysis_count
FROM work_sessions s
LEFT JOIN session_reports sr ON s.id = sr.session_id
LEFT JOIN screenshots ss ON s.id = ss.work_session_id
LEFT JOIN ai_analyses aa ON s.id = aa.session_id
GROUP BY s.id, sr.summary, sr.insights, sr.generated_at;

-- User Goal Overview
CREATE VIEW user_goal_overview AS
SELECT
    user_id,
    COUNT(*) as total_goals,
    COUNT(*) FILTER (WHERE status = 'completed') as completed_goals,
    COUNT(*) FILTER (WHERE status = 'in-progress') as active_goals,
    AVG(progress) as average_progress,
    COUNT(*) FILTER (WHERE goal_type LIKE 'personal-%') as personal_goals,
    COUNT(*) FILTER (WHERE goal_type LIKE 'team-%') as team_goals
FROM goals
GROUP BY user_id;

-- Team Statistics View
CREATE VIEW team_stats AS
SELECT
    t.*,
    COUNT(tm.id) as member_count,
    COUNT(tm.id) FILTER (WHERE tm.status = 'active') as active_members,
    MAX(tm.last_active_at) as last_team_activity,
    COUNT(tg.id) as team_goal_count
FROM teams t
LEFT JOIN team_members tm ON t.id = tm.team_id
LEFT JOIN team_goals tg ON t.id = tg.team_id
GROUP BY t.id;

-- User Activity Summary View
CREATE VIEW user_activity_summary AS
SELECT
    u.id as user_id,
    u.name,
    u.email,
    COUNT(ws.id) as total_sessions,
    COALESCE(SUM(ws.duration_minutes), 0) as total_focus_minutes,
    COALESCE(AVG(ws.productivity_score), 0) as avg_productivity,
    COALESCE(AVG(ws.focus_score), 0) as avg_focus,
    COUNT(ss.id) as total_screenshots,
    COUNT(aa.id) as total_analyses,
    MAX(ws.started_at) as last_session
FROM users u
LEFT JOIN work_sessions ws ON u.id = ws.user_id
LEFT JOIN screenshots ss ON u.id = ss.user_id
LEFT JOIN ai_analyses aa ON u.id = aa.user_id
GROUP BY u.id, u.name, u.email;

-- ========================================
-- 13. TRIGGERS & FUNCTIONS
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
            'organizations', 'users', 'teams', 'team_members',
            'goals', 'work_sessions', 'screenshots', 'user_settings',
            'analysis_reports', 'backtest_runs'
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

SELECT 'SUCCESS: Complete OnlyWorks database schema created successfully!' as result,
       'Schema includes: Users, Teams, Goals, Sessions, Screenshots, AI Analysis, Settings, Analytics, Backtesting' as features,
       'Ready for production use with both frontend and backend' as status;