#!/usr/bin/env node

const http = require('http');
const { spawn } = require('child_process');

/**
 * Test script for advanced feed API
 */
async function testAPI() {
  console.log('🧪 Testing Advanced Feed API...');
  
  // Start server
  console.log('🚀 Starting server...');
  const server = spawn('node', ['index.js'], {
    cwd: __dirname,
    stdio: 'pipe'
  });
  
  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  try {
    // Test health endpoint
    console.log('Testing /api/health...');
    const healthResponse = await makeRequest('/api/health');
    console.log('✅ Health:', healthResponse);
    
    // Test advanced feed endpoint
    console.log('Testing /api/feed/advanced...');
    const advancedFeedResponse = await makeRequest('/api/feed/advanced');
    console.log('✅ Advanced Feed:', advancedFeedResponse);
    
    // Test search endpoint
    console.log('Testing /api/search?q=test...');
    const searchResponse = await makeRequest('/api/search?q=test');
    console.log('✅ Search:', searchResponse);
    
    // Test trending endpoint
    console.log('Testing /api/trending...');
    const trendingResponse = await makeRequest('/api/trending');
    console.log('✅ Trending:', trendingResponse);
    
    // Test analytics endpoint
    console.log('Testing /api/analytics...');
    const analyticsResponse = await makeRequest('/api/analytics');
    console.log('✅ Analytics:', analyticsResponse);
    
    console.log('🎉 All API tests completed successfully!');
    
  } catch (error) {
    console.error('❌ API test failed:', error.message);
    process.exit(1);
  } finally {
    // Clean up
    server.kill('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 1000));
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
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
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

testAPI();