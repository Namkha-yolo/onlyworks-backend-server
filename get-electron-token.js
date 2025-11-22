// Paste this in the Console tab of DevTools and press Enter
// This will try to find the auth token in the Electron app

console.log('🔍 Searching for auth token...\n');

const locations = [
  { name: 'localStorage.authToken', value: localStorage.getItem('authToken') },
  { name: 'localStorage.token', value: localStorage.getItem('token') },
  { name: 'localStorage.jwt', value: localStorage.getItem('jwt') },
  { name: 'localStorage.access_token', value: localStorage.getItem('access_token') },
  { name: 'sessionStorage.authToken', value: sessionStorage.getItem('authToken') },
  { name: 'sessionStorage.token', value: sessionStorage.getItem('token') },
];

console.log('Checking storage locations:');
locations.forEach(loc => {
  if (loc.value) {
    console.log(`✅ FOUND: ${loc.name}`);
    console.log(`   Value: ${loc.value.substring(0, 50)}...`);
    console.log(`   Full token: ${loc.value}\n`);
  } else {
    console.log(`❌ Not found: ${loc.name}`);
  }
});

// Also check if window has any auth-related properties
console.log('\nChecking window object:');
const windowKeys = Object.keys(window).filter(key =>
  key.toLowerCase().includes('auth') ||
  key.toLowerCase().includes('token') ||
  key.toLowerCase().includes('jwt')
);
if (windowKeys.length > 0) {
  console.log('Found auth-related properties:', windowKeys);
} else {
  console.log('No auth-related properties found in window object');
}
