const cp = require('child_process');

const isLocal = process.platform === 'darwin' || process.env.LOCAL_DEV === 'true';
const isCloud = !isLocal;

if (isCloud) {
  console.log('Detected cloud container environment. Starting AI Studio server...');
  const { createStudioServer } = require('./runtime/aistudio-server.cjs');
  createStudioServer().listen(Number(process.env.PORT || 3000), '0.0.0.0');
} else {
  console.log('Detected local environment. Starting vite dev server...');
  const child = cp.spawn('npx', ['vite'], {
    stdio: 'inherit',
    shell: true
  });
  child.on('exit', (code) => process.exit(code || 0));
}
