const FormData = require('form-data');
const fs = require('fs');
const { default: fetch } = require('node-fetch');

// Create a minimal test PNG file (1x1 pixel transparent PNG)
const testPngBuffer = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
  0x0b, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x62, 0x00, 0x02, 0x00, 0x00,
  0x05, 0x00, 0x01, 0xe2, 0x26, 0x05, 0x9b, 0x00, 0x00, 0x00, 0x00, 0x49,
  0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

async function testScreenshotUploadWithSession() {
  try {
    console.log('Testing screenshot upload with proper work session...');

    // Create development token for demo user
    const demoUserData = {
      userId: '198377c5-158a-4fac-b892-de207a7a519e',
      email: 'kewadallay@gmail.com',
      name: 'Demo User',
      avatar_url: 'https://example.com/avatar.png',
      provider: 'demo'
    };

    const header = Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'HS256' })).toString('base64');
    const payload = Buffer.from(JSON.stringify(demoUserData)).toString('base64');
    const token = `${header}.${payload}.development-signature`;

    console.log('\n1. Creating work session...');
    const sessionResponse = await fetch('http://localhost:8080/api/sessions/start', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: 'Test Work Session',
        description: 'Test session for screenshot upload'
      })
    });

    const sessionResult = await sessionResponse.json();
    console.log('Session creation result:', sessionResult);

    let sessionId;
    if (!sessionResult.success) {
      if (sessionResult.error.code === 'RESOURCE_CONFLICT' && sessionResult.error.details.active_session_id) {
        console.log('Using existing active session:', sessionResult.error.details.active_session_id);
        sessionId = sessionResult.error.details.active_session_id;
      } else {
        console.error('Failed to create work session:', sessionResult);
        return;
      }
    } else {
      sessionId = sessionResult.data.id;
    }
    console.log('Using session with ID:', sessionId);

    // Test metadata-only upload with valid session
    console.log('\n2. Testing metadata-only upload with valid session...');
    const metadataResponse = await fetch('http://localhost:8080/api/screenshots/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: sessionId,
        file_storage_key: 'test/screenshot.png',
        file_size_bytes: 1024,
        window_title: 'Test Window',
        active_app: 'Test App',
        capture_trigger: 'test',
        mouse_x: 100,
        mouse_y: 200,
        screen_width: 1920,
        screen_height: 1080,
        interaction_type: 'click',
        interaction_data: { button: 'left', target: 'button' }
      })
    });

    const metadataResult = await metadataResponse.json();
    console.log('Metadata upload result:', metadataResult);

    // Test file upload with valid session
    console.log('\n3. Testing file upload with valid session...');
    const form = new FormData();
    form.append('sessionId', sessionId);
    form.append('window_title', 'Test File Upload Window');
    form.append('active_app', 'File Upload Test');
    form.append('capture_trigger', 'manual');
    form.append('screenshot', testPngBuffer, {
      filename: 'test-screenshot.png',
      contentType: 'image/png'
    });

    const fileResponse = await fetch('http://localhost:8080/api/screenshots/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        ...form.getHeaders()
      },
      body: form
    });

    const fileResult = await fileResponse.json();
    console.log('File upload result:', fileResult);

    // End the session
    console.log('\n4. Ending work session...');
    const endResponse = await fetch(`http://localhost:8080/api/sessions/${sessionId}/end`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const endResult = await endResponse.json();
    console.log('Session end result:', endResult);

    console.log('\nComplete screenshot upload test completed!');

  } catch (error) {
    console.error('Upload test failed:', error);
  }
}

if (require.main === module) {
  testScreenshotUploadWithSession();
}

module.exports = { testScreenshotUploadWithSession };