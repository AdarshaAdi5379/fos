#!/bin/bash

# Database Backup Script
set -e

# Configuration
BACKUP_DIR="${BACKUP_PATH:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=${BACKUP_RETENTION:-7}

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

# Create backup directory
create_backup_dir() {
    mkdir -p "$BACKUP_DIR"
    log "Backup directory: $BACKUP_DIR"
}

# Backup PostgreSQL database
backup_postgresql() {
    local backup_file="$BACKUP_DIR/unbound_postgres_${TIMESTAMP}.sql"
    
    log "Creating PostgreSQL backup..."
    
    if ! command -v pg_dump &> /dev/null; then
        error "pg_dump not found. Please install PostgreSQL client tools."
        exit 1
    fi
    
    PGPASSWORD="$DB_PASSWORD" pg_dump \
        -h "$DB_HOST" \
        -p "$DB_PORT" \
        -U "$DB_USER" \
        -d "$DB_NAME" \
        --no-password \
        --verbose \
        --format=custom \
        --compress=9 \
        --file="$backup_file"
    
    if [ $? -eq 0 ]; then
        log "PostgreSQL backup created: $backup_file"
        echo "$backup_file"
    else
        error "PostgreSQL backup failed"
        exit 1
    fi
}

# Backup SQLite database
backup_sqlite() {
    local db_path="${DATABASE_URL#sqlite:}"
    local backup_file="$BACKUP_DIR/unbound_sqlite_${TIMESTAMP}.db"
    
    log "Creating SQLite backup..."
    
    if [ ! -f "$db_path" ]; then
        error "SQLite database not found at: $db_path"
        exit 1
    fi
    
    # Use sqlite3 backup command for consistency
    sqlite3 "$db_path" ".backup $backup_file"
    
    if [ $? -eq 0 ]; then
        log "SQLite backup created: $backup_file"
        echo "$backup_file"
    else
        error "SQLite backup failed"
        exit 1
    fi
}

# Verify backup integrity
verify_backup() {
    local backup_file="$1"
    
    log "Verifying backup integrity..."
    
    if [ ! -f "$backup_file" ]; then
        error "Backup file not found: $backup_file"
        return 1
    fi
    
    # Check file size (basic integrity check)
    local file_size=$(stat -f%z "$backup_file" 2>/dev/null || stat -c%s "$backup_file" 2>/dev/null)
    
    if [ "$file_size" -eq 0 ]; then
        error "Backup file is empty: $backup_file"
        return 1
    fi
    
    log "Backup integrity verified (size: $file_size bytes)"
    return 0
}

# Cleanup old backups
cleanup_old_backups() {
    log "Cleaning up backups older than $RETENTION_DAYS days..."
    
    # Clean up SQL files
    find "$BACKUP_DIR" -name "*.sql" -type f -mtime +$RETENTION_DAYS -delete
    
    # Clean up DB files
    find "$BACKUP_DIR" -name "*.db" -type f -mtime +$RETENTION_DAYS -delete
    
    log "Old backups cleaned up"
}

# Compress old backups (for space saving)
compress_old_backups() {
    log "Compressing backups older than 1 day..."
    
    find "$BACKUP_DIR" -name "*.sql" -type f -mtime +1 -exec gzip {} \;
    find "$BACKUP_DIR" -name "*.db" -type f -mtime +1 -exec gzip {} \;
    
    log "Old backups compressed"
}

# Main backup function
main() {
    log "Starting database backup process..."
    
    create_backup_dir
    
    # Detect database type and backup accordingly
    if [[ "$DATABASE_URL" == *"postgresql"* ]]; then
        backup_file=$(backup_postgresql)
    elif [[ "$DATABASE_URL" == *"sqlite"* ]]; then
        backup_file=$(backup_sqlite)
    else
        error "Unsupported database type: $DATABASE_URL"
        error "Please set DATABASE_URL to a valid PostgreSQL or SQLite connection string"
        exit 1
    fi
    
    # Verify the backup
    if verify_backup "$backup_file"; then
        log "✅ Backup completed successfully: $backup_file"
        
        # Compress and cleanup
        compress_old_backups
        cleanup_old_backups
        
        log "📊 Backup statistics:"
        log "   Total backups: $(find "$BACKUP_DIR" -name '*.gz' -o -name '*.sql' -o -name '*.db' | wc -l)"
        log "   Backup directory: $BACKUP_DIR"
        log "   Retention period: $RETENTION_DAYS days"
    else
        error "❌ Backup verification failed"
        exit 1
    fi
}

# Handle arguments
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Environment Variables:"
    echo "  DATABASE_URL    Database connection string"
    echo "  DB_HOST         PostgreSQL host (for PostgreSQL)"
    echo "  DB_PORT         PostgreSQL port (for PostgreSQL)"
    echo "  DB_USER         PostgreSQL username (for PostgreSQL)"
    echo "  DB_NAME         PostgreSQL database name (for PostgreSQL)"
    echo "  DB_PASSWORD     PostgreSQL password (for PostgreSQL)"
    echo "  BACKUP_PATH     Backup directory path (default: ./backups)"
    echo "  BACKUP_RETENTION  Days to keep backups (default: 7)"
    echo ""
    echo "Examples:"
    echo "  DATABASE_URL=sqlite:./unbound.db $0"
    echo "  DATABASE_URL=postgresql://user:pass@host:5432/db DB_PASSWORD=pass $0"
    exit 0
fi

# Run backup
main "$@"