const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const os = require('node:os');

const rootDir = path.resolve(__dirname, '..');
// Build locally first; AI Studio receives only the compiled app and Node runtime.
cp.execFileSync('npm', ['run', 'build'], {
  cwd: rootDir, stdio: 'inherit',
  env: { ...process.env, VITE_AI_STUDIO: 'true', VITE_GOOGLE_API_PROVIDER: 'gemini',
    VITE_GEMINI_API_KEY: '', VITE_GOOGLE_API_KEY: '', GEMINI_API_KEY: '', GOOGLE_API_KEY: '' },
});
const prebuiltDir = path.join(rootDir, 'prebuilt-dist');
const index = fs.readFileSync(path.join(prebuiltDir, 'index.html'), 'utf8');
for (const match of index.matchAll(/(?:src|href)=["']\.\/?([^"'#?]+)["']/g)) {
  if (!match[1].startsWith('http') && !fs.existsSync(path.resolve(prebuiltDir, match[1]))) {
    throw new Error('Missing prebuilt asset: ' + match[1]);
  }
}
const original = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-toolkit-prebuilt-'));
try {
  const pkg = {
    name: original.name, version: original.version, private: true, type: 'module',
    engines: { node: '>=20' },
    scripts: { dev: 'node dev-runner.cjs', start: 'node dev-runner.cjs',
      build: 'node build-runner.cjs', preview: 'node dev-runner.cjs' },
    dependencies: {}, devDependencies: {},
  };
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2));
  fs.writeFileSync(path.join(stage, 'package-lock.json'), JSON.stringify({
    name: pkg.name, version: pkg.version, lockfileVersion: 3, requires: true,
    packages: { '': { name: pkg.name, version: pkg.version, engines: pkg.engines } },
  }, null, 2));
  fs.copyFileSync(path.join(rootDir, 'runtime/aistudio-server.cjs'), path.join(stage, 'dev-runner.cjs'));
  // Even if the platform runs npm run build, no compiler or downloads are needed.
  fs.writeFileSync(path.join(stage, 'build-runner.cjs'), `const fs = require('node:fs');
const path = require('node:path');
const src = path.join(__dirname, 'prebuilt-dist');
if (!fs.existsSync(path.join(src, 'index.html'))) throw new Error('Missing prebuilt-dist/index.html');
fs.cpSync(src, path.join(__dirname, 'dist'), { recursive: true });
console.log('Prebuilt assets ready; compilation is not required.');
`);
  fs.cpSync(prebuiltDir, path.join(stage, 'prebuilt-dist'), { recursive: true });
  fs.writeFileSync(path.join(stage, 'README.md'), `# AI Studio 免构建运行包 v${pkg.version}

导入整个 ZIP，保留 prebuilt-dist 文件夹。
启动命令：npm run dev（或 npm start）。
平台若要求构建命令：npm run build；它只复制预构建文件，不编译、不安装前端依赖。
Node.js 20 或更新版本；监听平台 PORT，默认 3000。

使用你已验证成功的付费 Key：在软件设置选择对应的 Vertex AI 或 Gemini Developer API，再保存 Key。
包内不包含你的 Key。AI Studio 自动密钥调用仍需平台实际配置，尚未验证成功。
这是免构建运行包，修改前端源码请使用单独的完整源码包并在本地重新构建。
`);
  const out = process.env.AISTUDIO_ZIP_OUTPUT
    ? path.resolve(process.env.AISTUDIO_ZIP_OUTPUT)
    : path.join(os.homedir(), 'Desktop', 'ai-toolkit-aistudio-prebuilt-v' + pkg.version + '.zip');
  if (fs.existsSync(out)) fs.unlinkSync(out);
  cp.execFileSync('zip', ['-qr', out, '.'], { cwd: stage, stdio: 'inherit' });
  console.log('AI Studio prebuilt package: ' + out);
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
