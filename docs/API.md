# 📚 API Documentation

## Overview
This document describes the REST API and WebSocket endpoints for the Unbound platform.

## Base URL
- **Development**: `http://localhost:3000`
- **Production**: `https://your-domain.com`

## Authentication
All API requests require cryptographic signature verification. JWT tokens are used for session management.

## REST API Endpoints

### Authentication

#### Login (Generate Tokens)
```http
POST /api/auth/login
Content-Type: application/json

{
  "publicKey": "0x...",
  "signature": "0x...",
  "message": "Authentication challenge message"
}
```

#### Refresh Access Token
```http
POST /api/auth/refresh
Content-Type: application/json

{
  "refreshToken": "your_refresh_token"
}
```

#### Logout
```http
POST /api/auth/logout
Authorization: Bearer access_token
```

### Posts

#### Create Post
```http
POST /api/posts
Content-Type: application/json
Authorization: Bearer access_token

{
  "content": "Your post content here",
  "publicKey": "0x...",
  "signature": "0x...",
  "recovery": 0
}
```

#### Update Post
```http
PUT /api/posts/:id
Content-Type: application/json
Authorization: Bearer access_token

{
  "content": "Updated post content",
  "publicKey": "0x...",
  "signature": "0x...",
  "recovery": 0
}
```

#### Get Single Post
```http
GET /api/posts/:id
```

#### Get Post Versions
```http
GET /api/posts/:id/versions
```

#### Get Identity Posts
```http
GET /api/identities/:publicKey/posts?limit=50
```

### Advanced Feed System

#### Get Feed (Algorithmic Ranking)
```http
GET /api/feed?strategy=algorithmic&limit=50&offset=0&content_filter=all
```

**Parameters:**
- `strategy`: `algorithmic`, `chronological`, `hot`
- `content_filter`: `all`, `recent`, `trending`
- `limit`: Number of posts (max 100)
- `offset`: Pagination offset

**Response Example:**
```json
{
  "success": true,
  "data": {
    "posts": [...],
    "strategy": "algorithmic",
    "total": 25,
    "hasMore": true
  },
  "meta": {
    "pagination": {...},
    "timestamp": "2026-02-02T12:00:00.000Z"
  }
}
```

#### Search Posts
```http
GET /api/search?q=your+query&limit=50&offset=0
```

#### Get Trending Topics
```http
GET /api/trending?limit=10
```

#### Get Author Feed
```http
GET /api/feed/author/:authorKey?limit=20&offset=0
```

#### Get Feed Statistics
```http
GET /api/stats/feed
```

### User Preferences & Analytics

#### Get User Preferences
```http
GET /api/preferences
Authorization: Bearer access_token
```

#### Update User Preferences
```http
POST /api/preferences
Content-Type: application/json
Authorization: Bearer access_token

{
  "preferences": {
    "feed_strategy": "algorithmic",
    "content_filters": ["nsfw", "spam"],
    "theme": "dark"
  }
}
```

#### Record User Interaction
```http
POST /api/interaction
Content-Type: application/json
Authorization: Bearer access_token

{
  "postId": 123,
  "interactionType": "view",
  "data": {
    "source": "feed",
    "duration": 5000
  }
}
```

#### Get Analytics Dashboard
```http
GET /api/analytics?days=30
Authorization: Bearer access_token
```

### System

#### Health Check (Enhanced)
```http
GET /api/health
```

**Enhanced Response:**
```json
{
  "status": "ok",
  "timestamp": "2026-02-02T12:00:00.000Z",
  "environment": "development",
  "features": {
    "jwtConfigured": true,
    "inputValidatorReady": true,
    "feedControllerReady": true,
    "rateLimitingEnabled": true,
    "advancedFeedEnabled": true
  },
  "websocket": {
    "connections": 15,
    "authenticated": 12,
    "uptime": 86400000
  },
  "database": {
    "type": "sqlite",
    "connected": true
  },
  "version": "0.1.2"
}
```

## WebSocket API

### Connection
```javascript
const ws = new WebSocket('ws://localhost:3000/socket.io');
```

### Messages

#### New Post Notification
```json
{
  "type": "new_post",
  "data": {
    "id": 1,
    "content": "Post content",
    "author_key": "0x...",
    "created_at": "2026-02-02T12:00:00.000Z"
  }
}
```

#### Post Update Notification
```json
{
  "type": "post_updated",
  "data": {
    "id": 1,
    "content": "Updated content",
    "updated_at": "2026-02-02T12:30:00.000Z"
  }
}
```

## Data Models

### Post
```typescript
interface Post {
  id: number;
  post_uuid: string;
  author_key: string;
  content: string;
  signature: string;
  recovery: number;
  created_at: string;
  updated_at?: string;
}
```

### Post Version
```typescript
interface PostVersion {
  id: number;
  post_id: number;
  version_number: number;
  content: string;
  signature: string;
  recovery: number;
  created_at: string;
}
```

### Identity
```typescript
interface Identity {
  public_key: string;
  created_at: string;
  last_seen: string;
}
```

## Error Responses

All errors follow this format:

```json
{
  "error": "Error description",
  "code": "ERROR_CODE",
  "timestamp": "2026-02-02T12:00:00.000Z"
}
```

### Common Error Codes

- `400` - Bad Request (missing fields, invalid data)
- `401` - Unauthorized (invalid signature)
- `403` - Forbidden (not authorized to edit)
- `404` - Not Found
- `429` - Rate Limited
- `500` - Internal Server Error

## Rate Limiting

- **Posts**: 10 per 15 minutes
- **Edits**: 20 per 15 minutes  
- **General**: 100 per 15 minutes

Rate limiting is based on IP address and cryptographic identity.

## Security Notes

1. All post modifications require valid cryptographic signatures
2. Content is publicly visible by design
3. No private data is stored on the server
4. JWT tokens are short-lived for security

## WebSocket Security

- WebSocket connections require TLS in production
- Message signing verification
- Rate limiting applies to WebSocket messages
- Connection timeouts enforced

---

*Last updated: 2026-02-02*