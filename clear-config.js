#!/usr/bin/env node

/**
 * Clear Interview Coder Configuration Files
 * 
 * This script helps clear old configuration files that might be causing API errors.
 * Run this script if you're experiencing issues with API keys not updating properly.
 * 
 * Usage:
 *   node clear-config.js
 *   npm run clear-config
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('🧹 Interview Coder Config Cleaner');
console.log('=====================================\n');

function getPossibleConfigPaths() {
  const paths = [];
  const platform = os.platform();
  
  // Add platform-specific paths
  if (platform === 'win32') {
    // Windows paths
    const userProfile = process.env.USERPROFILE || process.env.HOMEPATH;
    if (userProfile) {
      paths.push(path.join(userProfile, 'AppData', 'Roaming', 'Electron', 'config.json'));
      paths.push(path.join(userProfile, 'AppData', 'Roaming', 'interview-coder-v1', 'config.json'));
    }
  } else if (platform === 'darwin') {
    // macOS paths
    const homeDir = os.homedir();
    paths.push(path.join(homeDir, 'Library', 'Application Support', 'Electron', 'config.json'));
    paths.push(path.join(homeDir, 'Library', 'Application Support', 'interview-coder-v1', 'config.json'));
  } else {
    // Linux paths
    const homeDir = os.homedir();
    paths.push(path.join(homeDir, '.config', 'Electron', 'config.json'));
    paths.push(path.join(homeDir, '.config', 'interview-coder-v1', 'config.json'));
    paths.push(path.join(homeDir, '.config', 'interview-coder', 'config.json'));
  }
  
  // Add current working directory path
  paths.push(path.join(process.cwd(), 'config.json'));
  
  return paths;
}

function clearConfigFiles() {
  const possiblePaths = getPossibleConfigPaths();
  let clearedCount = 0;
  
  console.log('🔍 Searching for configuration files...\n');
  
  for (const configPath of possiblePaths) {
    try {
      if (fs.existsSync(configPath)) {
        console.log(`📁 Found: ${configPath}`);
        fs.unlinkSync(configPath);
        clearedCount++;
        console.log(`✅ Cleared: ${configPath}\n`);
      }
    } catch (error) {
      console.log(`❌ Error clearing ${configPath}: ${error.message}\n`);
    }
  }
  
  if (clearedCount > 0) {
    console.log(`🎉 Successfully cleared ${clearedCount} configuration file(s)`);
    console.log('💡 Restart the Interview Coder app to use fresh configuration');
  } else {
    console.log('ℹ️  No configuration files found to clear');
  }
}

// Run the cleaner
clearConfigFiles();
