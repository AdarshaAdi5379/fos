# 🚀 Production Deployment Guide

This guide covers deploying the Unbound platform to production with all security, monitoring, and performance optimizations.

## 📋 Prerequisites

### System Requirements
- **Operating System**: Ubuntu 20.04+ or CentOS 8+ (or equivalent)
- **Memory**: Minimum 2GB RAM (4GB+ recommended)
- **Storage**: Minimum 20GB (SSD recommended)
- **CPU**: 2+ cores
- **Network**: Static IP address required for SSL

### Software Requirements
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl wget git nginx certbot python3-certbot-nginx docker docker-compose postgresql-client

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installations
node --version
npm --version
docker --version
docker-compose --version
```

## 🗝️ Configuration Setup

### 1. Clone Repository
```bash
git clone https://github.com/your-username/unbound.git
cd unbound
```

### 2. Environment Configuration
```bash
# Copy production environment template
cp .env.production .env

# Edit with your production values
nano .env
```

**Critical Settings to Update:**
- `DATABASE_URL`: PostgreSQL connection string
- `JWT_SECRET`: Generate a secure random string
- `CORS_ORIGIN`: Your production domain
- `DB_PASSWORD`: Strong database password

### 3. Generate Secure Secrets
```bash
# Generate JWT secret
openssl rand -base64 64

# Generate database password
openssl rand -base64 32
```

## 🐳 Deployment Methods

### Method 1: Docker Compose (Recommended)

#### Setup SSL Certificates
```bash
# Obtain SSL certificates (Let's Encrypt)
sudo certbot certonly --standalone -d yourdomain.com

# Copy certificates to nginx directory
sudo cp /etc/letsencrypt/live/yourdomain.com/fullchain.pem nginx/cert.pem
sudo cp /etc/letsencrypt/live/yourdomain.com/privkey.pem nginx/key.pem
```

#### Deploy Application
```bash
# Build and start services
docker-compose up -d

# Verify deployment
docker-compose ps
docker-compose logs app
```

#### SSL Renewal (Let's Encrypt)
```bash
# Add to crontab for automatic renewal
crontab -e

# Add this line (runs monthly at 2 AM):
0 2 1 * * /usr/bin/certbot renew --quiet && docker-compose restart nginx
```

### Method 2: Native Deployment

#### Install Dependencies
```bash
# Install server dependencies
npm ci --production

# Build client
cd client
npm ci
npm run build
cd ..
```

#### Setup PostgreSQL
```bash
# Install PostgreSQL (Ubuntu)
sudo apt install postgresql postgresql-contrib

# Create database and user
sudo -u postgres psql << EOF
CREATE DATABASE unbound;
CREATE USER unbound_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE unbound TO unbound_user;
ALTER USER unbound_user CREATEDB;
\q
EOF
```

#### Setup Redis (Optional but recommended)
```bash
# Install Redis
sudo apt install redis-server

# Configure Redis
sudo nano /etc/redis/redis.conf

# Start and enable Redis
sudo systemctl start redis-server
sudo systemctl enable redis-server
```

#### Deploy Application
```bash
# Make deployment script executable
chmod +x scripts/deploy.sh

# Run deployment
./scripts/deploy.sh
```

## 🔒 Security Configuration

### SSL/TLS Setup
```bash
# For nginx reverse proxy
sudo nginx -t  # Test configuration
sudo systemctl reload nginx

# For direct application (if needed)
# Configure in .env:
SSL_CERT_PATH=/path/to/cert.pem
SSL_KEY_PATH=/path/to/key.pem
```

### Firewall Setup
```bash
# Configure UFW firewall
sudo ufw enable
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw status
```

### Database Security
```bash
# PostgreSQL security
sudo nano /etc/postgresql/13/main/postgresql.conf

# Security settings:
listen_addresses = 'localhost'
ssl = on
password_encryption = scram-sha-256
```

## 📊 Monitoring & Maintenance

### Health Checks
```bash
# Application health check
curl https://yourdomain.com/api/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "database": { "type": "postgresql", "connected": true },
  "websocket_connections": 10
}
```

### Log Monitoring
```bash
# View application logs
tail -f logs/app.log

# View error logs
tail -f logs/error.log

# View nginx logs
sudo tail -f /var/log/nginx/access.log
```

### Database Backups
```bash
# Manual backup
./scripts/backup.sh

# View backups
ls -la backups/

# Restore from backup (PostgreSQL)
psql -h localhost -U unbound_user -d unbound < backup_file.sql
```

### Performance Monitoring
```bash
# Check resource usage
docker stats
htop
iostat 1

# Database performance
# For PostgreSQL
sudo -u postgres psql -d unbound -c "SELECT * FROM pg_stat_activity;"

# For Redis
redis-cli info stats
```

## 🔧 Troubleshooting

### Common Issues

#### Database Connection Failed
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check connection
psql -h localhost -U unbound_user -d unbound -c "SELECT 1;"
```

#### SSL Certificate Issues
```bash
# Check certificate expiration
openssl x509 -in /etc/nginx/ssl/cert.pem -text -noout | grep "Not After"

# Test SSL configuration
sudo nginx -t
```

#### High Memory Usage
```bash
# Check memory usage
free -h
docker stats

# Restart services if needed
docker-compose restart app
```

#### WebSocket Connection Issues
```bash
# Check WebSocket support
wscat -c wss://yourdomain.com/socket.io/

# Check nginx WebSocket proxy
grep ws /etc/nginx/nginx.conf
```

### Emergency Procedures

#### Rollback Deployment
```bash
# Docker rollback
docker-compose down
docker images | grep unbound  # Find previous image
docker run -d previous_image_id
```

#### Database Recovery
```bash
# Restore from backup
./scripts/deploy.sh --restore backup_file.sql
```

#### Service Restart
```bash
# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart app
docker-compose restart nginx
```

## 📈 Scaling Considerations

### Horizontal Scaling
- Use load balancer (nginx, HAProxy)
- Multiple app instances
- Session management via Redis
- Database read replicas

### Vertical Scaling
- Increase server resources
- Optimize database settings
- Enable connection pooling
- Implement caching strategies

### CDN Integration
```nginx
# Add to nginx.conf
location /static/ {
    proxy_pass https://your-cdn-provider.com/;
    proxy_set_header Host your-cdn-provider.com;
}
```

## 🔍 Advanced Configuration

### Custom Rate Limiting
```bash
# Edit rate limiting in .env
RATE_LIMIT_POSTS=10
RATE_LIMIT_EDITS=30
RATE_LIMIT_GENERAL=200
```

### Database Optimization
```sql
-- PostgreSQL performance tuning
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
ALTER SYSTEM SET maintenance_work_mem = '64MB';
SELECT pg_reload_conf();
```

### Monitoring Integration
```bash
# Prometheus setup (optional)
docker run -d -p 9090:9090 prom/prometheus

# Grafana setup (optional)
docker run -d -p 3000:3000 grafana/grafana
```

## 📞 Support

### Health Check Endpoints
- `GET /api/health` - Application health
- `GET /api/metrics` - Application metrics
- `GET /health` - Nginx health

### Log Locations
- Application logs: `./logs/`
- Nginx logs: `/var/log/nginx/`
- Database logs: `/var/log/postgresql/`

### Backup Locations
- Default: `./backups/`
- Configure via `BACKUP_PATH` environment variable

---

## 🎉 Deployment Complete!

After completing these steps, your Unbound application will be:

✅ **Production Ready**: All security measures enabled
✅ **Monitored**: Health checks and logging active  
✅ **Scalable**: Docker-based deployment
✅ **Secure**: SSL/TLS, firewall, rate limiting
✅ **Backed Up**: Automated database backups

### Next Steps
1. Monitor initial performance
2. Set up alerting
3. Configure backup verification
4. Test disaster recovery procedures
5. Plan scaling strategy

For additional support, refer to the [troubleshooting guide](#-troubleshooting) or check the application logs.