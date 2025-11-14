# Supabase Schema Setup - Manual Instructions

## Current Status ✅
- **screenshots table**: Exists but missing columns
- **goals table**: ✅ Exists and working
- **analysis_reports table**: ❌ Missing
- **user_settings table**: ❌ Missing

## Quick Setup Instructions

### Option 1: Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard: https://supabase.com/dashboard/project/wwvhhxoukdegvbtgnafr
2. Navigate to **SQL Editor**
3. Copy and paste the SQL below
4. Click **Run**

### Option 2: Using Supabase CLI
```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link your project
supabase link --project-ref wwvhhxoukdegvbtgnafr

# Run the migration
supabase db push
```

## SQL Commands to Execute

```sql
-- Fix database schema mismatches for OnlyWorks
-- This fixes the critical issues preventing AI analysis and reporting

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

-- 4. Create user_settings table for missing /users/settings endpoint
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

-- 6. Set up permissions (optional - if using RLS)
-- ALTER TABLE analysis_reports ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- Grant basic permissions
GRANT ALL ON analysis_reports TO anon, authenticated;
GRANT ALL ON user_settings TO anon, authenticated;

-- Confirmation
SELECT 'Database schema fixed - all tables updated!' as status;
```

## Verification

After running the SQL, you can verify the setup by running:

```bash
node direct-schema-push.js
```

This should show all tables as ✅ existing.

## Expected Results

After applying these changes:

1. **Screenshots table** will have all required columns for AI analysis tracking
2. **Analysis_reports table** will store AI analysis results in the database
3. **User_settings table** will support the `/api/users/settings` endpoint
4. **Goals table** already exists and works
5. **Backend server** will work with full database persistence instead of in-memory storage

## Troubleshooting

### If column rename fails:
The `session_id` to `work_session_id` rename might fail if there are foreign key constraints. In that case:

1. Check existing data first
2. Create the new column: `ALTER TABLE screenshots ADD COLUMN work_session_id UUID;`
3. Copy data: `UPDATE screenshots SET work_session_id = session_id;`
4. Drop old column: `ALTER TABLE screenshots DROP COLUMN session_id;`

### If foreign key constraints fail:
Remove the `REFERENCES` constraints from the CREATE TABLE statements and add them manually after ensuring the referenced tables exist.

## Post-Setup

Once the schema is applied:
1. Restart your backend server
2. Test the AI analysis endpoints
3. Verify data is persisting to the database instead of in-memory storage

The OnlyWorks backend will then be fully functional with proper database persistence!