-- Find sessions with screenshots for testing
-- Copy this query and run it in Supabase SQL Editor

SELECT
  ss.id as session_id,
  ss.user_id,
  ss.session_name,
  ss.status,
  COUNT(s.id) as screenshot_count,
  ARRAY_AGG(s.id ORDER BY s.created_at) as screenshot_ids
FROM screenshot_sessions ss
LEFT JOIN screenshots s ON s.session_id = ss.id
WHERE ss.status = 'completed'  -- or 'active' if you want active sessions
GROUP BY ss.id, ss.user_id, ss.session_name, ss.status
HAVING COUNT(s.id) > 0  -- only sessions with screenshots
ORDER BY ss.created_at DESC
LIMIT 10;

-- This will show you the 10 most recent completed sessions with:
-- - session_id (copy this)
-- - user_id (copy this)
-- - screenshot_count (how many screenshots)
-- - screenshot_ids (array of all screenshot IDs - copy this)
