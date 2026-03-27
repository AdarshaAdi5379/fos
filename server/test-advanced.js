#!/usr/bin/env node

const http = require('http');
const { spawn } = require('child_process');

/**
 * Test advanced feed endpoint
 */
async function testAdvancedFeed() {
  console.log('🧪 Testing Advanced Feed Endpoint...');
  
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
    // Test advanced feed with minimal parameters
    console.log('Testing /api/feed/advanced...');
    const advancedResponse = await makeRequest('/api/feed/advanced');
    console.log('✅ Advanced Feed Status:', advancedResponse.status);
    console.log('Response preview:', advancedResponse.data);
    
    console.log('🎉 Advanced feed test completed!');
    
  } catch (error) {
    console.error('❌ Advanced feed test failed:', error.message);
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
      timeout: 10000 // Increased timeout for advanced feed
    };
    
    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          resolve({ 
            status: res.statusCode, 
            data: jsonData
          });
        } catch (e) {
          resolve({ 
            status: res.statusCode, 
            data: data.length > 1000 ? data.substring(0, 1000) + '...' : data
          });
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

testAdvancedFeed();