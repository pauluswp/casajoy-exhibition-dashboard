// MOCK AUTHENTICATION FOR LOCAL TESTING
// Override the API to return test user data instead of real authentication

// Simulate /api/auth/me endpoint response
const mockAuthResponse = {
  user: {
    username: 'test',
    display_name: 'Test Administrator',
    role: 'admin',
    email: 'test@localhost.local'
  },
  admin_email: 'test@localhost.local'
};

// Store original fetch
const originalFetch = window.fetch;

// Mock fetch function
window.fetch = async function(url, options = {}) {
  const urlStr = url.toString();
  
  // Intercept auth requests
  if (urlStr.includes('/api/auth/me')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockAuthResponse)
    });
  }
  
  // Intercept login requests  
  if (urlStr.includes('/api/auth/login') && options.method === 'POST') {
    // Accept any credentials - allow test/testestestes
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(mockAuthResponse)
    });
  }
  
  // Return other requests to actual server (which will fail gracefully)
  return originalFetch.call(this, url, options);
};

// Auto-set logged-in state for local development
document.addEventListener('DOMContentLoaded', () => {
  console.log('🔑 Local Mock Auth Active');
  console.log('Logged in as:', mockAuthResponse.user.display_name);
  console.log('Username:', mockAuthResponse.user.username);
  
  // Set global state directly (works around app.js needing real auth)
  window.mockLoggedInUser = mockAuthResponse.user;
});
