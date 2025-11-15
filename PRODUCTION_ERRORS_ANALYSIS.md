# Production Error Analysis - 2025-11-15

## Summary of Critical Issues

Based on production logs from `2025-11-15T06:56:51.417Z`, three critical issues are causing application failures:

1. **Duplicate Users in Database** (Backend Issue) - HIGH SEVERITY
2. **Invalid Session ID Format** (Frontend Issue) - HIGH SEVERITY
3. **Missing sessionId in Screenshot Upload** (Frontend Issue) - MEDIUM SEVERITY

---

## Error #1: Duplicate Users in Database ❌

### Error Message
```
"Failed to find users by ID"
"Cannot coerce the result to a single JSON object"
User ID: 391d9929-6afc-4d39-8ef1-fdc62bc02158
```

### Root Cause Analysis

**What's Happening:**
- Supabase query: `SELECT * FROM users WHERE id = '391d9929...' LIMIT 1` returns **multiple rows**
- `.single()` method expects exactly 1 row, throws error when finding 2+
- This happens in `UserSessionService.js:36` and `UserRepository.findById()`

**Why This Happened:**
1. User was originally created in `public.users` table via OAuth
2. Migration 003 (`003_migrate_profiles_to_users.sql`) copied same user from `profiles` table
3. Migration's `WHERE NOT EXISTS` check failed because it checked `id OR auth_user_id OR email`
4. If user had different values in `profiles.id` vs `users.id`, the check passed incorrectly
5. Result: Same user inserted twice with same `id`

**Affected Code:**
- `src/services/UserSessionService.js:36` - `await this.userRepository.findById(userId)`
- `src/repositories/UserRepository.js` - any query using `.single()`

### Diagnostic Query

Run in Supabase SQL Editor to verify:

```sql
-- Check for specific user from error logs
SELECT COUNT(*), id, email, auth_user_id, created_at
FROM public.users
WHERE id = '391d9929-6afc-4d39-8ef1-fdc62bc02158'
GROUP BY id, email, auth_user_id, created_at;
-- Expected: COUNT = 1 (currently likely 2+)

-- Find ALL duplicate users
SELECT
    id,
    email,
    COUNT(*) as duplicate_count,
    array_agg(ctid::text) as physical_rows,
    array_agg(created_at) as created_timestamps
FROM public.users
GROUP BY id, email
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
```

### Solution

**OPTION 1: Run Migration 004** (Recommended)

Created `migrations/004_fix_duplicate_users.sql` which:
1. Identifies all duplicate users
2. Keeps the most complete row (most non-null fields + latest `updated_at`)
3. Deletes duplicate rows
4. Verifies no duplicates remain
5. Ensures unique constraints on `id` and `email`

**To Execute:**
```sql
-- In Supabase SQL Editor
\i migrations/004_fix_duplicate_users.sql
```

**OPTION 2: Manual Fix for Single User**

```sql
-- 1. Find all rows for this user
SELECT ctid, * FROM public.users
WHERE id = '391d9929-6afc-4d39-8ef1-fdc62bc02158';

-- 2. Manually delete duplicates (keep row with most data)
-- Example: Keep row with ctid (0,1), delete (0,2)
DELETE FROM public.users
WHERE id = '391d9929-6afc-4d39-8ef1-fdc62bc02158'
AND ctid = '(0,2)';  -- Replace with actual ctid to delete
```

**OPTION 3: Prevent Future Duplicates**

Update `UserRepository.js` to use `maybeSingle()` instead of `single()`:

```javascript
// Before
const { data, error } = await this.supabase
  .from('users')
  .select('*')
  .eq('id', userId)
  .single();  // Throws on 0 or 2+ rows

// After
const { data, error } = await this.supabase
  .from('users')
  .select('*')
  .eq('id', userId)
  .maybeSingle();  // Returns null on 0 rows, first row on 2+ rows

if (!data) {
  throw new Error('User not found');
}
```

### Prevention

1. **Add unique constraint verification to migration 003**
2. **Always use `ON CONFLICT DO NOTHING` or `ON CONFLICT DO UPDATE` in INSERT queries**
3. **Add database-level unique constraints early in schema**

---

## Error #2: Invalid Session ID Format ❌

### Error Message
```
"invalid input syntax for type uuid: 'session-1763189801256'"
```

### Root Cause Analysis

**What's Happening:**
- Desktop app creates session IDs like: `"session-1763189801256"` (string prefix + timestamp)
- Database `screenshot_sessions.id` column type is **UUID**
- PostgreSQL cannot cast `"session-1763189801256"` to UUID
- Query fails: `UPDATE screenshot_sessions SET ... WHERE id = 'session-1763189801256'::uuid`

**Where It Fails:**
- `src/repositories/WorkSessionRepository.js:59` - `endSession(sessionId, userId)`
- `PUT /api/sessions/:sessionId/end` endpoint
- Any operation using session ID from desktop app

**Database Schema:**
```sql
CREATE TABLE screenshot_sessions (
    id UUID PRIMARY KEY,  -- ⚠️ Expects UUID format
    user_id UUID REFERENCES users(id),
    session_name TEXT,
    status TEXT,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ
);
```

### Solution

**OPTION 1: Fix Desktop App** (Recommended)

Change desktop app to generate proper UUIDs:

```javascript
// ❌ WRONG - Current implementation
const sessionId = `session-${Date.now()}`;
// Returns: "session-1763189801256"

// ✅ CORRECT - Use UUID library
const { v4: uuidv4 } = require('uuid');
const sessionId = uuidv4();
// Returns: "391d9929-6afc-4d39-8ef1-fdc62bc02158"
```

**OPTION 2: Change Backend to Accept String IDs**

Update database schema to use TEXT instead of UUID:

```sql
-- WARNING: This is a breaking change requiring data migration
ALTER TABLE screenshot_sessions ALTER COLUMN id TYPE TEXT;
ALTER TABLE screenshot_sessions ALTER COLUMN user_id TYPE TEXT;

-- Update all foreign keys to TEXT as well
-- ... (many more ALTER statements needed)
```

**NOT RECOMMENDED** because:
- UUIDs provide better performance and indexing
- UUID prevents ID collisions across distributed systems
- Changing PK type requires updating ALL foreign keys

**OPTION 3: Backend Conversion (Hacky)**

Add middleware to convert string session IDs to UUIDs:

```javascript
// In WorkSessionRepository or middleware
function normalizeSessionId(sessionId) {
  if (sessionId.startsWith('session-')) {
    // Hash the string session ID into a deterministic UUID
    const crypto = require('crypto');
    const hash = crypto.createHash('md5').update(sessionId).digest('hex');
    return `${hash.substr(0,8)}-${hash.substr(8,4)}-${hash.substr(12,4)}-${hash.substr(16,4)}-${hash.substr(20,12)}`;
  }
  return sessionId;
}
```

**NOT RECOMMENDED** because:
- Adds complexity and performance overhead
- Hides the real problem (desktop app generating wrong IDs)
- Could cause ID collisions

### Prevention

1. **Define session ID format in API contract/documentation**
2. **Add validation on session creation endpoint**
3. **Return generated UUID from backend's session creation endpoint**

---

## Error #3: Missing sessionId in Screenshot Upload ❌

### Error Message
```
"Required field is missing"
POST /api/screenshots/upload
```

### Root Cause Analysis

**What's Happening:**
- `POST /api/screenshots/upload` endpoint validates required fields
- Desktop app is NOT sending `sessionId` in request body
- Validation fails at `src/controllers/ScreenshotController.js:62` or `line 66`

**Validation Code:**
```javascript
// Line 60-66 in ScreenshotController.js
if (uploadedFile) {
  // File upload - sessionId required
} else {
  // Metadata-only upload
  validateRequired(req.body, ['sessionId', 'file_storage_key', 'file_size_bytes']);
}

// Always validate sessionId
validateRequired(req.body, ['sessionId']);  // ⚠️ Fails here
```

**What Desktop App is Sending:**
```javascript
// Current (WRONG)
{
  file_storage_key: "...",
  file_size_bytes: 2048576,
  window_title: "Visual Studio Code",
  active_app: "Code"
  // ❌ Missing sessionId
}

// Should be (CORRECT)
{
  sessionId: "391d9929-...",  // ✅ UUID format
  file_storage_key: "...",
  file_size_bytes: 2048576,
  window_title: "Visual Studio Code",
  active_app: "Code"
}
```

### Solution

**Fix Desktop App Request**

Update desktop app's screenshot upload to include `sessionId`:

```javascript
// Desktop app code
async function uploadScreenshot(screenshot, currentSessionId) {
  const formData = new FormData();

  // Add the file
  formData.append('screenshot', screenshot.file);

  // ✅ Add sessionId to body
  formData.append('sessionId', currentSessionId);

  // Add metadata
  formData.append('window_title', screenshot.windowTitle);
  formData.append('active_app', screenshot.activeApp);

  const response = await fetch(`${API_URL}/api/screenshots/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    },
    body: formData
  });
}
```

### Prevention

1. **Add TypeScript types for request payloads**
2. **Return better error messages showing which field is missing**
3. **Add request validation examples to API documentation**

---

## Immediate Action Plan

### Step 1: Fix Database (Backend - Run Now)
```bash
# In Supabase SQL Editor
\i migrations/004_fix_duplicate_users.sql
```

**Verification:**
```sql
-- Should return 0 rows
SELECT id, COUNT(*) FROM users GROUP BY id HAVING COUNT(*) > 1;
```

### Step 2: Fix Desktop App Session IDs (Frontend)

**File**: `desktop-app/src/services/sessionManager.js` (or similar)

```javascript
// Install uuid package
npm install uuid

// Change session ID generation
const { v4: uuidv4 } = require('uuid');

function startSession() {
  const sessionId = uuidv4();  // ✅ Proper UUID
  // ... rest of session logic
}
```

### Step 3: Fix Desktop App Screenshot Upload (Frontend)

**File**: `desktop-app/src/services/screenshotUploader.js` (or similar)

```javascript
function uploadScreenshot(screenshot, sessionId) {
  const formData = new FormData();
  formData.append('screenshot', screenshot.file);
  formData.append('sessionId', sessionId);  // ✅ Add this
  formData.append('window_title', screenshot.windowTitle);
  formData.append('active_app', screenshot.activeApp);
  // ...
}
```

---

## Testing Checklist

After applying fixes, verify:

- [ ] User `391d9929-6afc-4d39-8ef1-fdc62bc02158` can authenticate successfully
- [ ] No "Cannot coerce to single JSON object" errors in logs
- [ ] Screenshot upload succeeds with `sessionId` included
- [ ] Session creation returns proper UUID format
- [ ] Session ending works without UUID parsing errors
- [ ] No duplicate users in database (query returns 0 rows)

---

## Long-term Improvements

1. **Add database constraints**
   - Unique constraint on `users.id` (should exist via PK)
   - Unique constraint on `users.email`
   - Check constraints on session status values

2. **Improve error messages**
   - Return which field is missing in validation errors
   - Add error codes for better client-side handling

3. **Add request/response validation**
   - Use JSON Schema or Zod for type validation
   - Add OpenAPI/Swagger documentation

4. **Add integration tests**
   - Test screenshot upload flow end-to-end
   - Test session lifecycle (create → upload → end)
   - Test duplicate user prevention

5. **Add monitoring**
   - Alert on "Cannot coerce to single JSON object" errors
   - Track session creation/ending success rates
   - Monitor screenshot upload failure reasons
