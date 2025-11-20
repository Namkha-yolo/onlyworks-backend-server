const express = require('express');
const UserController = require('../controllers/UserController');
const { validateRequired } = require('../middleware/errorHandler');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const userController = new UserController();

// Public routes (no authentication required)
router.get('/check-username', userController.checkUsernameAvailability);

// Apply authentication to all other user routes
router.use(authenticateUser);

// Get current user profile
router.get('/profile', userController.getProfile);

// Update user profile
router.put('/profile', userController.updateProfile);

// Get user settings
router.get('/settings', userController.getSettings);

// Update user settings
router.put('/settings', userController.updateSettings);

// Get user by ID
router.get('/:id', userController.getUserById);

// Deactivate account
router.post('/deactivate', userController.deactivateAccount);

// Reactivate account (admin)
router.post('/:id/reactivate', userController.reactivateAccount);

module.exports = router;