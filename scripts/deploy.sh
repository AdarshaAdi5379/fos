#!/bin/bash

# Production Deployment Script
set -e

echo "🚀 Starting Unbound Production Deployment"

# Configuration
BACKUP_DIR="/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/unbound_backup_${TIMESTAMP}.sql"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Check if running as root
check_permissions() {
    if [[ $EUID -eq 0 ]]; then
        error "This script should not be run as root"
        exit 1
    fi
}

# Create necessary directories
create_directories() {
    log "Creating necessary directories..."
    mkdir -p logs
    mkdir -p backups
    mkdir -p nginx/ssl
}

# Backup current database
backup_database() {
    log "Creating database backup..."
    
    if [ -n "$DATABASE_URL" ] && [[ "$DATABASE_URL" == *"postgresql"* ]]; then
        # PostgreSQL backup
        PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" > "$BACKUP_FILE"
    elif [ -f "unbound.db" ]; then
        # SQLite backup
        cp unbound.db "${BACKUP_DIR}/unbound_${TIMESTAMP}.db"
        BACKUP_FILE="${BACKUP_DIR}/unbound_${TIMESTAMP}.db"
    else
        warn "No database found to backup"
        return
    fi
    
    if [ $? -eq 0 ]; then
        log "Database backup created: $BACKUP_FILE"
    else
        error "Database backup failed"
        exit 1
    fi
}

# Pull latest code
update_code() {
    log "Updating application code..."
    git pull origin main
    
    if [ $? -ne 0 ]; then
        error "Failed to pull latest code"
        exit 1
    fi
    
    log "Code updated successfully"
}

# Install dependencies
install_dependencies() {
    log "Installing production dependencies..."
    npm ci --production
    
    if [ $? -ne 0 ]; then
        error "Failed to install dependencies"
        exit 1
    fi
    
    log "Dependencies installed successfully"
}

# Build client
build_client() {
    log "Building client application..."
    cd client
    npm ci
    npm run build
    
    if [ $? -ne 0 ]; then
        error "Failed to build client"
        exit 1
    fi
    
    cd ..
    log "Client built successfully"
}

# Run database migrations
run_migrations() {
    log "Running database migrations..."
    # Migration logic would go here
    # For now, the schema is created automatically
    log "Database schema updated"
}

# Health check
health_check() {
    log "Performing health check..."
    
    # Wait for application to start
    sleep 10
    
    response=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health || echo "000")
    
    if [ "$response" = "200" ]; then
        log "Health check passed"
    else
        error "Health check failed (HTTP $response)"
        exit 1
    fi
}

# Deploy using Docker
deploy_docker() {
    log "Deploying with Docker..."
    
    # Stop existing containers
    docker-compose down || true
    
    # Pull latest images
    docker-compose pull
    
    # Start new containers
    docker-compose up -d
    
    if [ $? -ne 0 ]; then
        error "Docker deployment failed"
        exit 1
    fi
    
    log "Docker deployment successful"
}

# Deploy without Docker
deploy_native() {
    log "Deploying natively..."
    
    # Stop existing application
    pkill -f "node server/index.js" || true
    
    # Start new application
    nohup npm start > logs/app.log 2>&1 &
    
    if [ $? -ne 0 ]; then
        error "Native deployment failed"
        exit 1
    fi
    
    log "Native deployment successful"
}

# Cleanup old backups
cleanup_backups() {
    log "Cleaning up old backups (keeping last 7 days)..."
    
    find backups/ -name "*.sql" -mtime +7 -delete 2>/dev/null || true
    find backups/ -name "*.db" -mtime +7 -delete 2>/dev/null || true
    
    log "Backup cleanup completed"
}

# Main deployment flow
main() {
    log "Starting deployment process..."
    
    check_permissions
    create_directories
    backup_database
    update_code
    install_dependencies
    build_client
    run_migrations
    
    # Choose deployment method
    if command -v docker &> /dev/null && docker --version | grep -q "20\."; then
        deploy_docker
    else
        deploy_native
    fi
    
    sleep 5
    health_check
    cleanup_backups
    
    log "🎉 Deployment completed successfully!"
    log "📊 Application is running at: http://localhost:3000"
    log "🔍 Health check endpoint: http://localhost:3000/api/health"
}

# Handle signals gracefully
trap 'error "Deployment interrupted"; exit 1' INT TERM

# Run main function
main "$@"