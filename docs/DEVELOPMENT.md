# 📖 Development Guide

## Overview
This guide provides comprehensive instructions for setting up and contributing to the Unbound platform development.

## 🛠️ Prerequisites

### System Requirements
- **Node.js**: 18.x or later
- **npm**: 9.x or later
- **Git**: Latest version
- **SQLite**: 3.x (development)
- **PostgreSQL**: 13+ (production, optional)

### Development Tools
- **IDE**: VS Code recommended
- **Browser**: Chrome/Firefox with developer tools
- **API Testing**: Postman or similar
- **Database Tools**: SQLite Browser, pgAdmin

## 🚀 Quick Start

### 1. Clone Repository
```bash
git clone https://github.com/your-org/unbound.git
cd unbound
```

### 2. Install Dependencies
```bash
# Install root dependencies
npm install

# Install server dependencies
cd server && npm install && cd ..

# Install client dependencies
cd client && npm install && cd ..

# Install config dependencies
cd config && npm install && cd ..
```

### 3. Environment Setup
```bash
# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

### 4. Generate Security Secrets
```bash
# Generate JWT secrets
openssl rand -base64 64 > jwt-access-secret.txt
openssl rand -base64 64 > jwt-refresh-secret.txt

# Add to .env file
echo "JWT_ACCESS_SECRET=$(cat jwt-access-secret.txt)" >> .env
echo "JWT_REFRESH_SECRET=$(cat jwt-refresh-secret.txt)" >> .env

# Clean up
rm jwt-access-secret.txt jwt-refresh-secret.txt
```

### 5. Start Development Server
```bash
# Start both client and server
npm run dev

# Or start individually
npm run server    # Server only
npm run client    # Client only
```

### 6. Verify Installation
- **Server**: http://localhost:3000/api/health
- **Client**: http://localhost:5174
- **WebSocket**: ws://localhost:3000

## 📁 Project Structure

```
unbound/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/    # UI components
│   │   ├── crypto/       # Cryptography modules
│   │   ├── utils/        # Utility functions
│   │   ├── hooks/        # React hooks
│   │   ├── types/        # TypeScript definitions
│   │   └── config.js     # Client configuration
│   ├── public/           # Static assets
│   └── package.json      # Frontend dependencies
├── server/                # Node.js backend
│   ├── middleware/       # Express middleware
│   ├── websocket/        # WebSocket handlers
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   └── index.js         # Server entry point
├── config/               # Configuration modules
│   ├── database.js      # Database configuration
│   ├── environment.js   # Environment handling
│   └── security.js     # Security settings
├── docs/                 # Documentation
├── scripts/              # Utility scripts
└── docker-compose.yml     # Development containers
```

## 🔧 Development Workflow

### 1. Feature Development
```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes
# Test your changes
npm run test

# Commit changes
git add .
git commit -m "feat: add your feature description"

# Push and create PR
git push origin feature/your-feature-name
```

### 2. Code Style

#### JavaScript/TypeScript
```javascript
// Use async/await over callbacks
const result = await fetchData();
// Not: fetchData((err, result) => { ... });

// Use destructuring
const { content, publicKey } = postData;
// Not: const content = postData.content; const publicKey = postData.publicKey;

// Use template literals
const message = `Hello ${name}`;
// Not: const message = "Hello " + name;
```

#### React Components
```jsx
// Use functional components with hooks
function MyComponent({ data }) {
  const [state, setState] = useState(null);
  
  useEffect(() => {
    // Side effects here
  }, [data]);
  
  return <div>{state}</div>;
}

// Not: Class components (unless necessary)
```

### 3. Security Guidelines

#### Input Validation
```javascript
// Always validate user input
const validation = validator.validatePostRequest(req.body);
if (!validation.valid) {
  return res.status(400).json({ error: validation.errors });
}
```

#### Cryptographic Operations
```javascript
// Use secure crypto managers
const cryptoManager = new CryptoManager();
const signature = await cryptoManager.signMessage(message);
// Not: Manual crypto operations
```

#### Error Handling
```javascript
// Handle errors gracefully
try {
  const result = await riskyOperation();
  return result;
} catch (error) {
  console.error('Operation failed:', error);
  throw new Error('Operation failed');
}
```

## 🧪 Testing

### Running Tests
```bash
# Run all tests
npm test

# Run specific test suite
npm run test:security
npm run test:integration
npm run test:unit

# Run with coverage
npm run test:coverage
```

### Writing Tests

#### Unit Tests
```javascript
// tests/unit/crypto.test.js
const { CryptoManager } = require('../../src/crypto/CryptoManager');

describe('CryptoManager', () => {
  test('should generate valid seed phrase', async () => {
    const crypto = new CryptoManager();
    const seed = await crypto.generateSeedPhrase();
    
    expect(seed).toBeDefined();
    expect(CryptoManager.validateSeedPhrase(seed)).toBe(true);
  });
});
```

#### Integration Tests
```javascript
// tests/integration/api.test.js
const request = require('supertest');
const app = require('../../server');

describe('API Endpoints', () => {
  test('POST /api/posts should create post', async () => {
    const response = await request(app)
      .post('/api/posts')
      .send(validPostData)
      .expect(201);
      
    expect(response.body).toHaveProperty('id');
  });
});
```

#### Security Tests
```javascript
// tests/security/validation.test.js
const { InputValidator } = require('../../server/middleware/validation');

describe('Input Validation', () => {
  test('should reject XSS attempts', () => {
    const validator = new InputValidator();
    const maliciousContent = '<script>alert("xss")</script>';
    
    const result = validator.validatePostContent(maliciousContent);
    expect(result.valid).toBe(false);
  });
});
```

## 🔍 Debugging

### Server Debugging
```bash
# Enable debug logging
DEBUG=* npm run dev

# Check logs
tail -f logs/app.log
tail -f logs/error.log

# Database debugging
sqlite3 server/unbound.db
.tables
SELECT * FROM posts LIMIT 5;
```

### Client Debugging
```javascript
// Enable debug mode in browser
localStorage.setItem('debug', 'true');

// Check secure storage
import { SecureStorage } from './utils/SecureStorage';
const storage = new SecureStorage();
await storage.initialize('password');
console.log(await storage.getStorageInfo());
```

### WebSocket Debugging
```javascript
// Monitor WebSocket messages
const ws = new WebSocket('ws://localhost:3000');
ws.onmessage = (event) => {
  console.log('Received:', JSON.parse(event.data));
};
```

## 📊 Performance Monitoring

### Client Performance
```javascript
// Measure render performance
const startTime = performance.now();
renderComponent();
const endTime = performance.now();
console.log(`Render took ${endTime - startTime} milliseconds`);
```

### Server Performance
```bash
# Monitor CPU and memory
htop
iostat -x 1

# Database performance
sqlite3 server/unbound.db "EXPLAIN QUERY PLAN SELECT * FROM posts;"

# API response times
curl -w "@curl-format.txt" -o /dev/null -s http://localhost:3000/api/posts
```

## 🔧 Configuration

### Development Environment
```bash
# .env.development
NODE_ENV=development
API_BASE_URL=http://localhost:3000
WS_URL=ws://localhost:3000
ENABLE_DEBUG_LOGGING=true
```

### Production Environment
```bash
# Production .env (example; do not commit)
NODE_ENV=production
API_BASE_URL=https://your-domain.com
WS_URL=wss://your-domain.com
ENABLE_DEBUG_LOGGING=false
REQUIRE_SSL=true
```

## 🚀 Deployment

### Development Deployment
```bash
# Using Docker Compose
docker-compose -f docker-compose.dev.yml up -d

# Manual deployment
npm run build
npm run start:prod
```

### Production Deployment
```bash
# Using Docker
docker-compose -f docker-compose.yml up -d

# Manual deployment
npm run build:prod
npm run start:prod
```

## 🤝 Contributing Guidelines

### Before Contributing
1. Read the [Security Guide](./SECURITY.md)
2. Review the [API Documentation](./API.md)
3. Check existing issues and PRs
4. Set up your development environment

### Making Changes
1. Create a feature branch
2. Write code following style guidelines
3. Add tests for new functionality
4. Update documentation
5. Submit a pull request

### Code Review Process
1. Automated tests must pass
2. Code coverage must not decrease
3. Security review for sensitive changes
4. Performance review for bottlenecks
5. Documentation review for completeness

## 📝 Documentation

### Updating Documentation
- API changes: Update [API.md](./API.md)
- Security changes: Update [SECURITY.md](./SECURITY.md)
- New features: Update [IMPLEMENTATION.md](./IMPLEMENTATION.md)
- Setup changes: Update this guide

### Documentation Style
```markdown
# Use clear, descriptive headings
## Include code examples
### Provide step-by-step instructions
- Use bullet points for lists
- Include command examples in code blocks
```

## 🆘 Troubleshooting

### Common Issues

#### Port Already in Use
```bash
# Find process using port
lsof -i :3000
kill -9 <PID>

# Or use different port
PORT=3001 npm run dev
```

#### Database Connection Failed
```bash
# Check SQLite file permissions
ls -la server/unbound.db

# Recreate database
rm server/unbound.db
npm run dev
```

#### Cryptographic Errors
```bash
# Clear secure storage
localStorage.clear()
# Reload page and re-authenticate
```

#### WebSocket Connection Issues
```bash
# Check WebSocket server
curl -i -N -H "Connection: Upgrade" \
     -H "Upgrade: websocket" \
     -H "Sec-WebSocket-Key: test" \
     -H "Sec-WebSocket-Version: 13" \
     http://localhost:3000/
```

## 📚 Additional Resources

### Cryptography
- [secp256k1 Documentation](https://github.com/paulmillr/noble-secp256k1)
- [BIP-39 Standard](https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

### Security
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [Helmet.js Documentation](https://helmetjs.github.io/)
- [JWT Best Practices](https://auth0.com/blog/json-web-token-best-practices)

### Performance
- [React Performance](https://reactjs.org/docs/optimizing-performance.html)
- [Node.js Performance](https://nodejs.org/en/docs/guides/simple-profiling)
- [Database Optimization](https://www.sqlite.org/optoverview.html)

## 📞 Support

For development questions:
- **Issues**: [GitHub Issues](https://github.com/your-org/unbound/issues)
- **Discussions**: [GitHub Discussions](https://github.com/your-org/unbound/discussions)
- **Security**: security@unbound-platform.org

---

*Last updated: 2026-02-02*  
*Version: 0.1.2*
