#!/usr/bin/env node

const http = require('http');
const { spawn } = require('child_process');

/**
 * Simple test for basic endpoints first
 */
async function basicTest() {
  console.log('🧪 Testing Basic API...');
  
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
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  try {
    // Test only working endpoints
    console.log('Testing /api/health...');
    const healthResponse = await makeRequest('/api/health');
    console.log('✅ Health:', healthResponse.status);
    
    console.log('Testing /api/feed (basic)...');
    const basicFeedResponse = await makeRequest('/api/feed');
    console.log('✅ Basic Feed:', basicFeedResponse.status);
    
    console.log('Testing /api/search?q=test...');
    const searchResponse = await makeRequest('/api/search?q=test');
    console.log('✅ Search:', searchResponse.status);
    
    console.log('Testing /api/trending...');
    const trendingResponse = await makeRequest('/api/trending');
    console.log('✅ Trending:', trendingResponse.status);
    
    console.log('🎉 Basic API tests completed successfully!');
    
  } catch (error) {
    console.error('❌ Basic API test failed:', error.message);
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
      timeout: 3000
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({ 
          status: res.statusCode, 
          data: data.length > 500 ? data.substring(0, 500) + '...' : data
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

basicTest();