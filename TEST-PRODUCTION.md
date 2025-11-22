# 🧪 Test Report Generation on Render (Production)

## Step 1: Get Your JWT Token

**Option A: From Browser DevTools**
1. Open your OnlyWorks app in browser
2. Press F12 (DevTools)
3. Go to **Application** tab → **Local Storage** or **Session Storage**
4. Find key like `authToken` or `token`
5. Copy the value (starts with `eyJ...`)

**Option B: From Network Tab**
1. Open DevTools → **Network** tab
2. Refresh the page
3. Find any API request to your backend
4. Check **Headers** section → **Authorization** header
5. Copy the token after `Bearer `

---

## Step 2: Get Session IDs from Supabase

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Click **Table Editor** → `screenshot_sessions` table
4. Copy 2-3 session IDs from the `id` column
5. Make sure they belong to the same `user_id` as your JWT token

**Quick SQL Query (in SQL Editor):**
```sql
SELECT
  id,
  user_id,
  session_name,
  status,
  screenshot_count,
  created_at
FROM screenshot_sessions
ORDER BY created_at DESC
LIMIT 5;
```

Copy the `id` values (UUIDs).

---

## Step 3: Test with cURL

**Replace these values:**
- `YOUR_JWT_TOKEN` - from Step 1
- `session-id-1` and `session-id-2` - from Step 2

```bash
curl -X POST https://onlyworks-backend-server.onrender.com/api/reports/generate-from-sessions \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "sessionIds": ["session-id-1", "session-id-2"],
    "title": "Test Report",
    "developerName": "Your Name"
  }'
```

---

## Step 4: Test with Postman/Insomnia

### Postman Setup:
1. Create new **POST** request
2. URL: `https://onlyworks-backend-server.onrender.com/api/reports/generate-from-sessions`
3. **Headers** tab:
   - `Authorization`: `Bearer YOUR_JWT_TOKEN`
   - `Content-Type`: `application/json`
4. **Body** tab → **raw** → **JSON**:
```json
{
  "sessionIds": ["session-id-1", "session-id-2"],
  "title": "Weekly Progress Report",
  "developerName": "John Doe"
}
```
5. Click **Send**

---

## Expected Success Response:

```json
{
  "success": true,
  "data": {
    "success": true,
    "id": "abc123...",
    "shareUrl": "https://only-works.com/r/xyz789",
    "shareToken": "xyz789",
    "expiresAt": "2025-12-21T...",
    "title": "Weekly Progress Report",
    "summary": "Comprehensive report generated from 2 work sessions...",
    "goal_alignment": "Sessions analyzed for goal alignment...",
    "blockers": "Analysis of productivity blockers...",
    "productivity_score": 0.85,
    "start_date": "2025-11-15",
    "end_date": "2025-11-21"
  },
  "message": "Report generated and shareable link created successfully"
}
```

---

## Step 5: Verify the Report

1. Copy the `shareUrl` from the response
2. Open it in your browser: `https://only-works.com/r/xyz789`
3. Should see the report WITHOUT needing to log in ✅
4. Report should display all 8 OnlyWorks sections

---

## Troubleshooting

### Error: "AUTH_REQUIRED"
- Your JWT token is missing or invalid
- Make sure you copied the full token
- Token should start with `eyJ`

### Error: "sessionIds must be an array"
- Check JSON syntax is correct
- `sessionIds` should be an array: `["id1", "id2"]`

### Error: "sessionIds array cannot be empty"
- You need at least 1 session ID
- Maximum 50 sessions per report

### Error: "No sessions found" / 404
- Session IDs don't exist in database
- OR sessions don't belong to the user (JWT token user_id)
- Verify session IDs are correct in Supabase

### Error: 500 Internal Server Error
- Check Render logs: https://dashboard.render.com → your service → Logs
- Look for error messages about:
  - Supabase connection
  - Storage upload
  - Missing environment variables

---

## Check Render Logs

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click your `onlyworks-backend-server` service
3. Click **Logs** tab
4. Look for:
   - ✅ `Generating report from selected sessions`
   - ✅ `Uploading HTML to storage`
   - ✅ `Creating shared report entry`
   - ✅ `Report generated successfully`

---

## Quick Test (No Setup Required)

If you just want to test the endpoint is working:

```bash
# This will fail with AUTH_REQUIRED, but proves endpoint exists
curl -X POST https://onlyworks-backend-server.onrender.com/api/reports/generate-from-sessions \
  -H "Content-Type: application/json" \
  -d '{"sessionIds": ["test"]}'
```

**Expected error response:**
```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "Authentication required"
  }
}
```

If you see this, the endpoint is live! ✅

---

## Next Steps After Success

1. ✅ Report generated successfully
2. ✅ Shareable URL works
3. ✅ Report displays on website

Then test:
- Generating reports with different session counts
- Different title/developerName values
- Check expiry date is 30 days from now
- Verify report shows in Supabase:
  - `reports` table (structured data)
  - `shared_reports` table (sharing info)
  - `reports` storage bucket (HTML file)
