const express = require('express');
const AdminController = require('../controllers/AdminController');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const adminController = new AdminController();

// Apply authentication to all admin routes
router.use(authenticateUser);

// Fix auth_user_id for users
router.post('/fix-auth-user-ids', adminController.fixAuthUserIds);

module.exports = router;