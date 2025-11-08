const crypto = require('crypto');

// Store for code verifiers (in production, use Redis or database)
const codeVerifiers = new Map();

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function storeCodeVerifier(state, verifier) {
  codeVerifiers.set(state, verifier);

  // Clean up after 10 minutes
  setTimeout(() => {
    codeVerifiers.delete(state);
  }, 10 * 60 * 1000);
}

function getCodeVerifier(state) {
  const verifier = codeVerifiers.get(state);
  if (verifier) {
    codeVerifiers.delete(state); // Use once and delete
  }
  return verifier;
}

module.exports = {
  generateCodeVerifier,
  generateCodeChallenge,
  storeCodeVerifier,
  getCodeVerifier
};