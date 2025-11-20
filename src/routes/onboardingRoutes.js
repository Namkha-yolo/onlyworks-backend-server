const express = require('express');
const OnboardingController = require('../controllers/OnboardingController');
const { authenticateUser } = require('../middleware/auth');

const router = express.Router();
const onboardingController = new OnboardingController();

// All onboarding routes require authentication
router.use(authenticateUser);

// Sync onboarding data from desktop app
router.post('/', onboardingController.syncOnboardingData);

// Get onboarding status and progress
router.get('/status', onboardingController.getStatus);

// Update onboarding steps
router.post('/basic-info', onboardingController.updateBasicInfo);
router.post('/work-info', onboardingController.updateWorkInfo);
router.post('/preferences', onboardingController.updatePreferences);

// Complete or skip onboarding
router.post('/complete', onboardingController.completeOnboarding);
router.post('/skip', onboardingController.skipOnboarding);

module.exports = router;
