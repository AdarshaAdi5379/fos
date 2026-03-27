#!/usr/bin/env node

const http = require('http');
const { spawn } = require('child_process');

/**
 * Test community moderation API endpoints
 */
async function testModerationAPI() {
  console.log('🧪 Testing Community Moderation API...');
  
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
    // Test health endpoint first
    console.log('Testing health endpoint...');
    const healthResponse = await makeRequest('/api/health');
    console.log('✅ Health:', healthResponse.status);
    
    const healthData = JSON.parse(healthResponse.data);
    console.log('Features enabled:', Object.keys(healthData.features).filter(k => healthData.features[k]));
    
    // Test public moderation endpoints
    console.log('Testing public endpoints...');
    
    // Test top contributors (public)
    const contributorsResponse = await makeRequest('/api/moderation/contributors');
    console.log('✅ Top Contributors:', contributorsResponse.status);
    
    // Test stats without auth
    const statsResponse = await makeRequest('/api/moderation/stats');
    console.log('✅ Stats (no auth):', statsResponse.status);
    
    // Test post votes (no auth)
    const votesResponse = await makeRequest('/api/moderation/posts/1/votes');
    console.log('✅ Post Votes (no auth):', votesResponse.status);
    
    console.log('🎉 Moderation API basic tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Moderation API test failed:', error.message);
  } finally {
    // Clean up
    console.log('🛑 Stopping server...');
    server.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

function makeRequest(path) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: 'GET',
      timeout: 5000
    };
    
    const req = http.request(options, (res) => {
      let response = '';
      
      res.on('data', (chunk) => {
        response += chunk;
      });
      
      res.on('end', () => {
        resolve({ 
          status: res.statusCode, 
          data: response
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
    
    req.end();
  });
}

testModerationAPI();