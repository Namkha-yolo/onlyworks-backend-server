const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// CORS configuration - allow Electron app and development
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like from Electron)
    if (!origin) return callback(null, true);

    const allowedOrigins = [
      'https://onlyworks.dev',
      'https://app.onlyworks.dev',
      'https://onlyworks-api.onrender.com',
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    ];

    // Allow all origins in development
    if (process.env.NODE_ENV !== 'production' || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    service: 'onlyworks-backend'
  });
});

// Simple auth middleware for testing
const simpleAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'UNAUTHORIZED',
        message: 'Missing or invalid authorization header',
        timestamp: new Date().toISOString()
      }
    });
  }

  // Extract token and decode user info
  const token = authHeader.replace('Bearer ', '');

  try {
    // Decode JWT token properly
    const base64Payload = token.split('.')[1];
    const decodedPayload = JSON.parse(Buffer.from(base64Payload, 'base64').toString());

    console.log('🔍 Decoded JWT payload:', decodedPayload);

    // Extract user info from JWT
    const userId = decodedPayload.userId;
    const userEmail = decodedPayload.email || 'user@onlyworks.com';
    const userName = decodedPayload.name || 'OnlyWorks User';

    if (!userId) {
      throw new Error('No userId found in JWT token');
    }

    // Now look up user in database using auth_user_id (not id)
    const userQuery = await db.query('SELECT * FROM users WHERE auth_user_id = $1', [userId]);

    if (userQuery.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'USER_NOT_FOUND',
          message: 'User not found in database',
          details: { operation: 'find_user_by_id', userId: userId },
          timestamp: new Date().toISOString()
        }
      });
    }

    req.user = {
      id: userQuery.rows[0].id,        // Use the users table primary key
      auth_user_id: userId,            // The auth.users.id from JWT
      email: userEmail,
      name: userName,
      dbUser: userQuery.rows[0]        // Full user record from database
    };
  } catch (error) {
    console.error('❌ JWT decoding error:', error);
    return res.status(401).json({
      success: false,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Failed to decode JWT token',
        details: { operation: 'jwt_decode' },
        timestamp: new Date().toISOString()
      }
    });
  }

  next();
};

// User endpoints
app.get('/api/users/profile', simpleAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: new Date().toISOString()
    }
  });
});

app.put('/api/users/profile', simpleAuth, (req, res) => {
  const profileData = req.body;

  res.json({
    success: true,
    data: {
      id: req.user.id,
      ...profileData,
      updated_at: new Date().toISOString()
    },
    message: 'Profile updated successfully'
  });
});

// Session endpoints
app.get('/api/sessions', simpleAuth, (req, res) => {
  const userId = req.user?.id || 'test-user';
  const { limit = 20, status } = req.query;

  const allSessions = [
    ...Array.from(activeSessions.values()),
    ...Array.from(completedSessions.values())
  ].filter(session => session.user_id === userId);

  // Filter by status if provided
  const filteredSessions = status
    ? allSessions.filter(session => session.status === status)
    : allSessions;

  // Sort by start time (most recent first)
  const sortedSessions = filteredSessions
    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())
    .slice(0, parseInt(limit));

  res.json({
    success: true,
    data: {
      sessions: sortedSessions,
      total: filteredSessions.length,
      active_count: allSessions.filter(s => s.status === 'active').length,
      completed_count: allSessions.filter(s => s.status === 'completed').length
    },
    message: 'Sessions retrieved successfully'
  });
});

// In-memory storage for sessions (replace with database in production)
const activeSessions = new Map();
const completedSessions = new Map();

// Don't add any mock sessions - let users create their own real sessions
const sessionScreenshots = new Map(); // sessionId -> array of screenshots
const sessionAnalyses = new Map(); // sessionId -> array of AI analyses

app.post('/api/sessions/start', simpleAuth, (req, res) => {
  const { session_name, goal_description } = req.body;
  const userId = req.user?.id || 'test-user';

  // End any existing active session for this user
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.user_id === userId && session.status === 'active') {
      session.status = 'completed';
      session.end_time = new Date().toISOString();
      session.duration_minutes = Math.round((Date.now() - new Date(session.start_time).getTime()) / 60000);
      completedSessions.set(sessionId, session);
      activeSessions.delete(sessionId);
    }
  }

  const newSession = {
    id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    user_id: userId,
    session_name: session_name || `Work Session ${new Date().toLocaleString()}`,
    goal_description: goal_description || '',
    status: 'active',
    start_time: new Date().toISOString(),
    started_at: new Date().toISOString(), // For frontend compatibility
    end_time: null,
    duration_minutes: 0,
    productivity_score: null,
    focus_score: null,
    screenshot_count: 0,
    ai_analysis_count: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  // Initialize storage for this session
  activeSessions.set(newSession.id, newSession);
  sessionScreenshots.set(newSession.id, []);
  sessionAnalyses.set(newSession.id, []);

  console.log(`[Session] Started new session: ${newSession.id} for user: ${userId}`);

  res.status(201).json({
    success: true,
    data: newSession,
    message: 'Session started successfully'
  });
});

app.get('/api/sessions/active', simpleAuth, (req, res) => {
  const userId = req.user?.id || 'test-user';

  // Find active session for this user
  let activeSession = null;
  for (const session of activeSessions.values()) {
    if (session.user_id === userId && session.status === 'active') {
      activeSession = session;
      break;
    }
  }

  res.json({
    success: true,
    data: activeSession,
    message: activeSession ? 'Active session found' : 'No active session found'
  });
});

app.put('/api/sessions/:sessionId/end', simpleAuth, (req, res) => {
  const { sessionId } = req.params;
  const session = activeSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: { message: 'Session not found' }
    });
  }

  // Calculate final metrics
  session.status = 'completed';
  session.end_time = new Date().toISOString();
  session.duration_minutes = Math.round((Date.now() - new Date(session.start_time).getTime()) / 60000);
  session.updated_at = new Date().toISOString();

  // Generate comprehensive report
  const screenshots = sessionScreenshots.get(sessionId) || [];
  const analyses = sessionAnalyses.get(sessionId) || [];

  // Calculate final metrics from all analyses
  if (analyses.length > 0) {
    const avgProductivity = analyses.reduce((sum, a) => sum + a.insights.productivity_score, 0) / analyses.length;
    const avgFocus = analyses.reduce((sum, a) => sum + a.insights.focus_level, 0) / analyses.length;
    const totalDistractions = analyses.reduce((sum, a) => sum + a.insights.distractions_count, 0);

    session.productivity_score = Math.round(avgProductivity);
    session.focus_score = Math.round(avgFocus);
    session.total_distractions = totalDistractions;
  }

  // Create comprehensive report
  const report = {
    id: `report-${sessionId}`,
    session_id: sessionId,
    generated_at: new Date().toISOString(),
    summary: {
      duration_minutes: session.duration_minutes,
      screenshot_count: screenshots.length,
      ai_analysis_count: analyses.length,
      productivity_score: session.productivity_score,
      focus_score: session.focus_score,
      total_distractions: session.total_distractions || 0
    },
    insights: {
      most_productive_period: 'Not available',
      focus_trends: analyses.map(a => ({
        period: a.screenshot_range,
        focus_level: a.insights.focus_level,
        productivity: a.insights.productivity_score
      })),
      recommendations: analyses.length > 0
        ? [...new Set(analyses.flatMap(a => a.insights.recommendations))]
        : [],
      activity_breakdown: analyses.length > 0
        ? analyses.reduce((acc, a) => {
            a.insights.top_activities.forEach(activity => {
              acc[activity] = (acc[activity] || 0) + 1;
            });
            return acc;
          }, {})
        : {}
    },
    ai_analyses: analyses,
    created_at: new Date().toISOString()
  };

  // Store session with report
  session.report = report;

  // Move to completed sessions
  completedSessions.set(sessionId, session);
  activeSessions.delete(sessionId);

  console.log(`[Session] Ended session: ${sessionId}, Duration: ${session.duration_minutes}min, Analyses: ${analyses.length}`);

  res.json({
    success: true,
    data: {
      session: session,
      report: report
    },
    message: 'Session ended successfully with comprehensive report generated'
  });
});

app.put('/api/sessions/:sessionId/pause', simpleAuth, (req, res) => {
  const { sessionId } = req.params;

  res.json({
    success: true,
    data: {
      id: sessionId,
      status: 'paused',
      updated_at: new Date().toISOString()
    },
    message: 'Session paused successfully'
  });
});

app.put('/api/sessions/:sessionId/resume', simpleAuth, (req, res) => {
  const { sessionId } = req.params;

  res.json({
    success: true,
    data: {
      id: sessionId,
      status: 'active',
      updated_at: new Date().toISOString()
    },
    message: 'Session resumed successfully'
  });
});

app.get('/api/sessions/:sessionId', simpleAuth, (req, res) => {
  const { sessionId } = req.params;

  // Check active sessions first
  let session = activeSessions.get(sessionId);

  // If not active, check completed sessions
  if (!session) {
    session = completedSessions.get(sessionId);
  }

  if (!session) {
    return res.status(404).json({
      success: false,
      error: { message: 'Session not found' }
    });
  }

  // Get related data
  const screenshots = sessionScreenshots.get(sessionId) || [];
  const analyses = sessionAnalyses.get(sessionId) || [];

  res.json({
    success: true,
    data: {
      session: session,
      screenshots: screenshots.map(s => ({
        id: s.id,
        timestamp: s.timestamp,
        analysis: s.analysis
      })), // Don't send actual screenshot data in list
      ai_analyses: analyses,
      stats: {
        total_screenshots: screenshots.length,
        ai_analyses_completed: analyses.length,
        average_productivity: analyses.length > 0
          ? Math.round(analyses.reduce((sum, a) => sum + a.insights.productivity_score, 0) / analyses.length)
          : null,
        average_focus: analyses.length > 0
          ? Math.round(analyses.reduce((sum, a) => sum + a.insights.focus_level, 0) / analyses.length)
          : null
      }
    },
    message: 'Session retrieved successfully'
  });
});

app.put('/api/sessions/:sessionId/scores', simpleAuth, (req, res) => {
  const { sessionId } = req.params;
  const { productivity_score, focus_score } = req.body;

  res.json({
    success: true,
    data: {
      id: sessionId,
      productivity_score,
      focus_score,
      updated_at: new Date().toISOString()
    },
    message: 'Session scores updated successfully'
  });
});

// Get session report
app.get('/api/sessions/:sessionId/report', simpleAuth, (req, res) => {
  const { sessionId } = req.params;
  const session = completedSessions.get(sessionId) || activeSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({
      success: false,
      error: { message: 'Session not found' }
    });
  }

  if (!session.report && session.status === 'active') {
    return res.status(400).json({
      success: false,
      error: { message: 'Report not available for active session' }
    });
  }

  res.json({
    success: true,
    data: session.report || null,
    message: 'Session report retrieved successfully'
  });
});

app.post('/api/sessions/:sessionId/screenshots', simpleAuth, (req, res) => {
  const { sessionId } = req.params;
  const { screenshot_data, timestamp, analysis } = req.body;

  const session = activeSessions.get(sessionId);
  if (!session) {
    return res.status(404).json({
      success: false,
      error: { message: 'Session not found' }
    });
  }

  const screenshot = {
    id: `screenshot-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    session_id: sessionId,
    screenshot_data: screenshot_data || null,
    timestamp: timestamp || new Date().toISOString(),
    analysis: analysis || null,
    created_at: new Date().toISOString()
  };

  // Store screenshot
  const screenshots = sessionScreenshots.get(sessionId) || [];
  screenshots.push(screenshot);
  sessionScreenshots.set(sessionId, screenshots);

  // Update session screenshot count
  session.screenshot_count = screenshots.length;
  session.updated_at = new Date().toISOString();

  console.log(`[Session] Screenshot ${screenshots.length} uploaded for session: ${sessionId}`);

  // Trigger AI analysis every 15 screenshots
  if (screenshots.length % 15 === 0) {
    console.log(`[Session] Triggering AI analysis for session: ${sessionId} (${screenshots.length} screenshots)`);

    // Simulate AI analysis (replace with actual AI service call)
    setTimeout(() => {
      const analysisData = {
        id: `analysis-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        session_id: sessionId,
        screenshot_range: [screenshots.length - 14, screenshots.length],
        timestamp: new Date().toISOString(),
        insights: {
          productivity_score: Math.floor(Math.random() * 40) + 60, // 60-100
          focus_level: Math.floor(Math.random() * 30) + 70, // 70-100
          activity_summary: `Analysis of screenshots ${screenshots.length - 14}-${screenshots.length}`,
          top_activities: ['Coding', 'Research', 'Communication'],
          distractions_count: Math.floor(Math.random() * 5),
          recommendations: [
            'Consider taking a break to maintain focus',
            'Good productivity patterns observed',
            'Minimize social media during work hours'
          ]
        },
        created_at: new Date().toISOString()
      };

      // Store analysis
      const analyses = sessionAnalyses.get(sessionId) || [];
      analyses.push(analysisData);
      sessionAnalyses.set(sessionId, analyses);

      session.ai_analysis_count = analyses.length;

      console.log(`[Session] AI analysis ${analyses.length} completed for session: ${sessionId}`);
    }, 1000); // Simulate processing delay
  }

  res.json({
    success: true,
    data: screenshot,
    message: 'Screenshot uploaded successfully',
    session_stats: {
      total_screenshots: screenshots.length,
      ai_analyses_completed: session.ai_analysis_count,
      next_analysis_at: screenshots.length % 15 === 0 ? screenshots.length : Math.ceil(screenshots.length / 15) * 15
    }
  });
});

app.get('/api/sessions/stats/summary', simpleAuth, (req, res) => {
  const userId = req.user?.id;

  // Get all user sessions from both active and completed
  const allSessions = [
    ...Array.from(activeSessions.values()),
    ...Array.from(completedSessions.values())
  ].filter(session => session.user_id === userId);

  // Calculate real stats from actual sessions
  const totalSessions = allSessions.length;
  const totalMinutes = allSessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
  const avgProductivity = totalSessions > 0
    ? allSessions.reduce((sum, s) => sum + (s.productivity_score || 0), 0) / totalSessions
    : 0;
  const avgFocus = totalSessions > 0
    ? allSessions.reduce((sum, s) => sum + (s.focus_score || 0), 0) / totalSessions
    : 0;

  // Count sessions from this week
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const sessionsThisWeek = allSessions.filter(s =>
    new Date(s.start_time) > oneWeekAgo
  ).length;

  res.json({
    success: true,
    data: {
      total_sessions: totalSessions,
      total_time_minutes: totalMinutes,
      average_productivity: Math.round(avgProductivity * 10) / 10,
      average_focus: Math.round(avgFocus * 10) / 10,
      sessions_this_week: sessionsThisWeek
    }
  });
});

// OAuth endpoints with real Google credentials
app.get('/api/auth/oauth/google/init', (req, res) => {
  const clientId = process.env.GOOGLE_CLIENT_ID || 'your-client-id-here';
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://onlyworks-backend-server.onrender.com/api/auth/oauth/google/callback';
  const scope = 'openid email profile';
  const state = 'onlyworks-' + Date.now();

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
    `client_id=${encodeURIComponent(clientId)}&` +
    `redirect_uri=${encodeURIComponent(redirectUri)}&` +
    `scope=${encodeURIComponent(scope)}&` +
    `response_type=code&` +
    `state=${encodeURIComponent(state)}&` +
    `access_type=offline&` +
    `prompt=consent`;

  res.json({
    success: true,
    data: {
      auth_url: authUrl,
      state: state
    },
    message: 'OAuth init successful'
  });
});

// Legacy endpoint redirect for backward compatibility
app.post('/api/auth/callback', async (req, res) => {
  console.log('[Legacy Redirect] Received request at /api/auth/callback, redirecting to OAuth endpoint...');
  // Forward to the correct OAuth endpoint
  req.url = '/api/auth/oauth/google/callback';
  return app.handle(req, res);
});

app.post('/api/auth/oauth/google/callback', async (req, res) => {
  try {
    const { code, state } = req.body;
    console.log('[OAuth Callback] Received request:', { code: code ? code.substring(0, 20) + '...' : null, state });

    if (!code) {
      console.log('[OAuth Callback] Missing code in request body');
      return res.status(400).json({
        success: false,
        error: { message: 'Authorization code is required' }
      });
    }

    // Exchange code for access token
    const clientId = process.env.GOOGLE_CLIENT_ID || 'your-client-id-here';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || 'your-client-secret-here';
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://onlyworks-backend-server.onrender.com/api/auth/oauth/google/callback';

    console.log('[OAuth Callback] Exchanging code for token with Google API...');
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();
    console.log('[OAuth Callback] Google token response status:', tokenResponse.status);
    console.log('[OAuth Callback] Google token response data:', tokenData);

    if (!tokenResponse.ok) {
      console.log('[OAuth Callback] Google token exchange failed:', tokenData);
      throw new Error(tokenData.error_description || 'Failed to exchange code for token');
    }

    // Get user info
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json();

    if (!userResponse.ok) {
      throw new Error('Failed to fetch user information');
    }

    // Generate JWT token for your app (you'd implement proper JWT here)
    const appToken = 'jwt-' + userData.id + '-' + Date.now();

    console.log('[OAuth Callback] Sending successful response to client...');
    res.json({
      success: true,
      data: {
        user: {
          id: userData.id,
          email: userData.email,
          name: userData.name,
          avatar_url: userData.picture
        },
        access_token: appToken,
        refresh_token: 'refresh-' + userData.id + '-' + Date.now(),
        expires_in: 3600
      },
      message: 'OAuth callback successful'
    });

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).json({
      success: false,
      error: { message: error.message || 'OAuth callback failed' }
    });
  }
});

// Handle GET callback from Google OAuth redirect
app.get('/api/auth/oauth/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;

    if (error) {
      return res.redirect(`onlyworks://auth/callback?error=${encodeURIComponent(error)}`);
    }

    if (!code) {
      return res.redirect('onlyworks://auth/callback?error=missing_code');
    }

    // Exchange code for access token (same logic as POST)
    const clientId = process.env.GOOGLE_CLIENT_ID || 'your-client-id-here';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || 'your-client-secret-here';
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'https://onlyworks-backend-server.onrender.com/api/auth/oauth/google/callback';

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(tokenData.error_description || 'Failed to exchange code for token');
    }

    // Get user info
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json();

    if (!userResponse.ok) {
      throw new Error('Failed to fetch user information');
    }

    // Generate JWT token for your app
    const appToken = 'jwt-' + userData.id + '-' + Date.now();

    // Redirect back to Electron app with user data
    const userDataEncoded = encodeURIComponent(JSON.stringify({
      user: {
        id: userData.id,
        email: userData.email,
        name: userData.name,
        avatar: userData.picture
      },
      token: appToken,
      expiresIn: 3600
    }));

    res.redirect(`onlyworks://auth/callback?data=${userDataEncoded}`);

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.redirect(`onlyworks://auth/callback?error=${encodeURIComponent(error.message)}`);
  }
});

app.post('/api/auth/token/refresh', (req, res) => {
  res.json({
    success: true,
    data: {
      token: 'mock-refreshed-token-' + Date.now(),
      expiresIn: 3600
    },
    message: 'Token refreshed successfully (mock)'
  });
});

// Alias for frontend compatibility
app.post('/api/auth/refresh', (req, res) => {
  res.json({
    success: true,
    data: {
      token: 'mock-refreshed-token-' + Date.now(),
      expiresIn: 3600
    },
    message: 'Token refreshed successfully (mock)'
  });
});

app.get('/api/auth/validate', simpleAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      user: req.user,
      valid: true
    },
    message: 'Session is valid'
  });
});

app.post('/api/auth/validate', simpleAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      user: req.user,
      valid: true
    },
    message: 'Session is valid'
  });
});

app.post('/api/auth/logout', simpleAuth, (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful (mock)'
  });
});

// User settings endpoint (alias for profile)
app.get('/users/settings', simpleAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      id: req.user?.id || 'test-user',
      theme: 'system',
      notifications: true,
      language: 'en',
      timezone: 'auto'
    }
  });
});

// Goals endpoint
app.get('/goals', simpleAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      personalGoals: {
        micro: [],
        macro: []
      },
      teamGoals: {
        micro: [],
        macro: []
      },
      allGoals: []
    }
  });
});

app.post('/goals', simpleAuth, (req, res) => {
  res.json({
    success: true,
    message: 'Goals saved successfully'
  });
});


// Analysis routes
const analysisRoutes = require('./routes/analysisRoutes');
app.use('/api/analysis', analysisRoutes);

// Catch 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint ${req.method} ${req.path} not found`,
      timestamp: new Date().toISOString()
    }
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Error:', error);
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
      timestamp: new Date().toISOString()
    }
  });
});

module.exports = app;