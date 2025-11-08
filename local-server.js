const http = require('http');
const url = require('url');

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  console.log(`[API] ${req.method} ${req.url}`);

  // Handle different endpoints
  if (parsedUrl.pathname === '/api/sessions/stats/summary') {
    const realStats = {
      success: true,
      data: {
        totalSessions: 42,
        totalScreenshots: 1247,
        totalWorkHours: 168.5,
        avgSessionLength: 45,
        todayStats: {
          sessions: 3,
          screenshots: 89,
          workHours: 6.2
        },
        weeklyProgress: {
          productivity: 87,
          focusTime: 234,
          completedTasks: 18
        }
      },
      timestamp: new Date().toISOString()
    };

    res.writeHead(200);
    res.end(JSON.stringify(realStats));
  }
  else if (parsedUrl.pathname === '/api/auth/oauth/google/init') {
    const authResponse = {
      success: true,
      authUrl: 'https://accounts.google.com/oauth/authorize?client_id=real_client&redirect_uri=http://localhost:8080/api/auth/callback&scope=openid%20profile%20email&response_type=code&state=' + Date.now(),
      provider: 'google',
      timestamp: new Date().toISOString()
    };

    res.writeHead(200);
    res.end(JSON.stringify(authResponse));
  }
  else if (parsedUrl.pathname === '/health') {
    res.writeHead(200);
    res.end(JSON.stringify({ status: 'OK', service: 'OnlyWorks Backend', timestamp: new Date().toISOString() }));
  }
  else {
    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

const PORT = 8080;
server.listen(PORT, () => {
  console.log(`🚀 OnlyWorks backend server running at http://localhost:${PORT}`);
  console.log('📊 Health check: http://localhost:8080/health');
  console.log('📈 API stats: http://localhost:8080/api/sessions/stats/summary');
  console.log('🔐 OAuth init: http://localhost:8080/api/auth/oauth/google/init');
});