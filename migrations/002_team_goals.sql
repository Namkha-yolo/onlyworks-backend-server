-- Add team goals table for macro and micro goals
CREATE TABLE team_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    created_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    assigned_to_user_id UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NULL,
    type VARCHAR(10) NOT NULL CHECK (type IN ('macro', 'micro')),
    target_completion_date DATE NULL,
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
    progress_percentage DECIMAL(5,2) DEFAULT 0.00 CHECK (progress_percentage >= 0 AND progress_percentage <= 100),
    completed_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add foreign key to work_sessions to link to goals
ALTER TABLE work_sessions ADD COLUMN goal_id UUID NULL REFERENCES goals(id) ON DELETE SET NULL;

-- Add indexes for performance
CREATE INDEX idx_team_goals_team_id ON team_goals(team_id);
CREATE INDEX idx_team_goals_type_status ON team_goals(type, status);
CREATE INDEX idx_team_goals_assigned_user ON team_goals(assigned_to_user_id) WHERE assigned_to_user_id IS NOT NULL;
CREATE INDEX idx_work_sessions_goal_id ON work_sessions(goal_id) WHERE goal_id IS NOT NULL;

-- Add update trigger for team_goals
CREATE TRIGGER update_team_goals_updated_at BEFORE UPDATE ON team_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS on team goals
ALTER TABLE team_goals ENABLE ROW LEVEL SECURITY;

-- Team goals policy - users can access goals for teams they belong to
CREATE POLICY "Users can access team goals for their teams" ON team_goals FOR ALL USING (
    team_id IN (
        SELECT team_id FROM team_members WHERE user_id = auth.uid()
    )
);

-- Comments
COMMENT ON TABLE team_goals IS 'Team-level goals: macro goals for overall team progress, micro goals for individual tasks';
COMMENT ON COLUMN team_goals.type IS 'Goal type: macro for team-wide goals, micro for individual tasks';
COMMENT ON COLUMN team_goals.assigned_to_user_id IS 'For micro goals, which team member is responsible';

-- Sample team goal data (optional - for development)
-- INSERT INTO teams (id, name, description, created_by_user_id, invite_code) VALUES
-- ('550e8400-e29b-41d4-a716-446655440001', 'Development Team', 'Frontend & Backend Development', (SELECT id FROM users LIMIT 1), 'DEV2024');

-- INSERT INTO team_goals (team_id, created_by_user_id, title, description, type, target_completion_date) VALUES
-- ('550e8400-e29b-41d4-a716-446655440001', (SELECT id FROM users LIMIT 1), 'Launch MVP Product', 'Complete and launch the minimum viable product', 'macro', '2024-12-31'),
-- ('550e8400-e29b-41d4-a716-446655440001', (SELECT id FROM users LIMIT 1), 'Setup CI/CD Pipeline', 'Implement automated testing and deployment', 'micro', '2024-11-30');