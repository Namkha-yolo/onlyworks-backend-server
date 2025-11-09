// Load environment variables
require('dotenv').config();

// Use simple app for now to avoid database dependencies
const app = require('./src/app-simple');

const PORT = process.env.PORT || 8080;

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 OnlyWorks Backend Server running on port ${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 API Base URL: http://localhost:${PORT}/api`);
  console.log(`🕐 Started at: ${new Date().toISOString()}`);
});

module.exports = app;