// Launch only a test build, with a fresh profile, empty API credentials and a
// separate loopback port. Never connects to a user's running desktop session.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const puppeteer = require('../electron/node_modules/puppeteer-core');

async function freePort() {
    const server = http.createServer();
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    await new Promise(resolve => server.close(resolve));
    return port;
}

async function main() {
    const executable = process.argv[2];
    assert.ok(executable && fs.existsSync(executable), 'Pass an existing test app executable');
    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-toolkit-security-profile-'));
    const appPort = await freePort();
    const debugPort = await freePort();
    const log = fs.openSync(path.join(profile, 'electron.log'), 'w');
    const env = { ...process.env, NODE_ENV: 'production', AI_TOOLKIT_LOCAL_PORT: String(appPort), GEMINI_API_KEY: '', GOOGLE_API_KEY: '', VERTEX_API_KEY: '' };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(executable, [`--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, '--remote-debugging-address=127.0.0.1'], { env, stdio: ['ignore', log, log] });
    let browser;
    const results = { profile, checks: [] };
    try {
        const deadline = Date.now() + 30000;
        while (Date.now() < deadline) {
            try { browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${debugPort}` }); break; }
            catch { await new Promise(resolve => setTimeout(resolve, 300)); }
        }
        assert.ok(browser, 'Test Electron failed to expose its local test debugging endpoint');
        let page;
        while (Date.now() < deadline) {
            page = (await browser.pages()).find(page => page.url().startsWith(`http://localhost:${appPort}`));
            if (page) break;
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        assert.ok(page, 'Packaged app failed to load its local server');
        await page.waitForFunction(() => !!window.electronAPI && !!document.querySelector('button'), { timeout: 30000 });
        const version = await page.evaluate(() => window.electronInfo.version);
        assert.match(version, /^45\./);
        results.checks.push(`Electron ${version}: packaged app UI and origin-restricted preload loaded`);
        const cache = await page.evaluate(async () => {
            const bad = await window.electronAPI.cacheData('../outside', {});
            const saved = await window.electronAPI.cacheData('security-smoke', { test: true });
            const loaded = await window.electronAPI.loadCache('security-smoke');
            const removed = await window.electronAPI.deleteCache('security-smoke');
            const external = await window.electronAPI.openExternal('file:///etc/passwd');
            return { bad, saved, loaded, removed, external };
        });
        assert.equal(cache.bad.success, false);
        assert.equal(cache.saved.success, true);
        assert.equal(cache.loaded.data.test, true);
        assert.equal(cache.removed.success, true);
        assert.equal(cache.external.success, false);
        results.checks.push('IPC: cache read/write/delete works; traversal and executable external URLs are rejected');
        const proxy = await fetch(`http://localhost:${appPort}/api/image-proxy?url=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}`);
        assert.notEqual(proxy.status, 200);
        const malformed = await fetch(`http://localhost:${appPort}/%E0%A4`);
        assert.equal(malformed.status, 400);
        results.checks.push('Packaged HTTP server: metadata SSRF and malformed paths rejected');

        const popupPromise = browser.waitForTarget(target => target.url().startsWith('https://accounts.google.com/'), { timeout: 20000 });
        await page.evaluate(() => window.open('https://accounts.google.com/ServiceLogin', '_blank'));
        const authTarget = await popupPromise;
        const authPage = await authTarget.page();
        assert.ok(authPage, 'Google authentication popup must remain supported');
        await authPage.waitForFunction(() => document.readyState !== 'loading', { timeout: 20000 }).catch(() => {});
        assert.equal(await authPage.evaluate(() => typeof window.electronAPI), 'undefined');
        results.checks.push('Google login popup opens without the privileged application bridge (account authorization not performed)');
        await authPage.close();

        // Bundle the same service used by the app, with its actual browser entry
        // and packaged PDF worker, then import it inside Chromium.
        const worker = fs.readdirSync(path.join(__dirname, '../dist/assets')).find(name => /^pdf\.worker\.min-.*\.mjs$/.test(name));
        assert.ok(worker, 'Built PDF worker missing');
        const esbuild = require('esbuild');
        const bundle = await esbuild.build({ entryPoints: [path.join(__dirname, '../apps/ai-mind-map/services/documentService.ts')], bundle: true, write: false, format: 'esm', platform: 'browser', external: ['node:*'], plugins: [{ name: 'worker-url', setup(build) {
            build.onResolve({ filter: /pdf\.worker\.min\.mjs\?url$/ }, () => ({ path: 'worker-url', namespace: 'test-worker' }));
            build.onLoad({ filter: /.*/, namespace: 'test-worker' }, () => ({ contents: `export default ${JSON.stringify(`http://localhost:${appPort}/assets/${worker}`)}`, loader: 'js' }));
        } }] });
        const { jsPDF } = require('jspdf');
        const pdf = new jsPDF();
        pdf.text('Security browser PDF import', 10, 10);
        const moduleUrl = 'data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].contents).toString('base64');
        const parsed = await page.evaluate(async (moduleUrl, base64) => {
            const { documentService } = await import(moduleUrl);
            const bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
            return documentService.parseDocument(new File([bytes], 'security.pdf', { type: 'application/pdf' }));
        }, moduleUrl, Buffer.from(pdf.output('arraybuffer')).toString('base64'));
        assert.equal(parsed.success, true, parsed.error);
        assert.match(parsed.text, /Security browser PDF import/);
        results.checks.push('Actual Chromium: PDF import extracts text using the local packaged worker');
        await page.screenshot({ path: path.join(profile, 'app.png') });
        const auditDir = path.join(__dirname, '../非代码资料/项目资料/security-audit');
        fs.mkdirSync(auditDir, { recursive: true });
        fs.writeFileSync(path.join(auditDir, 'electron-smoke.json'), JSON.stringify(results, null, 2) + '\n');
        console.log(JSON.stringify(results, null, 2));
    } finally {
        if (browser) await browser.disconnect();
        child.kill('SIGTERM');
        fs.closeSync(log);
    }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
