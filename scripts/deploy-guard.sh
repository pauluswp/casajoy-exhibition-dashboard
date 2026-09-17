#!/bin/bash
# CasaJoy Dashboard - Pre-Deployment Guard Script
# 
# Purpose: Create automatic backups BEFORE any deployment occurs
# Usage: ./scripts/deploy-guard.sh [environment]
#
# Environment options:
#   preview  → Deploy to preview environment (default)
#   production → Deploy to main branch

set -e  # Exit on error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKUP_DIR="$PROJECT_DIR/private/backup-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="$PROJECT_DIR/logs/deploy-guard.log"

# Create logs directory if needed
mkdir -p "$PROJECT_DIR/logs"

log() {
    echo -e "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

print_header() {
    echo ""
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  CasaJoy Dashboard - Deployment Guard  ${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

check_prerequisites() {
    log "🔍 Checking prerequisites..."
    
    # Check git
    if ! command -v git &> /dev/null; then
        echo -e "${RED}❌ Git not installed!${NC}"
        exit 1
    fi
    
    # Check wrangler (optional, for database backup)
    if ! command -v npx &> /dev/null; then
        echo -e "${YELLOW}⚠️  Node/npm not found. Database backup skipped.${NC}"
    fi
    
    log "✅ All prerequisites met"
}

create_backup_snapshot() {
    log "📦 Creating deployment snapshot at: $BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"
    
    # Backup 1: Current branch info
    log "📋 Saving branch information..."
    git branch -a > "$BACKUP_DIR/branches.txt"
    
    # Backup 2: Current commit hash
    COMMIT_HASH=$(git rev-parse HEAD)
    echo "$COMMIT_HASH" > "$BACKUP_DIR/current-commit.txt"
    log "📝 Commit: $COMMIT_HASH"
    
    # Backup 3: All files modified in last commit
    git diff HEAD~1 --name-only > "$BACKUP_DIR/modified-files.txt" 2>/dev/null || echo "First commit" > "$BACKUP_DIR/modified-files.txt"
    
    # Backup 4: Version tag info
    if git describe --tags --exact-match 2>/dev/null; then
        CURRENT_TAG=$(git describe --tags --exact-match)
        echo "$CURRENT_TAG" > "$BACKUP_DIR/current-tag.txt"
        log "🏷️  Tag: $CURRENT_TAG"
    else
        echo "No current tag" > "$BACKUP_DIR/current-tag.txt"
        log "⚠️  No version tag attached to this commit"
    fi
    
    # Backup 5: Export D1 database if available
    if command -v npx &> /dev/null && [ -f "wrangler.toml" ]; then
        log "💾 Backing up D1 database..."
        BACKUP_SQL="$BACKUP_DIR/db-backup.sql"
        
        # Try to export from remote Cloudflare instance
        if npx wrangler d1 execute casajoy-exhibition --remote --command=".dump" > "$BACKUP_SQL" 2>&1; then
            log "✅ Database exported successfully!"
            
            # Show stats
            LINES=$(wc -l < "$BACKUP_SQL")
            SIZE=$(du -h "$BACKUP_SQL" | cut -f1)
            log "📊 Database backup: $LINES rows, $SIZE"
        else
            log "⚠️  Database backup failed (may not have credentials). This is optional."
        fi
    else
        log "⚠️  Cannot backup D1 database (npx or wrangler.toml not found)"
    fi
    
    # Backup 6: Git status snapshot
    git status --short > "$BACKUP_DIR/git-status-before.txt" 2>/dev/null || true
    
    log "✅ Snapshot saved to: $BACKUP_DIR"
}

get_target_branch() {
    local env="${1:-preview}"
    
    case $env in
        production)
            echo "main"
            ;;
        preview|staging)
            # Create feature branch if not exists
            TIMESTAMP=$(date +%Y%m%d-%H%M%S)
            FEATURE_BRANCH="deploy-guard/$TIMESTAMP"
            git checkout -b "$FEATURE_BRANCH" 2>/dev/null || git checkout "$FEATURE_BRANCH"
            echo "$FEATURE_BRANCH"
            ;;
        *)
            echo "main"
            ;;
    esac
}

show_summary() {
    local target_branch="$1"
    
    echo ""
    echo -e "${GREEN}✅ Backup Created Successfully!${NC}"
    echo ""
    echo "Snapshot Location: $BACKUP_DIR"
    echo "Backup Includes:"
    echo "  • Git branch information"
    echo "  • Current commit hash: $(cat $BACKUP_DIR/current-commit.txt 2>/dev/null)"
    echo "  • Current version tag: $(cat $BACKUP_DIR/current-tag.txt 2>/dev/null || echo 'None')"
    echo "  • Modified files list"
    echo "  • Database export: $(if [ -f '$BACKUP_DIR/db-backup.sql' ]; then echo '✓'; else echo '✗'; fi)"
    echo ""
    echo -e "${BLUE}To rollback:${NC}"
    echo "  1. Run: node scripts/rollback-helper.mjs target-dir=$BACKUP_DIR"
    echo ""
    echo -e "${YELLOW}Target Branch:${NC} $target_branch"
    echo -e "${BLUE}========================================${NC}\n"
}

# Main execution
TARGET_ENV="${1:-preview}"

print_header
check_prerequisites
create_backup_snapshot
TARGET_BRANCH=$(get_target_branch "$TARGET_ENV")
show_summary "$TARGET_BRANCH"
