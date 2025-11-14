# Database Schema Migration Instructions

## ⚠️ CRITICAL: Missing Frontend Tables

The OnlyWorks frontend requires additional database tables that are currently missing. This is causing the `team_code` column error and other functionality issues.

## Required Migrations

You need to apply these SQL migrations to your Supabase database:

### 1. User Onboarding Schema (if not already applied)
```bash
# Apply the user onboarding migration
node apply-user-onboarding-migration.js
```
**File**: `migrations/003_complete_user_onboarding_schema.sql`

### 2. Frontend Requirements Schema (REQUIRED)
**File**: `migrations/004_frontend_requirements_schema.sql`

**This migration adds ALL missing tables:**
- `user_sessions` - Session tracking
- `user_goals` - Goal management
- `teams`, `team_members` - Team collaboration
- `ai_analyses` - AI analysis results
- `productivity_insights` - Analytics
- `user_settings` - User preferences

## How to Apply the Migration

### Option 1: Supabase Dashboard (Recommended)
1. Go to your Supabase project dashboard
2. Navigate to **SQL Editor**
3. Copy and paste the content of `migrations/004_frontend_requirements_schema.sql`
4. Click **Run** to execute the migration

### Option 2: Direct SQL Connection
If you have direct database access:
```sql
-- Copy and paste the entire content of:
-- migrations/004_frontend_requirements_schema.sql
```

### Option 3: Supabase CLI
```bash
# If you have Supabase CLI set up
supabase db reset
# Then run your migrations in order
```

## Verification

After applying the migration, verify that these tables exist:
- `user_sessions`
- `user_goals`
- `teams`
- `team_members`
- `ai_analyses`
- `productivity_insights`
- `user_settings`

## Why This Migration is Critical

The frontend application expects these tables and will fail without them:

1. **Session Management**: `sessionStore.ts` requires `user_sessions` table
2. **Goal Tracking**: `goalsStore.ts` requires `user_goals` and `goal_categories`
3. **Team Features**: `teamStore.ts` requires `teams` and `team_members`
4. **Analytics**: Various components require `ai_analyses` and `productivity_insights`
5. **Settings**: User preferences require `user_settings` table

## Current Error Context

The error `column "team_code" does not exist` indicates the `teams` table is missing the `team_code` column, which means the entire teams schema hasn't been created yet.

## Next Steps

1. **Immediate**: Apply the `004_frontend_requirements_schema.sql` migration
2. **Optional**: Also apply `003_complete_user_onboarding_schema.sql` for enhanced user fields
3. **Verify**: Check that all tables exist in your Supabase dashboard
4. **Test**: Restart your backend server to pick up the new schema

The schema migration I created is comprehensive and includes all the tables, indexes, triggers, and views needed for full frontend compatibility.