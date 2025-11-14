-- Essential Tables Creation - Minimal Working Set
-- This creates ONLY the tables needed to fix immediate errors

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Teams table (fixes team_code error)
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    team_code VARCHAR(50) UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_by UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Team members table
CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    role VARCHAR(50) DEFAULT 'member',
    status VARCHAR(20) DEFAULT 'active',
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(team_id, user_id)
);

-- 3. User sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    session_name VARCHAR(255) NOT NULL DEFAULT 'Work Session',
    goal_description TEXT,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    end_time TIMESTAMP WITH TIME ZONE NULL,
    duration_minutes INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    productivity_score DECIMAL(3,1) DEFAULT NULL,
    focus_score DECIMAL(3,1) DEFAULT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Goal categories table (must come before user_goals)
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

-- 5. User goals table
CREATE TABLE IF NOT EXISTS user_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    category_id UUID REFERENCES goal_categories(id),
    title VARCHAR(500) NOT NULL,
    description TEXT,
    goal_type VARCHAR(50) NOT NULL,
    priority VARCHAR(20) DEFAULT 'medium',
    status VARCHAR(20) DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. AI analyses table
CREATE TABLE IF NOT EXISTS ai_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES user_sessions(id),
    user_id UUID NOT NULL,
    analysis_type VARCHAR(50) NOT NULL,
    model_used VARCHAR(100) NOT NULL,
    detected_activity VARCHAR(255),
    productivity_score DECIMAL(3,1),
    focus_level DECIMAL(3,1),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 7. User settings table
CREATE TABLE IF NOT EXISTS user_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    capture_settings JSONB DEFAULT '{}',
    ai_settings JSONB DEFAULT '{}',
    ui_preferences JSONB DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create basic indexes
CREATE INDEX IF NOT EXISTS idx_teams_team_code ON teams(team_code);
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_goals_user_id ON user_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_analyses_user_id ON ai_analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);

-- Success confirmation
SELECT 'SUCCESS: Essential tables created successfully!' as result;