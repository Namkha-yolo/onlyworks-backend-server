# Report Sharing Feature - Frontend Integration Guide

## Overview
The report sharing feature allows users to generate shareable OnlyWorks reports from multiple sessions and share them via public URLs without authentication.

## API Endpoints

### 1. Generate Shareable Report
**POST** `/api/reports/generate-from-sessions`

**Authentication:** Required (JWT Bearer token)

**Request Body:**
```json
{
  "sessionIds": ["uuid1", "uuid2", ...],
  "title": "My Weekly Report",           // Optional, defaults to "OnlyWorks Productivity Report"
  "developerName": "John Doe"            // Optional
}
```

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "success": true,
    "id": "58a55219-14ea-4426-911c-a60a47c08fa1",
    "reportId": "58a55219-14ea-4426-911c-a60a47c08fa1",
    "shareToken": "139a32a4-3790-46e9-ad94-3bdf066048db",
    "shareUrl": "https://only-works.com/r/139a32a4-3790-46e9-ad94-3bdf066048db",
    "expiresAt": "2025-12-22T02:48:22.882Z",
    "title": "My Weekly Report",

    // OnlyWorks 8 Sections
    "summary": "Comprehensive report generated from 2 work sessions...",
    "goal_alignment": "Sessions analyzed for goal alignment...",
    "blockers": "Analysis of productivity blockers...",
    "recognition": "Strong focus maintained across sessions...",
    "automation_opportunities": "Identified opportunities for workflow automation...",
    "communication_quality": "Communication effectiveness analyzed...",
    "next_steps": "Continue maintaining consistent work patterns...",
    "ai_usage_efficiency": "AI tools usage and efficiency metrics...",

    // Metrics
    "productivity_score": 85.5,            // Can be null
    "focus_score": 92.3,                   // Can be null
    "session_duration_minutes": 240,
    "screenshot_count": 120,
    "session_count": 2,
    "start_date": "2025-11-21T03:15:11.949Z",
    "end_date": "2025-11-21T03:31:22.756Z",
    "date_range": {
      "startDate": "2025-11-21T03:15:11.949Z",
      "endDate": "2025-11-21T03:31:22.756Z"
    },

    // Storage details
    "created_at": "2025-11-22T02:48:23.002Z",
    "storage_path": "user-id/report-id.html.gz",
    "view_count": 0,
    "metadata": {
      "storagePath": "user-id/report-id.html.gz",
      "viewCount": 0,
      "createdAt": "2025-11-22T02:48:23.002Z",
      "sessionIds": ["uuid1", "uuid2"],
      "sessionCount": 2
    }
  },
  "message": "Report generated and shareable link created successfully"
}
```

**Error Response (400 Bad Request):**
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "details": {
      "sessionIds": "At least one session ID is required"
    },
    "timestamp": "2025-11-22T02:48:23.002Z",
    "request_id": "req_123456789"
  }
}
```

**Error Response (500 Internal Server Error):**
```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An internal server error occurred",
    "details": {
      "message": "Failed to generate report from sessions",
      "details": "Database connection failed"
    },
    "timestamp": "2025-11-22T02:48:23.002Z",
    "request_id": "req_123456789"
  }
}
```

---

### 2. View Shared Report (Public)
**GET** `/api/batch/shared/:shareToken`

**Authentication:** NOT required (public access)

**URL Parameters:**
- `shareToken` - The unique share token (UUID)

**Success Response (200 OK):**
```json
{
  "success": true,
  "data": {
    "title": "My Weekly Report",
    "htmlUrl": "https://supabase.co/storage/...?token=...",  // Signed URL valid for 7 days
    "createdAt": "2025-11-22T03:12:11.878Z",
    "expiresAt": "2025-12-22T03:12:11.878Z",                 // 30 days from creation
    "viewCount": 5,
    "metadata": {
      "duration": 240,
      "developer": "John Doe",
      "report_id": "58a55219-14ea-4426-911c-a60a47c08fa1",
      "date_range": {
        "startDate": "2025-11-21T03:15:11.949Z",
        "endDate": "2025-11-21T03:31:22.756Z"
      },
      "session_ids": ["uuid1", "uuid2"],
      "session_count": 2,
      "lines_written": 450,
      "files_modified": 12
    }
  },
  "message": "Shared report retrieved successfully"
}
```

**Error Response (404 Not Found):**
```json
{
  "success": false,
  "message": "Shared report not found or has expired"
}
```

**Note:** The `htmlUrl` is a Supabase Storage signed URL. To display the report:
1. Fetch the URL: `fetch(data.htmlUrl)`
2. Decompress the gzip data (browser handles this automatically)
3. Display the HTML in an iframe or render directly

---

## Frontend Implementation Guide

### 1. Generate Report Flow

**User Flow:**
1. User selects multiple sessions from Reports page
2. User clicks "Generate Shareable Report"
3. Show loading state
4. Call API to generate report
5. Show success with shareable URL
6. Allow user to copy URL or open it

**Example Code:**
```typescript
interface GenerateReportRequest {
  sessionIds: string[];
  title?: string;
  developerName?: string;
}

interface GenerateReportResponse {
  success: boolean;
  data: {
    reportId: string;
    shareToken: string;
    shareUrl: string;        // Use this for sharing
    expiresAt: string;
    title: string;
    summary: string;
    // ... all OnlyWorks 8 sections
    productivity_score: number | null;
    focus_score: number | null;
    session_count: number;
    // ... other metrics
  };
  message: string;
}

async function generateShareableReport(
  sessionIds: string[],
  title?: string,
  developerName?: string
): Promise<GenerateReportResponse> {
  const response = await fetch(
    'https://onlyworks-backend-server.onrender.com/api/reports/generate-from-sessions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      },
      body: JSON.stringify({ sessionIds, title, developerName })
    }
  );

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Failed to generate report');
  }

  return response.json();
}

// Usage
try {
  const result = await generateShareableReport(
    ['session-id-1', 'session-id-2'],
    'Weekly Report - Nov 18-24',
    'John Doe'
  );

  // Copy to clipboard
  navigator.clipboard.writeText(result.data.shareUrl);

  // Or open in new tab
  window.open(result.data.shareUrl, '_blank');

  console.log('Report expires:', new Date(result.data.expiresAt));
} catch (error) {
  console.error('Failed to generate report:', error);
}
```

---

### 2. View Shared Report (Public Page)

**Route:** `/r/:shareToken`

**User Flow:**
1. User opens shared URL (e.g., `https://only-works.com/r/139a32a4...`)
2. Frontend extracts `shareToken` from URL
3. Call API to get report metadata and HTML URL
4. Download and display the HTML report
5. No authentication required

**Example Code:**
```typescript
interface SharedReport {
  title: string;
  htmlUrl: string;
  createdAt: string;
  expiresAt: string;
  viewCount: number;
  metadata: {
    report_id: string;
    session_count: number;
    date_range: {
      startDate: string;
      endDate: string;
    };
    // ... other metadata
  };
}

async function getSharedReport(shareToken: string): Promise<SharedReport> {
  const response = await fetch(
    `https://onlyworks-backend-server.onrender.com/api/batch/shared/${shareToken}`
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Report not found or has expired');
    }
    throw new Error('Failed to load report');
  }

  const result = await response.json();
  return result.data;
}

// React component example
function SharedReportPage() {
  const { shareToken } = useParams();
  const [report, setReport] = useState<SharedReport | null>(null);
  const [htmlContent, setHtmlContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadReport() {
      try {
        setLoading(true);

        // Get report metadata
        const reportData = await getSharedReport(shareToken);
        setReport(reportData);

        // Download HTML content
        const htmlResponse = await fetch(reportData.htmlUrl);
        const htmlText = await htmlResponse.text();
        setHtmlContent(htmlText);

      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadReport();
  }, [shareToken]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div>
      <ReportHeader
        title={report.title}
        createdAt={report.createdAt}
        expiresAt={report.expiresAt}
        viewCount={report.viewCount}
      />

      {/* Display HTML in iframe (safest) */}
      <iframe
        srcDoc={htmlContent}
        style={{ width: '100%', height: '100vh', border: 'none' }}
        sandbox="allow-same-origin"
      />

      {/* OR render directly (if you trust the content) */}
      {/* <div dangerouslySetInnerHTML={{ __html: htmlContent }} /> */}
    </div>
  );
}
```

---

## Important Constants & Configuration

### Share URL Format
```
Frontend URL: https://only-works.com/r/{shareToken}
Backend API:  https://onlyworks-backend-server.onrender.com/api/batch/shared/{shareToken}
```

### Expiry Duration
- **Default:** 30 days from creation
- Check `expiresAt` field in response

### OnlyWorks 8 Sections
The report includes these sections (in order):
1. `summary` - Executive Summary
2. `goal_alignment` - Goal Alignment
3. `blockers` - Blockers & Challenges
4. `recognition` - Recognition & Wins
5. `automation_opportunities` - Automation Opportunities
6. `communication_quality` - Communication Quality
7. `next_steps` - Next Steps
8. `ai_usage_efficiency` - AI Usage Efficiency (optional)

### Nullable Fields
These fields can be `null`:
- `productivity_score`
- `focus_score`
- `ai_usage_efficiency`
- `developerName`

---

## Error Handling

### Common Error Codes
```typescript
enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',      // 400 - Invalid request
  AUTH_REQUIRED = 'AUTH_REQUIRED',            // 401 - Missing/invalid auth
  FORBIDDEN = 'FORBIDDEN',                    // 403 - No permission
  NOT_FOUND = 'RESOURCE_NOT_FOUND',          // 404 - Resource not found
  INTERNAL_ERROR = 'INTERNAL_ERROR'           // 500 - Server error
}

interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details: any;
    timestamp: string;
    request_id: string;
  };
}
```

### Error Handling Example
```typescript
try {
  const report = await generateShareableReport(sessionIds);
} catch (error) {
  if (error.response?.status === 400) {
    // Show validation errors to user
    showError('Please select at least one session');
  } else if (error.response?.status === 401) {
    // Redirect to login
    redirectToLogin();
  } else {
    // Generic error
    showError('Failed to generate report. Please try again.');
  }
}
```

---

## Security Considerations

### 1. Shared Reports Are Public
- Anyone with the share token can view the report
- No authentication required
- Warn users before sharing sensitive information

### 2. Token Security
- Share tokens are UUIDs (cryptographically random)
- Cannot be guessed or enumerated
- Expire after 30 days

### 3. Content Security
- HTML reports are static (no JavaScript execution in iframe with sandbox)
- Use `sandbox="allow-same-origin"` for iframe display
- Or use `dangerouslySetInnerHTML` only if you trust the backend

### 4. Rate Limiting
- Backend may implement rate limiting on report generation
- Recommended: Debounce "Generate Report" button clicks
- Show loading state to prevent duplicate requests

---

## UI/UX Recommendations

### Generate Report Button
```typescript
<Button
  onClick={handleGenerateReport}
  disabled={selectedSessions.length === 0 || isGenerating}
  loading={isGenerating}
>
  {isGenerating ? 'Generating Report...' : 'Generate Shareable Report'}
</Button>
```

### Share URL Display
```typescript
<div className="share-url-container">
  <input
    type="text"
    value={report.shareUrl}
    readOnly
    onClick={(e) => e.target.select()}
  />
  <Button onClick={() => copyToClipboard(report.shareUrl)}>
    Copy Link
  </Button>
  <Button onClick={() => window.open(report.shareUrl, '_blank')}>
    Open Report
  </Button>
</div>

<p className="expiry-notice">
  Link expires: {formatDate(report.expiresAt)}
</p>
```

### Expiry Warning
```typescript
function ExpiryWarning({ expiresAt }: { expiresAt: string }) {
  const daysUntilExpiry = Math.floor(
    (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiry <= 0) {
    return <Alert type="error">This report has expired</Alert>;
  }

  if (daysUntilExpiry <= 7) {
    return (
      <Alert type="warning">
        This report expires in {daysUntilExpiry} days
      </Alert>
    );
  }

  return null;
}
```

---

## Testing Checklist

### Backend Integration
- [ ] Test generating report with 1 session
- [ ] Test generating report with multiple sessions
- [ ] Test generating report with custom title
- [ ] Test generating report without title (uses default)
- [ ] Test viewing shared report by token
- [ ] Test viewing expired/invalid token (should 404)
- [ ] Test report generation without auth (should 401)
- [ ] Test sharing endpoint without auth (should work - public)

### Frontend Implementation
- [ ] "Generate Report" button disabled when no sessions selected
- [ ] Loading state shown during report generation
- [ ] Success message with shareable URL
- [ ] Copy to clipboard works
- [ ] Open report in new tab works
- [ ] Public share page loads without authentication
- [ ] HTML report displays correctly
- [ ] Expired reports show appropriate error message
- [ ] Invalid tokens show "not found" error

---

## Example User Flows

### Flow 1: Generate & Share
1. User selects 3 sessions from Reports page
2. Clicks "Generate Shareable Report"
3. Modal opens with title input (optional)
4. Clicks "Generate"
5. Loading spinner shows (1-3 seconds)
6. Success! Shows share URL and copy button
7. User copies URL and shares via Slack/email

### Flow 2: View Shared Report
1. Recipient clicks shared URL: `https://only-works.com/r/abc123...`
2. Public page loads (no login required)
3. Page fetches report metadata from backend
4. Page downloads HTML from Supabase Storage
5. Beautiful HTML report renders in iframe
6. View count increments in database

---

## Database Schema (for reference)

### `reports` table
```sql
id (uuid)                  - Report ID
user_id (uuid)             - Owner user ID
title (text)               - Report title
summary (text)             - Executive summary
goal_alignment (text)      - Goal alignment section
blockers (text)            - Blockers section
recognition (text)         - Recognition section
automation_opportunities   - Automation section
communication_quality      - Communication section
next_steps (text)          - Next steps section
ai_usage_efficiency (text) - AI usage section
productivity_score (float) - Score (nullable)
focus_score (float)        - Score (nullable)
session_duration_minutes   - Total duration
screenshot_count (int)     - Total screenshots
session_count (int)        - Number of sessions
start_date (timestamp)     - Earliest session
end_date (timestamp)       - Latest session
created_at (timestamp)     - Creation time
metadata (jsonb)           - Additional data
```

### `shared_reports` table
```sql
id (uuid)              - Shared report ID
user_id (uuid)         - Owner user ID
token (text)           - Share token (unique)
storage_path (text)    - Path to HTML.gz file
title (text)           - Report title
recipient_email (text) - Recipient email (nullable)
recipient_name (text)  - Recipient name (nullable)
created_at (timestamp) - Creation time
expires_at (timestamp) - Expiry time (30 days default)
is_revoked (boolean)   - Revocation flag
view_count (int)       - Number of views
last_viewed_at (timestamp) - Last view time
metadata (jsonb)       - Additional data
```

---

## Support & Troubleshooting

### Common Issues

**Issue:** "Report not found or has expired"
- Solution: Check if share token is correct and report hasn't expired

**Issue:** HTML report not displaying
- Solution: Ensure CORS allows Supabase Storage URLs
- Solution: Check browser console for errors

**Issue:** Report generation takes too long
- Solution: Normal for large sessions (can take 30-60 seconds)
- Solution: Show loading state and don't timeout requests

**Issue:** Authentication error when viewing shared report
- Solution: Ensure frontend routes `/r/:token` to public page (no auth check)

---

## Questions?

Contact backend team or check:
- API logs in Render dashboard
- Supabase logs for storage issues
- Database tables for data verification
