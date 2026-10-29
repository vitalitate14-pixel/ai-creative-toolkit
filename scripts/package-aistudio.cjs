const fs = require('node:fs');
const cp = require('node:child_process');
const path = require('node:path');
const os = require('node:os');

const rootDir = path.resolve(__dirname, '..');
const sdkDir = path.join(rootDir, 'runtime/aistudio-sdk');
if (!fs.existsSync(path.join(sdkDir, 'node_modules/@google/genai/package.json'))) {
  cp.execFileSync('npm', ['ci', '--prefix', sdkDir, '--ignore-scripts', '--no-audit', '--no-fund'], { stdio: 'inherit' });
}
const sdkVersion = JSON.parse(fs.readFileSync(path.join(sdkDir, 'node_modules/@google/genai/package.json'), 'utf8')).version;
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
    scripts: { dev: 'node server.cjs', start: 'node server.cjs',
      build: 'node build-runner.cjs', preview: 'node server.cjs' },
    dependencies: {}, devDependencies: {},
  };
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(pkg, null, 2));
  fs.writeFileSync(path.join(stage, 'package-lock.json'), JSON.stringify({
    name: pkg.name, version: pkg.version, lockfileVersion: 3, requires: true,
    packages: { '': { name: pkg.name, version: pkg.version, engines: pkg.engines } },
  }, null, 2));
  fs.mkdirSync(path.join(stage, 'runtime'));
  // SDK 及依赖预先打进 Node 服务，上传后无需 npm 安装或编译。
  require('esbuild').buildSync({
    entryPoints: [path.join(rootDir, 'runtime/ai-studio-server.cjs')],
    outfile: path.join(stage, 'runtime/ai-studio-server.cjs'),
    bundle: true, platform: 'node', format: 'cjs', target: 'node20', logLevel: 'warning',
  });
  fs.writeFileSync(path.join(stage, 'server.cjs'), `const path = require('node:path');
const { createAiStudioServer } = require('./runtime/ai-studio-server.cjs');
const server = createAiStudioServer({ publicDir: path.join(__dirname, 'prebuilt-dist') });
server.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => {
  console.log('AI Studio server ready on port ' + server.address().port);
});
`);
  const metadata = JSON.parse(fs.readFileSync(path.join(rootDir, 'metadata.json'), 'utf8'));
  metadata.majorCapabilities = [...new Set([...(metadata.majorCapabilities || []), 'MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API'])];
  fs.writeFileSync(path.join(stage, 'metadata.json'), JSON.stringify(metadata, null, 2));
  fs.writeFileSync(path.join(stage, 'build-info.json'), JSON.stringify({
    edition: 'aistudio', version: pkg.version, auth: 'server-sdk', sdk: '@google/genai@' + sdkVersion, protocol: 2,
    entry: 'server.cjs', builtAt: new Date().toISOString(),
  }, null, 2));
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

Key 读取：由 AI Studio 服务端读取 Secrets 中的 GEMINI_API_KEY，不从前端读取或写入真实平台 Key。
官方 SDK：@google/genai ${sdkVersion}，服务端带 User-Agent: aistudio-build；已打包进运行服务，无需安装依赖。
图片、文案、工作流、翻译和向量计算等共用此调用层，各模块业务功能保留。
也可以在软件 API 设置中选择对应服务后填写个人 Key；个人 Key 优先，不使用桌面软件的密钥池。
诊断接口：/api/aistudio/gemini/status，必须返回 runtime: ai-studio、protocol: 2；configured 表示平台是否配置了 Secret。
这是 AI Studio 专用免构建运行包，没有桌面源码或前端依赖。请保留 server.cjs、runtime 和 prebuilt-dist。
平台若没有自动为导入项目启用 Gemini 集成，请在 AI Studio 的 Settings / Secrets 中配置 GEMINI_API_KEY。
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
