const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Define paths
const rootDir = __dirname;
const frontendDir = path.join(rootDir, 'frontend');
const publicDir = path.join(rootDir, 'public');

console.log('Starting build process...');

try {
  // Step 1: Install frontend dependencies
  console.log('Installing frontend dependencies...');
  execSync('npm install', { cwd: frontendDir, stdio: 'inherit' });

  // Step 2: Build frontend
  console.log('Building frontend...');
  execSync('npm run build', { cwd: frontendDir, stdio: 'inherit' });

  // Step 3: Create public directory if it doesn't exist
  console.log('Creating public directory...');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  // Step 4: Copy frontend build to public directory
  console.log('Copying frontend build to public directory...');
  const distDir = path.join(frontendDir, 'dist');
  
  if (!fs.existsSync(distDir)) {
    throw new Error(`Frontend build directory not found: ${distDir}`);
  }
  
  // List all files in the dist directory
  const distFiles = fs.readdirSync(distDir);
  console.log('Files in dist directory:', distFiles);
  
  // Copy each file/directory from dist to public
  distFiles.forEach(file => {
    const srcPath = path.join(distDir, file);
    const destPath = path.join(publicDir, file);
    
    if (fs.statSync(srcPath).isDirectory()) {
      // If it's a directory, copy recursively
      execSync(`cp -r "${srcPath}" "${destPath}"`, { stdio: 'inherit' });
    } else {
      // If it's a file, copy directly
      fs.copyFileSync(srcPath, destPath);
    }
  });

  console.log('Build completed successfully!');
  process.exit(0);
} catch (error) {
  console.error('Build failed:', error.message);
  process.exit(1);
} 