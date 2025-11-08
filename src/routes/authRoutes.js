const express = require('express');
const AuthController = require('../controllers/AuthController');
const { optionalAuth } = require('../middleware/auth');

const router = express.Router();
const authController = new AuthController();

// OAuth initiation endpoints
router.get('/oauth/:provider/init', authController.initOAuth);

// OAuth callback endpoints
router.get('/oauth/:provider/callback', authController.handleOAuthCallback);

// Token refresh endpoint
router.post('/refresh', authController.refreshToken);

// Logout endpoint
router.post('/logout', optionalAuth, authController.logout);

// Check auth status
router.get('/status', optionalAuth, authController.getAuthStatus);

module.exports = router;