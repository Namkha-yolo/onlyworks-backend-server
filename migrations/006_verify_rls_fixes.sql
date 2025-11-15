-- ==========================================
-- RLS Performance Fix Verification Script
-- ==========================================
-- Run this script after migration 006 to verify all issues are resolved

-- ==========================================
-- 1. Check for duplicate RLS policies
-- ==========================================
SELECT
    'DUPLICATE POLICIES FOUND' as issue_type,
    tablename,
    cmd,
    array_agg(policyname) as duplicate_policies,
    count(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename, cmd, permissive, roles, qual
HAVING count(*) > 1
ORDER BY tablename, cmd;

-- ==========================================
-- 2. Check for policies still using inefficient auth.uid() pattern
-- ==========================================
SELECT
    'INEFFICIENT AUTH PATTERN' as issue_type,
    tablename,
    policyname,
    cmd,
    qual
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual LIKE '%auth.uid()%' OR with_check LIKE '%auth.uid()%')
  AND (qual NOT LIKE '%(select auth.uid())%' AND with_check NOT LIKE '%(select auth.uid())%')
ORDER BY tablename, policyname;

-- ==========================================
-- 3. Check for duplicate indexes
-- ==========================================
SELECT
    'DUPLICATE INDEX FOUND' as issue_type,
    schemaname,
    tablename,
    array_agg(indexname) as duplicate_indexes,
    count(*) as index_count
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'screenshot_sessions'
  AND indexname LIKE '%user%'
GROUP BY schemaname, tablename, indexdef
HAVING count(*) > 1
ORDER BY tablename;

-- ==========================================
-- 4. Verify all tables have proper RLS policies
-- ==========================================
SELECT
    'MISSING RLS POLICIES' as issue_type,
    t.table_name,
    CASE
        WHEN p.policyname IS NULL THEN 'No policies found'
        ELSE 'Policies exist'
    END as policy_status
FROM information_schema.tables t
LEFT JOIN (
    SELECT DISTINCT tablename
    FROM pg_policies
    WHERE schemaname = 'public'
) p ON t.table_name = p.tablename
WHERE t.table_schema = 'public'
  AND t.table_type = 'BASE TABLE'
  AND t.table_name NOT LIKE 'pg_%'
  AND t.table_name NOT LIKE 'sql_%'
  AND p.tablename IS NULL
ORDER BY t.table_name;

-- ==========================================
-- 5. Show current RLS policy summary
-- ==========================================
SELECT
    'CURRENT RLS SUMMARY' as info_type,
    tablename,
    cmd,
    count(*) as policy_count,
    array_agg(policyname ORDER BY policyname) as policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename, cmd
ORDER BY tablename, cmd;

-- ==========================================
-- 6. Performance test query examples
-- ==========================================
-- Uncomment and run these to test performance after migration:

-- Test screenshot_sessions performance:
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM screenshot_sessions
-- WHERE user_id = auth.uid()
-- LIMIT 10;

-- Test screenshots performance:
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM screenshots
-- WHERE user_id = auth.uid()
-- LIMIT 10;

-- Test goals performance:
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM goals
-- WHERE user_id = auth.uid()
-- LIMIT 10;