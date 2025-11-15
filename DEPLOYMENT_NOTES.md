# Deployment Notes - Fix Database Foreign Keys and API Routes

## Changes Made (2025-11-15)

### 1. Database Migration Required ⚠️

**File:** `migrations/001_fix_user_foreign_keys.sql`

**What it does:** Updates all foreign key constraints to reference `users(id)` instead of `profiles(id)`

**Why:** Your application uses the `users` table for authentication, but all FK constraints were pointing to the `profiles` table, causing:
- Screenshot uploads failing
- Session creation failing
- User lookup failures (find_user_by_id errors)

**How to run:**
1. **BACKUP YOUR DATABASE FIRST!**
2. Go to Supabase Dashboard → SQL Editor
3. Copy contents of `migrations/001_fix_user_foreign_keys.sql`
4. Run the SQL
5. Verify with the query at the bottom of the migration file

**Affected tables:**
- screenshots
- screenshot_sessions
- batch_reports
- session_goals
- session_reports
- session_summaries
- screenshot_analysis
- system_activity_logs
- platform_usage
- goals
- reports
- user_insights
- processing_queue
- email_logs
- admin_actions

### 2. New API Route: `/api/ai/analyze` ✅

**File:** `src/routes/aiRoutes.js`

**Endpoints added:**
- `POST /api/ai/analyze` - Analyze screenshots using AI
- `POST /api/ai/batch-analyze` - Batch analyze multiple screenshots
- `GET /api/ai/health` - Check AI service health

**Why:** Your frontend was calling `POST /api/ai/analyze` but this route didn't exist, causing 404 errors.

**Integrated into:** `src/app.js` line 108

### 3. Root Health Check Routes ✅

**Added to:** `src/app.js` lines 111-122

**Endpoints:**
- `GET /` - Returns JSON status
- `HEAD /` - Returns 200 OK (for load balancers)

**Why:** Health check systems (Vercel, monitoring services) were getting 404 errors when checking the root path.

## Deployment Steps

### Step 1: Run Database Migration

```bash
# Option 1: Supabase Dashboard (RECOMMENDED)
1. Login to Supabase
2. Go to SQL Editor
3. Paste migrations/001_fix_user_foreign_keys.sql
4. Click "Run"
5. Verify with the verification query
```

### Step 2: Deploy Backend Code

```bash
# If using Vercel
git add .
git commit -m "Fix: Update FK constraints to users table, add /api/ai routes"
git push

# Vercel will auto-deploy
```

### Step 3: Verify Everything Works

1. **Check root health:**
   ```bash
   curl https://your-api.onrender.com/
   # Should return: {"status":"ok","service":"onlyworks-backend",...}
   ```

2. **Check AI endpoint:**
   ```bash
   curl https://your-api.onrender.com/api/ai/health
   # Should return AI service status
   ```

3. **Test screenshot upload:**
   - Start a session in your app
   - Upload a screenshot
   - Should no longer get FK constraint errors

4. **Check logs:**
   - No more "Requested resource was not found" for GET/HEAD /
   - No more "find_user_by_id" errors
   - No more 404 for POST /api/ai/analyze

## What Was Fixed

### Before:
- ❌ `GET /` → 404 error
- ❌ `HEAD /` → 404 error
- ❌ `POST /api/ai/analyze` → 404 error
- ❌ Screenshot uploads → FK constraint error
- ❌ Session creation → find_user_by_id error
- ❌ User queries → no user found

### After:
- ✅ `GET /` → Returns health status
- ✅ `HEAD /` → Returns 200 OK
- ✅ `POST /api/ai/analyze` → Analyzes screenshots
- ✅ Screenshot uploads → Saves correctly
- ✅ Session creation → Works properly
- ✅ User queries → Finds users correctly

## Rollback Plan

If something goes wrong:

### Rollback Database Migration:
```sql
-- Re-run migration but change all:
-- REFERENCES public.users(id)
-- back to:
-- REFERENCES public.profiles(id)
```

### Rollback Code:
```bash
git revert HEAD
git push
```

## Notes

- The migration does NOT modify any data, only constraints
- All existing data will remain intact
- The migration adds ON DELETE CASCADE to all FK constraints
- Make sure to test in a staging environment first if available
