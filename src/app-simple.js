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

  // Mock user
  req.user = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User'
  };

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
  const { page = 1, limit = 20, status, date_from, date_to } = req.query;

  const sessions = [
    {
      id: 'session-1',
      session_name: 'Morning Work Session',
      goal_description: 'Complete project documentation',
      status: 'completed',
      start_time: '2024-01-01T09:00:00Z',
      end_time: '2024-01-01T11:00:00Z',
      duration_minutes: 120,
      productivity_score: 8.5,
      focus_score: 9.0,
      created_at: '2024-01-01T09:00:00Z'
    },
    {
      id: 'session-2',
      session_name: 'Afternoon Coding',
      goal_description: 'Implement new features',
      status: 'completed',
      start_time: '2024-01-01T13:00:00Z',
      end_time: '2024-01-01T15:30:00Z',
      duration_minutes: 150,
      productivity_score: 7.8,
      focus_score: 8.2,
      created_at: '2024-01-01T13:00:00Z'
    }
  ];

  res.json({
    success: true,
    data: {
      sessions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: sessions.length,
        pages: Math.ceil(sessions.length / parseInt(limit))
      }
    }
  });
});

app.post('/api/sessions/start', simpleAuth, (req, res) => {
  const { session_name, goal_description } = req.body;

  const newSession = {
    id: `session-${Date.now()}`,
    session_name: session_name || `Session ${new Date().toLocaleString()}`,
    goal_description: goal_description || '',
    status: 'active',
    start_time: new Date().toISOString(),
    end_time: null,
    duration_minutes: 0,
    productivity_score: null,
    focus_score: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  res.status(201).json({
    success: true,
    data: newSession,
    message: 'Session started successfully'
  });
});

app.get('/api/sessions/active', simpleAuth, (req, res) => {
  res.json({
    success: true,
    data: null, // No active session
    message: 'No active session found'
  });
});

app.put('/api/sessions/:sessionId/end', simpleAuth, (req, res) => {
  const { sessionId } = req.params;

  res.json({
    success: true,
    data: {
      id: sessionId,
      status: 'completed',
      end_time: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    message: 'Session ended successfully'
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

app.get('/api/sessions/stats/summary', simpleAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      total_sessions: 10,
      total_time_minutes: 1200,
      average_productivity: 8.5,
      average_focus: 8.2,
      sessions_this_week: 5
    }
  });
});

// OAuth endpoints for mock authentication
app.get('/api/auth/oauth/google/init', (req, res) => {
  res.json({
    success: true,
    data: {
      authUrl: 'https://accounts.google.com/oauth/authorize?client_id=mock&redirect_uri=mock&scope=email%20profile',
      state: 'mock-state-' + Date.now()
    },
    message: 'OAuth init successful (mock)'
  });
});

app.post('/api/auth/oauth/google/callback', (req, res) => {
  const { code, state } = req.body;

  res.json({
    success: true,
    data: {
      user: {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatar: 'https://via.placeholder.com/64'
      },
      token: 'mock-jwt-token-' + Date.now(),
      expiresIn: 3600
    },
    message: 'OAuth callback successful (mock)'
  });
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

app.post('/api/auth/logout', simpleAuth, (req, res) => {
  res.json({
    success: true,
    message: 'Logout successful (mock)'
  });
});

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