/**
 * CasaJoy Dashboard - Version Manager Script
 * 
 * Purpose: Auto-generate version numbers and create Git tags for deployments
 * Usage: node scripts/version-manager.mjs <action>
 * 
 * Actions:
 *   bump-major   → Increment major version (v1.2.0 → v2.0.0)
 *   bump-minor   → Increment minor version (v1.2.0 → v1.3.0)  
 *   bump-patch   → Increment patch version (v1.2.0 → v1.2.1)
 *   show         → Display current version
 *   list         → Show all version tags
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// ANSI color codes for better output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m'
};

/**
 * Get next version number based on action type
 */
function getNextVersion(action) {
  try {
    // Get all version tags, sorted by date (newest first)
    const tagOutput = execSync('git tag --sort=-creatordate', { encoding: 'utf8' });
    const tags = tagOutput.trim().split('\n').filter(t => t.startsWith('v'));
    
    if (tags.length === 0) {
      // First version ever
      return 'v1.0.0';
    }
    
    // Get most recent tag
    const latestTag = tags[0];
    const versionParts = latestTag.match(/v(\d+)\.(\d+)\.(\d+)/);
    
    if (!versionParts) {
      throw new Error(`Invalid version format: ${latestTag}`);
    }
    
    const [major, minor, patch] = versionParts.slice(1).map(Number);
    
    let newMajor = major;
    let newMinor = minor;
    let newPatch = patch;
    
    switch (action) {
      case 'bump-major':
        newMajor++;
        newMinor = 0;
        newPatch = 0;
        break;
      case 'bump-minor':
        newMinor++;
        newPatch = 0;
        break;
      case 'bump-patch':
        newPatch++;
        break;
      default:
        throw new Error(`Unknown action: ${action}. Use: bump-major, bump-minor, or bump-patch`);
    }
    
    // Add timestamp
    const now = new Date();
    const timestamp = now.toISOString()
      .replace(/[:T]/g, '-')
      .replace(/\.\d{3}Z$/, '');
    
    return `v${newMajor}.${newMinor}.${newPatch}-${timestamp}`;
  } catch (error) {
    console.error(`${colors.red}Error:${colors.reset}`, error.message);
    process.exit(1);
  }
}

/**
 * Update changelog with new version information
 */
function updateChangelog(version) {
  try {
    const changelogPath = path.join(process.cwd(), 'CHANGELOG.md');
    const currentChangelog = fs.existsSync(changelogPath) ? 
      fs.readFileSync(changelogPath, 'utf8') : '';
    
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { 
      month: 'long', 
      day: 'numeric',
      year: 'numeric'
    });
    
    // Get commit message for last change
    let recentChange = "Initial release";
    try {
      const logMessage = execSync('git log -1 --format="%s"', { encoding: 'utf8' });
      recentChange = logMessage.trim() || "Recent improvements";
    } catch (e) {
      // Ignore if no commits
    }
    
    const newEntry = `\n## Latest Update - ${version.replace(/^v/, '')} (${dateStr})\n\n### 🎯 Summary of Changes\n**Primary Change:** ${recentChange}\n\n📝 **Technical Details:**\nSee full deployment logs in Cloudflare Dashboard\n\n---
`;
    
    // Insert new entry after initial summary table
    const updatedContent = currentChangelog.replace(
      /## 🔥 Latest Update - v\d+\.\d+\.\d+ \(.*?\)/s,
      newEntry.split('\n---')[0] // Extract everything before horizontal rule
    );
    
    fs.writeFileSync(changelogPath, updatedContent);
    console.log(`${colors.green}✅ Updated CHANGELOG.md:${colors.reset} ${version}\n`);
    
  } catch (error) {
    console.error(`${colors.yellow}⚠️ Could not update changelog:${colors.reset}`, error.message);
    // Continue anyway - changelog update is optional
  }
}

/**
 * Create Git tag with message
 */
function createTag(version) {
  try {
    // Ensure we're on main branch
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    if (currentBranch !== 'main') {
      throw new Error(`Must be on main branch to create version tags. Currently on: ${currentBranch}`);
    }
    
    // Check for uncommitted changes
    const status = execSync('git status --short', { encoding: 'utf8' }).trim();
    if (status) {
      console.log(`${colors.yellow}Warning:${colors.reset} Uncommitted changes detected!`);
      console.log(status);
      console.log(`\n${colors.red}Aborting:${colors.reset} Please commit or stash changes before creating version tag.`);
      process.exit(1);
    }
    
    // Create tag
    execSync(`git tag -a ${version} -m "Release ${version}"`, { stdio: 'inherit' });
    
    console.log(`${colors.green}✓ Tag created:${colors.reset} ${version}\n`);
    
    // Update changelog
    updateChangelog(version);
    
    return version;
  } catch (error) {
    console.error(`${colors.red}Error creating tag:${colors.reset}`, error.message);
    process.exit(1);
  }
}

/**
 * Push tag to remote repository
 */
function pushTag(version) {
  try {
    execSync(`git push origin ${version}`, { stdio: 'inherit' });
    console.log(`${colors.green}✓ Tag pushed to GitHub:${colors.reset} ${version}\n`);
  } catch (error) {
    console.error(`${colors.red}Error pushing tag:${colors.reset}`, error.message);
    console.log(`${colors.yellow}Try running:${colors.reset} git push origin ${version}`);
    process.exit(1);
  }
}

/**
 * Display current version info
 */
function showCurrentInfo() {
  try {
    const currentCommit = execSync('git log --oneline -1', { encoding: 'utf8' }).trim();
    
    // Find tag for current commit
    const allTags = execSync('git tag --contains HEAD', { encoding: 'utf8' }).trim().split('\n');
    const relevantTags = allTags.filter(t => t.startsWith('v')).sort().reverse();
    
    const currentBranch = execSync('git branch --show-current', { encoding: 'utf8' }).trim();
    
    console.log(`${colors.blue}=== CasaJoy Dashboard Status ===${colors.reset}\n`);
    console.log(`Current Branch: ${colors.green}${currentBranch}${colors.reset}`);
    console.log(`Latest Commit: ${currentCommit}\n`);
    
    if (relevantTags.length > 0) {
      console.log(`${colors.green}Version Tags:${colors.reset}`);
      relevantTags.forEach(tag => {
        console.log(`  • ${tag}`);
      });
      
      const newestTag = relevantTags[0];
      console.log(`\n${colors.yellow}Current Production Version:${colors.reset} ${newestTag}\n`);
    } else {
      console.log(`${colors.yellow}No version tags found.${colors.reset} Run: node scripts/version-manager.mjs bump-patch\n`);
    }
  } catch (error) {
    console.error(`${colors.red}Error:${colors.reset}`, error.message);
    process.exit(1);
  }
}

/**
 * List all version tags
 */
function listAllTags() {
  try {
    const tags = execSync('git tag --sort=-creatordate', { encoding: 'utf8' })
      .trim().split('\n')
      .filter(t => t.startsWith('v'))
      .slice(0, 10); // Show last 10
    
    if (tags.length === 0) {
      console.log(`${colors.yellow}No version tags found.${colors.reset}\n`);
      return;
    }
    
    console.log(`${colors.blue}=== All Versions (Newest First) ===${colors.reset}\n`);
    
    tags.forEach((tag, index) => {
      const num = index + 1;
      console.log(`${num}. ${tag}`);
      
      // Show commit hash
      try {
        const commitHash = execSync(`git rev-list -1 ${tag}`, { encoding: 'utf8' }).trim();
        const shortLog = execSync(`git log --oneline ${tag} -1`, { encoding: 'utf8' }).trim();
        console.log(`   📝 ${shortLog}`);
        console.log(`   🔍 ${commitHash}\n`);
      } catch (e) {
        // Ignore if can't get details
      }
    });
    
    console.log(`${colors.green}Total versions: ${tags.length}${colors.reset}\n`);
  } catch (error) {
    console.error(`${colors.red}Error:${colors.reset}`, error.message);
    process.exit(1);
  }
}

// Main execution
const args = process.argv.slice(2);
const action = args[0];

switch (action) {
  case 'show':
    showCurrentInfo();
    break;
  
  case 'list':
    listAllTags();
    break;
  
  case 'bump-major':
  case 'bump-minor':
  case 'bump-patch':
    const newVersion = getNextVersion(action);
    createTag(newVersion);
    
    // Ask if user wants to push
    console.log(`Would you like to push this tag to GitHub? (y/n)`);
    // Note: This is interactive - in practice, run manually after review
    break;
  
  default:
    console.log(`${colors.yellow}Usage:${colors.reset} node scripts/version-manager.mjs <action>\n`);
    console.log('Actions:');
    console.log('  ${colors.green}show${colors.reset}       → Display current version info');
    console.log('  ${colors.green}list${colors.reset}        → Show all version tags');
    console.log('  ${colors.green}bump-patch${colors.reset}  → Increment patch version (v1.2.0 → v1.2.1)');
    console.log('  ${colors.green}bump-minor${colors.reset} → Increment minor version (v1.2.0 → v1.3.0)');
    console.log('  ${colors.green}bump-major${colors.reset} → Increment major version (v1.2.0 → v2.0.0)\n');
    process.exit(1);
}
