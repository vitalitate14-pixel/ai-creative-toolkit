const cp = require('child_process');
const fs = require('fs');
const path = require('path');

// Safe rmSync fallback for older Node.js versions
function rmSyncSafe(dirPath) {
  if (!fs.existsSync(dirPath)) return;
  
  if (fs.rmSync) {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
      return;
    } catch (e) {
      // Fallback if rmSync fails or behaves unexpectedly
    }
  }
  
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const curPath = path.join(dirPath, file);
      if (fs.lstatSync(curPath).isDirectory()) {
        rmSyncSafe(curPath);
      } else {
        fs.unlinkSync(curPath);
      }
    }
    fs.rmdirSync(dirPath);
  } catch (e) {
    console.warn(`rmSyncSafe fallback warning for ${dirPath}:`, e);
  }
}

// Safe cpSync fallback for older Node.js versions
function cpSyncSafe(src, dest) {
  if (fs.cpSync) {
    try {
      fs.cpSync(src, dest, { recursive: true });
      return;
    } catch (e) {
      // Fallback if cpSync fails or behaves unexpectedly
    }
  }
  
  try {
    const stats = fs.statSync(src);
    if (stats.isDirectory()) {
      if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
      }
      const files = fs.readdirSync(src);
      for (const file of files) {
        cpSyncSafe(path.join(src, file), path.join(dest, file));
      }
    } else {
      fs.copyFileSync(src, dest);
    }
  } catch (e) {
    console.error(`cpSyncSafe failed for ${src} -> ${dest}:`, e);
    throw e;
  }
}

const isLocal = process.platform === 'darwin' || process.platform === 'win32'
  || process.env.LOCAL_DEV === 'true' || ['desktop', 'aistudio'].includes(process.argv[2]);
const isCloud = !isLocal;

if (isCloud) {
  console.log('Detected cloud container environment.');
  try {
    const src = path.resolve(__dirname, 'prebuilt-dist');
    const dest = path.resolve(__dirname, 'dist');
    
    if (fs.existsSync(src)) {
      console.log('Copying prebuilt assets from prebuilt-dist to dist...');
      // Clean destination first
      if (fs.existsSync(dest)) {
        rmSyncSafe(dest);
      }
      cpSyncSafe(src, dest);
      console.log('Successfully restored prebuilt assets. Build bypassed!');
      process.exit(0);
    } else {
      console.error('Error: prebuilt-dist directory not found in zip!');
      process.exit(1);
    }
  } catch (err) {
    console.error('Failed to copy prebuilt assets:', err);
    process.exit(1);
  }
} else {
  try {
    const target = process.argv[2] || (process.env.VITE_AI_STUDIO === 'true' ? 'aistudio' : 'all');
    if (!['desktop', 'aistudio', 'all'].includes(target)) throw new Error('Unknown build target: ' + target);
    // 两个版本单独编译，AI Studio 打包不会再覆盖桌面版 dist。
    for (const edition of target === 'all' ? ['desktop', 'aistudio'] : [target]) {
      const studio = edition === 'aistudio';
      const outDir = studio ? 'prebuilt-dist' : 'dist';
      console.log(`Building ${edition} into ${outDir}...`);
      cp.execFileSync(process.execPath, [path.join(__dirname, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', outDir], {
        cwd: __dirname,
        stdio: 'inherit',
        env: { ...process.env, LOCAL_DEV: 'true', VITE_AI_STUDIO: studio ? 'true' : 'false',
          VITE_GOOGLE_API_PROVIDER: studio ? 'gemini' : (process.env.VITE_GOOGLE_API_PROVIDER || 'gemini'),
          VITE_GEMINI_API_KEY: '', VITE_GOOGLE_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '' },
      });
    }
    process.exit(0);
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}
