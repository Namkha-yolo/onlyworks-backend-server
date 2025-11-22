# 🚀 Simple Test - No Token Required

## Step 1: Get Session IDs from Supabase

1. Go to: https://supabase.com/dashboard
2. Select your OnlyWorks project
3. Click **SQL Editor** (left sidebar)
4. Click **New Query**
5. Paste and run:

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
LIMIT 10;
```

6. **Copy 2-3 `id` values** and the `user_id`

---

## Step 2: Get JWT Secret from Render

1. Go to: https://dashboard.render.com
2. Click your **onlyworks-backend-server** service
3. Click **Environment** in left sidebar
4. Find **JWT_SECRET** value
5. Copy it

---

## Step 3: Run Test Generator

I'll create a token for you and run the test!

Just paste here:
- **User ID**: (from Supabase)
- **Session IDs**: (2-3 UUIDs from Supabase)
- **JWT_SECRET**: (from Render)

Then I'll generate the test and run it for you!

---

## Alternative: Test Without Creating Files

Send me just the **Session IDs** and I'll show you how to test using:
- Postman
- cURL command with a demo token
- Or direct Supabase function call
