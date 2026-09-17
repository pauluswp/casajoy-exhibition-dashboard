#!/usr/bin/env node
/**
 * CasaJoy Dashboard - Current Status Checker
 * 
 * Purpose: Show detailed info about current dashboard state, versions, and recent deployments
 * Usage: node scripts/status-checker.mjs [--detailed]
 * 
 * Output includes:
 * - Current branch and commit hash
 * - Latest version tag
 * - All available rollback targets
 * - Backup locations
 * - Deployment health check
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

/**
 * Get basic Git info
 */
function getGitInfo() {
  try {
    const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    const commitHash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const shortLog = execSync('git log --oneline -1', { encoding: 'utf8' }).trim();
    const author = execSync('git log -1 --format="%an"', { encoding: 'utf8' }).trim();
    const date = execSync('git log -1 --format="%ad --date=short"', { encoding: 'utf8' }).trim();
    
    return { branch, commitHash, shortLog, author, date };
  } catch (error) {
    console.error(`${colors.red}Error getting git info:${colors.reset}`, error.message);
    return null;
  }
}

/**
 * Find version tags for current commit
 */
function getVersionTags() {
  try {
    // Tags that contain this commit
    const containedTags = execSync('git tag --contains HEAD --list "v*"', { encoding: 'utf8' })
      .trim().split('\n').filter(t => t.length > 0)
      .sort()
      .reverse();
    
    // Most recent tag pointing to HEAD
    let currentVersion = null;
    if (containedTags.length > 0) {
      currentVersion = containedTags[0];
      
      // Verify it's exactly on this tag
      const exactTag = execSync('git describe --tags --exact-match HEAD', { encoding: 'utf8' }).trim();
      if (exactTag === currentVersion) {
        currentVersion = `✓ ${currentVersion}`;
      } else {
        currentVersion = `${currentVersion} (not exact)`;
      }
    }
    
    return { current: currentVersion, all: containedTags };
  } catch (error) {
    return { current: null, all: [] };
  }
}

/**
 * Check for uncommitted changes
 */
function getDirtyStatus() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    const lines = status.split('\n').filter(l => l.length > 0);
    return {
      hasChanges: lines.length > 0,
      files: lines.slice(0, 10), // Show first 10
      count: lines.length
    };
  } catch (error) {
    return { hasChanges: false, files: [], count: 0 };
  }
}

/**
 * List backup directories
 */
function listBackups() {
  const PRIVATE_DIR = path.join(process.cwd(), 'private');
  
  try {
    if (!fs.existsSync(PRIVATE_DIR)) {
      return { count: 0, message: 'No private/ directory found' };
    }
    
    const backupFolders = fs.readdirSync(PRIVATE_DIR)
      .filter(d => d.startsWith('backup-') && fs.statSync(path.join(PRIVATE_DIR, d)).isDirectory())
      .sort()
      .reverse();
    
    if (backupFolders.length === 0) {
      return { count: 0, message: 'No backup folders found' };
    }
    
    return {
      count: backupFolders.length,
      folders: backupFolders.slice(0, 5), // Show last 5
      oldest: backupFolders[backupFolders.length - 1],
      newest: backupFolders[0]
    };
  } catch (error) {
    return { count: 0, message: 'Error listing backups' };
  }
}

/**
 * Check database backup availability
 */
function checkDatabaseBackups() {
  const PRIVATE_DIR = path.join(process.cwd(), 'private');
  
  try {
    if (!fs.existsSync(PRIVATE_DIR)) {
      return { available: false, message: 'No private/ directory' };
    }
    
    const dbBackups = fs.readdirSync(PRIVATE_DIR)
      .filter(f => f.endsWith('.sql') && f.includes('backup'))
      .sort()
      .reverse();
    
    if (dbBackups.length === 0) {
      return { available: false, count: 0 };
    }
    
    return {
      available: true,
      count: dbBackups.length,
      latest: dbBackups[0],
      files: dbBackups.slice(0, 5)
    };
  } catch (error) {
    return { available: false, count: 0 };
  }
}

/**
 * Quick health check
 */
function healthCheck() {
  const results = [];
  
  // Check if main branch exists locally
  try {
    execSync('git show-ref --verify --quiet refs/remotes/origin/main');
    results.push({ check: 'Remote origin/main', status: '✅' });
  } catch (e) {
    results.push({ check: 'Remote origin/main', status: '⚠️' });
  }
  
  // Check wrangler.toml exists
  if (fs.existsSync('./wrangler.toml')) {
    results.push({ check: 'wrangler.toml exists', status: '✅' });
  } else {
    results.push({ check: 'wrangler.toml exists', status: '❌' });
  }
  
  // Check site directory exists
  if (fs.existsSync('./site')) {
    const siteFiles = fs.readdirSync('./site').length;
    results.push({ check: `site/ contains ${siteFiles} files`, status: '✅' });
  } else {
    results.push({ check: 'site/ directory exists', status: '❌' });
  }
  
  // Check package.json exists
  if (fs.existsSync('./package.json')) {
    results.push({ check: 'package.json exists', status: '✅' });
  } else {
    results.push({ check: 'package.json exists', status: '⚠️' });
  }
  
  return results;
}

// Main execution
const args = process.argv.slice(2);
const isDetailed = args.includes('--detailed');

console.log(`${colors.cyan}╔════════════════════════════════════════════════════════╗${colors.reset}`);
console.log(`${colors.cyan}║     CasaJoy Dashboard - System Status Report          ║${colors.reset}`);
console.log(`${colors.cyan}╚════════════════════════════════════════════════════════╝${colors.reset}\n`);

// Basic Info
console.log(`${colors.magenta}📊 CURRENT DEPLOYMENT STATUS${colors.reset}\n`);

const gitInfo = getGitInfo();
if (gitInfo) {
  console.log(`Current Branch:   ${colors.green}${gitInfo.branch || '(unknown)'}${colors.reset}`);
  console.log(`Commit Hash:      ${gitInfo.commitHash}\n`);
  console.log(`Last Change:      ${colors.cyan}${gitInfo.shortLog}${colors.reset}`);
  console.log(`By:               ${colors.cyan}${gitInfo.author}${colors.reset} on ${gitInfo.date}\n`);
}

// Version Info
console.log(`${colors.magenta}🏷️ VERSION INFORMATION${colors.reset}\n`);

const versionInfo = getVersionTags();
if (versionInfo.current) {
  console.log(`Current Production: ${colors.green}${versionInfo.current}${colors.reset}`);
} else {
  console.log(`Current Production: ${colors.yellow}No version tag attached${colors.reset}`);
}

if (versionInfo.all.length > 0) {
  console.log(`\nAvailable Rollback Targets:`);
  versionInfo.all.forEach((tag, index) => {
    const marker = index === 0 ? colors.green + '●' : colors.cyan + '○';
    console.log(`  ${marker} ${tag}`);
  });
} else {
  console.log(`\n${colors.yellow}⚠️ No version tags exist yet.${colors.reset}`);
  console.log(`Run: node scripts/version-manager.mjs bump-patch\n`);
}

// Uncommitted Changes
console.log();
const dirtyStatus = getDirtyStatus();
if (dirtyStatus.hasChanges) {
  console.log(`${colors.yellow}⚠️ UNCOMMITTED CHANGES DETECTED (${dirtyStatus.count} files)${colors.reset}`);
  console.log(`First 10 changed files:`);
  dirtyStatus.files.forEach(f => console.log(`  ${f}`));
  console.log();
} else {
  console.log(`${colors.green}✅ No uncommitted changes${colors.reset}\n`);
}

// Backups
console.log(`${colors.magenta}💾 BACKUP SYSTEM${colors.reset}\n`);

const backupInfo = listBackups();
console.log(`Backup Folders: ${backupInfo.count}`);
if (backupInfo.count > 0) {
  console.log(`  Newest: ${backupInfo.newest}`);
  if (backupInfo.oldest !== backupInfo.newest) {
    console.log(`  Oldest: ${backupInfo.oldest}`);
  }
} else {
  console.log(`  ${colors.yellow}None found${colors.reset}`);
}

console.log();

const dbBackups = checkDatabaseBackups();
console.log(`Database Backups: ${dbBackups.available ? colors.green + dbBackups.count + ' files' + colors.reset : colors.yellow + 'None' + colors.reset}`);
if (dbBackups.available) {
  console.log(`  Latest: ${dbBackups.latest}`);
}

// Health Check
console.log();
console.log(`${colors.magenta}🏥 HEALTH CHECK${colors.reset}\n`);

healthCheck().forEach(item => {
  console.log(`  ${item.status} ${item.check}`);
});

// Quick Commands
console.log();
console.log(`${colors.magenta}⚡ QUICK COMMANDS${colors.reset}\n`);

console.log(`To create a new version tag:`);
console.log(`  $ node scripts/version-manager.mjs bump-${['patch', 'minor', 'major'].join(' / ')}`);

console.log(`\nTo rollback to previous version:`);
console.log(`  $ node scripts/rollback-helper.mjs <target-version>`);

console.log(`\nTo preview next deployment:`);
console.log(`  $ node scripts/deploy-guard.sh preview`);

console.log(`\nTo see full documentation:`);
console.log(`  $ cat CASAJOY-VERSIONING-SYSTEM.md`);

// Summary Footer
console.log();
console.log(`${colors.cyan}┌───────────────────────────────────────────────────────┐${colors.reset}`);
console.log(`${colors.cyan}│  Next Action Suggested                                │${colors.reset}`);

let suggestedAction = '';
if (dirtyStatus.hasChanges) {
  suggestedAction = '1. Review your changes with `git diff`\n2. Commit them before creating version tag';
} else if (!versionInfo.current) {
  suggestedAction = '1. Create first version tag:\n   node scripts/version-manager.mjs bump-patch';
} else {
  suggestedAction = 'Dashboard is ready for next feature/improvement';
}

console.log(`${colors.cyan}│                                                       │${colors.reset}`);
suggestedAction.split('\n').forEach(line => {
  console.log(`${colors.cyan}│  ${line.padEnd(59)}│${colors.reset}`);
});

console.log(`${colors.cyan}└───────────────────────────────────────────────────────┘${colors.reset}\n`);

