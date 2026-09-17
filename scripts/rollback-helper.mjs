#!/usr/bin/env node
/**
 * CasaJoy Dashboard - Rollback Helper Script
 * 
 * Purpose: Restore dashboard to a previous version quickly and safely
 * Usage: node scripts/rollback-helper.mjs <target-version>
 * 
 * Examples:
 *   node scripts/rollback-helper.mjs v1.0.0-20260915-143000
 *   node scripts/rollback-helper.mjs target-dir=/path/to/backup/folder
 * 
 * Safe operations:
 * 1. Resets code to exact previous state (no leftover files)
 * 2. Restores database from matching backup if exists
 * 3. Confirms successful rollback with verification
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
  cyan: '\x1b[36m'
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  
  // Look for --version or positional argument
  let targetVersion = null;
  let backupDir = null;
  
  args.forEach(arg => {
    if (arg.startsWith('--version=')) {
      targetVersion = arg.split('=')[1];
    } else if (arg.startsWith('v')) {
      targetVersion = arg;
    } else if (arg.startsWith('--backup=')) {
      backupDir = arg.split('=')[1];
    }
  });
  
  return { targetVersion, backupDir };
}

/**
 * Verify the target version exists in git history
 */
function verifyTargetExists(targetVersion) {
  try {
    console.log(`${colors.cyan}🔍 Verifying target version exists...${colors.reset}`);
    
    // Check if tag exists
    execSync(`git rev-parse ${targetVersion}`, { stdio: 'pipe' });
    
    console.log(`${colors.green}✅ Version found:${colors.reset} ${targetVersion}\n`);
    return true;
  } catch (error) {
    console.error(`${colors.red}❌ Error:${colors.reset} Target version not found!`);
    console.log(`Available versions:`);
    
    try {
      const allTags = execSync('git tag --list "v*" --sort=-creatordate', { encoding: 'utf8' })
        .trim().split('\n').slice(0, 10);
      
      allTags.forEach(tag => console.log(`  • ${tag}`));
    } catch (e) {
      console.log(`  No tags found`);
    }
    
    return false;
  }
}

/**
 * Find matching database backup file
 */
function findMatchingBackup(targetVersion) {
  const PROJECT_DIR = process.cwd();
  const PRIVATE_DIR = path.join(PROJECT_DIR, 'private');
  
  try {
    if (!fs.existsSync(PRIVATE_DIR)) {
      console.log(`${colors.yellow}⚠️  private/ directory not found.${colors.reset} Skipping database restore.`);
      return null;
    }
    
    // Try to match timestamp from version string
    const timestampMatch = targetVersion.match(/(\d{8})-(\d{6})/);
    
    if (!timestampMatch) {
      console.log(`${colors.yellow}⚠️  Could not extract timestamp from version.${colors.reset} Listing recent backups...`);
      
      // List all sql backups
      const backups = fs.readdirSync(PRIVATE_DIR)
        .filter(f => f.endsWith('.sql') && f.includes('backup'));
      
      if (backups.length === 0) {
        console.log(`  No database backups found.\n`);
        return null;
      }
      
      backups.forEach(b => console.log(`  • ${b}`));
      console.log(`\nIf you want to restore database manually, run:\n  npx wrangler d1 execute casajoy-exhibition --remote --file="private/<filename>.sql"`);
      return null;
    }
    
    const [date, time] = timestampMatch.slice(1);
    const expectedFilename = `db-backup-${date}-${time}.sql`;
    const fullBackupPath = path.join(PRIVATE_DIR, expectedFilename);
    
    if (fs.existsSync(fullBackupPath)) {
      console.log(`${colors.green}✅ Found matching database backup:${colors.reset} ${expectedFilename}\n`);
      return fullBackupPath;
    }
    
    console.log(`${colors.yellow}⚠️  Database backup not found at expected location.${colors.reset}`);
    console.log(`Expected: ${fullBackupPath}`);
    console.log(`\nSearching for similar timestamps...\n`);
    
    // Search for closest backup by date
    const backups = fs.readdirSync(PRIVATE_DIR)
      .filter(f => f.startsWith('db-backup-') && f.endsWith('.sql'))
      .map(f => ({ name: f, time: fs.statSync(path.join(PRIVATE_DIR, f)).mtime }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 5);
    
    if (backups.length > 0) {
      console.log(`Recent backups:`);
      backups.forEach(b => {
        console.log(`  • ${b.name} (created: ${b.time.toLocaleString()})`);
      });
      console.log(`\nUse: node scripts/rollback-helper.mjs --custom-db=/path/to/sql/file\n`);
    }
    
    return null;
  } catch (error) {
    console.error(`${colors.red}Error searching for backup:${colors.reset}`, error.message);
    return null;
  }
}

/**
 * Perform Git reset to target version
 */
function performGitReset(targetVersion) {
  try {
    console.log(`${colors.cyan}🔄 Resetting repository to ${targetVersion}...${colors.reset}`);
    
    // Hard reset to target commit
    execSync(`git reset --hard ${targetVersion}`, { stdio: 'inherit' });
    
    // Clean untracked files
    execSync('git clean -fd', { stdio: 'inherit' });
    
    console.log(`${colors.green}✅ Code restored successfully!${colors.reset}\n`);
    
    // Show what changed
    console.log(`${colors.blue}Changed Files:${colors.reset}`);
    const diffFiles = execSync(`git diff HEAD~1..HEAD --name-only`, { encoding: 'utf8' }).trim();
    
    if (diffFiles) {
      diffFiles.split('\n').forEach(file => console.log(`  • ${file}`));
    } else {
      console.log(`  All files restored cleanly`);
    }
    console.log();
    
  } catch (error) {
    console.error(`${colors.red}❌ Git reset failed:${colors.reset}`, error.message);
    process.exit(1);
  }
}

/**
 * Push reset changes to production
 */
function pushToProduction(targetVersion) {
  try {
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    
    if (currentBranch !== 'main') {
      console.log(`${colors.yellow}⚠️  Currently on branch: ${currentBranch}${colors.reset}`);
      console.log(`Would you like to checkout main first? (y/n)`);
      const answer = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });
      
      return new Promise((resolve) => {
        answer.question('> ', (answer) => {
          answer.close();
          if (answer.toLowerCase() === 'y') {
            execSync('git checkout main', { stdio: 'inherit' });
            resolve(true);
          } else {
            resolve(false);
          }
        });
      });
    }
    
    console.log(`${colors.cyan}📤 Pushing rollback to GitHub...${colors.reset}`);
    execSync('git push origin main --force', { stdio: 'inherit' });
    
    console.log(`${colors.green}✅ Successfully pushed rollback to production!${colors.reset}\n`);
    
  } catch (error) {
    console.error(`${colors.red}Error pushing to production:${colors.reset}`, error.message);
  }
}

/**
 * Restore database from backup file
 */
async function restoreDatabase(backupFile) {
  if (!backupFile || !fs.existsSync(backupFile)) {
    console.log(`${colors.yellow}⚠️  No database backup file available.${colors.reset} Skipping database restore.\n`);
    return;
  }
  
  try {
    console.log(`${colors.cyan}💾 Restoring database from backup...${colors.reset}`);
    
    const cmd = `npx wrangler d1 execute casajoy-exhibition --remote --file="${backupFile}"`;
    execSync(cmd, { stdio: 'inherit' });
    
    console.log(`${colors.green}✅ Database restored successfully!${colors.reset}\n`);
    
  } catch (error) {
    console.error(`${colors.red}❌ Database restore failed:${colors.reset}`);
    console.log(error.message);
    console.log(`\nTo restore manually, run:`);
    console.log(`  npx wrangler d1 execute casajoy-exhibition --remote --file="${backupFile}"\n`);
  }
}

/**
 * Verify rollback was successful
 */
function verifyRollback(targetVersion) {
  try {
    console.log(`${colors.cyan}🔐 Verifying rollback integrity...${colors.reset}`);
    
    // Confirm we're at correct commit
    const currentCommit = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const targetCommit = execSync(`git rev-parse ${targetVersion}`, { encoding: 'utf8' }).trim();
    
    if (currentCommit === targetCommit) {
      console.log(`${colors.green}✅ Verified: Repository is now at ${targetVersion}${colors.reset}\n`);
    } else {
      console.error(`${colors.red}❌ ERROR: Current commit does not match target!${colors.reset}`);
      process.exit(1);
    }
    
    // Show recent commits around current point
    try {
      const logOutput = execSync(`git log ${targetVersion}..HEAD --oneline`, { encoding: 'utf8' });
    
      if (logOutput.trim()) {
        console.log(`${colors.cyan}Changes since this version:${colors.reset}`);
        console.log(logOutput.split('\n').map(l => `  • ${l}`).join('\n'));
        console.log();
      }
    } catch (e) {
      // No changes found - that's fine
    }
    
  } catch (error) {
    console.error(`${colors.red}Verification failed:${colors.reset}`, error.message);
  }
}

// Main execution
async function main() {
  const { targetVersion, backupDir } = parseArgs();
  
  // Print banner
  console.log(`${colors.cyan}╔════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.cyan}║   CasaJoy Dashboard - Rollback Helper      ║${colors.reset}`);
  console.log(`${colors.cyan}╚════════════════════════════════════════════╝${colors.reset}\n`);
  
  if (!targetVersion && !backupDir) {
    console.log(`${colors.yellow}Usage:${colors.reset} node scripts/rollback-helper.mjs <target-version>\n`);
    console.log('Examples:');
    console.log(`  ${colors.green}node scripts/rollback-helper.mjs v1.0.0-20260915-143000${colors.reset}`);
    console.log(`  ${colors.green}node scripts/rollback-helper.mjs --version=v1.0.0-20260915-143000${colors.reset}\n`);
    
    // Show last 5 versions
    try {
      const lastVersions = execSync('git tag --list "v*" --sort=-creatordate | head -5', { encoding: 'utf8' });
      console.log(`${colors.cyan}Recent versions available:${colors.reset}`);
      console.log(lastVersions);
    } catch (e) {
      console.log(`No version tags found yet.\n`);
    }
    
    process.exit(1);
  }
  
  console.log(`${colors.yellow}⚠️  WARNING:${colors.reset} This will permanently change your repository state!`);
  console.log(`Target Version: ${targetVersion}\n`);
  
  const confirm = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  await new Promise(resolve => {
    confirm.question(`Are you sure? This action cannot be undone. Type '${targetVersion}' to confirm: `, (answer) => {
      confirm.close();
      resolve(answer.trim() === targetVersion);
    });
  });
  
  if (!verifyTargetExists(targetVersion)) {
    process.exit(1);
  }
  
  const backupDb = findMatchingBackup(targetVersion);
  
  performGitReset(targetVersion);
  
  if (backupDb) {
    await restoreDatabase(backupDb);
  }
  
  await pushToProduction(targetVersion);
  
  verifyRollback(targetVersion);
  
  console.log(`${colors.green}╔════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.green}║   ✅ Rollback Completed Successfully!      ║${colors.reset}`);
  console.log(`${colors.green}╚════════════════════════════════════════════╝${colors.reset}\n`);
  
  console.log(`Dashboard is now running at version: ${targetVersion}\n`);
}

main().catch(error => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});

