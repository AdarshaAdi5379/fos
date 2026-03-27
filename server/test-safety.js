#!/usr/bin/env node

const http = require('http');
const { spawn } = require('child_process');

/**
 * Test user safety API endpoints
 */
async function testSafetyAPI() {
  console.log('🧪 Testing User Safety API...');
  
  // Start server
  console.log('🚀 Starting server...');
  const server = spawn('node', ['index.js'], {
    cwd: __dirname,
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  server.stdout.on('data', (data) => {
    console.log('Server:', data.toString().trim());
  });
  
  server.stderr.on('data', (data) => {
    console.error('Server Error:', data.toString().trim());
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  try {
    // First authenticate to get a token
    console.log('Testing authentication...');
    const authResponse = await makeAuthenticatedRequest('/api/auth/login', {
      publicKey: 'test_public_key_123456789',
      signature: 'test_signature',
      message: 'test_message'
    });
    
    if (authResponse.status !== 200) {
      throw new Error('Authentication failed');
    }
    
    const token = JSON.parse(authResponse.data).accessToken;
    
    // Test safety endpoints
    console.log('Testing safety endpoints...');
    
    // Get safety preferences
    const prefsResponse = await makeAuthenticatedRequest('/api/safety/preferences', {}, token);
    console.log('✅ Safety Preferences:', prefsResponse.status);
    
    // Get safety summary
    const summaryResponse = await makeAuthenticatedRequest('/api/safety/summary', {}, token);
    console.log('✅ Safety Summary:', summaryResponse.status);
    
    // Try to get blocked users
    const blockedResponse = await makeAuthenticatedRequest('/api/safety/blocked', {}, token);
    console.log('✅ Blocked Users:', blockedResponse.status);
    
    // Try to get content filters
    const filtersResponse = await makeAuthenticatedRequest('/api/safety/filters', {}, token);
    console.log('✅ Content Filters:', filtersResponse.status);
    
    console.log('🎉 Safety API tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Safety API test failed:', error.message);
  } finally {
    // Clean up
    console.log('🛑 Stopping server...');
    server.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

function makeAuthenticatedRequest(path, data = {}, token = '') {
  return new Promise((resolve, reject) => {
    const isPost = Object.keys(data).length > 0;
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: isPost ? 'POST' : 'GET',
      timeout: 5000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': token ? `Bearer ${token}` : ''
      }
    };
    
    const req = http.request(options, (res) => {
      let response = '';
      
      res.on('data', (chunk) => {
        response += chunk;
      });
      
      res.on('end', () => {
        resolve({ 
          status: res.statusCode, 
          data: response.length > 500 ? response.substring(0, 500) + '...' : response
        });
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (isPost) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

function makeRequest(path) {
  return makeAuthenticatedRequest(path);
}

testSafetyAPI();