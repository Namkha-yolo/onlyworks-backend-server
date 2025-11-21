// Test script to verify settings integration works
// Run this with: node test_settings_integration.js

const UserService = require('./src/services/UserService');

async function testSettingsIntegration() {
  console.log('🧪 Testing Settings Integration...\n');

  const userService = new UserService();
  const testUserId = '00000000-0000-0000-0000-000000000001'; // Replace with actual user ID

  try {
    console.log('1. Testing getSettings with no existing settings...');
    let settings = await userService.getSettings(testUserId);
    console.log('✅ Default settings returned:', settings);
    console.log('');

    console.log('2. Testing updateSettings...');
    const newSettings = {
      username: 'testuser',
      email: 'test@example.com',
      phone: '+1234567890',
      avatar: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      theme: 'dark',
      language: 'en',
      email_notifications: true,
      push_notifications: false,
      marketing_emails: true
    };

    const updatedSettings = await userService.updateSettings(testUserId, newSettings);
    console.log('✅ Settings updated:', updatedSettings);
    console.log('');

    console.log('3. Testing getSettings after update...');
    const retrievedSettings = await userService.getSettings(testUserId);
    console.log('✅ Retrieved settings:', retrievedSettings);
    console.log('');

    // Verify the data matches
    const matches = {
      username: retrievedSettings.username === newSettings.username,
      email: retrievedSettings.email === newSettings.email,
      phone: retrievedSettings.phone === newSettings.phone,
      theme: retrievedSettings.theme === newSettings.theme,
      language: retrievedSettings.language === newSettings.language,
      email_notifications: retrievedSettings.email_notifications === newSettings.email_notifications,
      push_notifications: retrievedSettings.push_notifications === newSettings.push_notifications,
      marketing_emails: retrievedSettings.marketing_emails === newSettings.marketing_emails
    };

    console.log('4. Data integrity check:');
    Object.entries(matches).forEach(([key, match]) => {
      console.log(`   ${match ? '✅' : '❌'} ${key}: ${match ? 'PASS' : 'FAIL'}`);
    });

    const allMatch = Object.values(matches).every(match => match);
    console.log(`\n🎉 Integration test ${allMatch ? 'PASSED' : 'FAILED'}!`);

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  testSettingsIntegration();
}

module.exports = { testSettingsIntegration };