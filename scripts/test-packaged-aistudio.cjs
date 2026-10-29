// 解压交付 ZIP，直接运行包内 server.cjs；上游用模拟响应，不访问 Google。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { GoogleGenAI } = require('@google/genai');
const ts = require('typescript');

function loadStudioClient(origin) {
    const window = { location: { origin, href: origin + '/' }, fetch: globalThis.fetch.bind(globalThis) };
    const cache = {};
    const load = name => {
        if (name === './aiStudioDetect') return { isRunningInAiStudio: () => true };
        if (!name.startsWith('./')) return require(name);
        if (cache[name]) return cache[name];
        const module = { exports: {} }; cache[name] = module.exports;
        const source = fs.readFileSync(path.join(__dirname, '../utils', name + '.ts'), 'utf8');
        const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
        new Function('module', 'exports', 'require', 'window', js)(module, module.exports, load, window);
        return module.exports;
    };
    return load('./geminiTransport').GoogleGenAI;
}

async function main() {
    const zip = process.argv[2];
    assert.ok(zip && fs.existsSync(zip), 'Pass the delivered ZIP path');
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-delivery-test-'));
    execFileSync('unzip', ['-q', zip, '-d', directory]);
    const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json')));
    assert.equal(pkg.scripts.start, 'node server.cjs');
    assert.deepEqual(pkg.dependencies, {});
    assert.equal(fs.existsSync(path.join(directory, 'electron')), false);
    const info = JSON.parse(fs.readFileSync(path.join(directory, 'build-info.json')));
    assert.equal(info.edition, 'aistudio');
    assert.equal(info.protocol, 2);
    assert.equal(info.sdk, '@google/genai@2.4.0');
    const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'metadata.json')));
    assert.ok(metadata.majorCapabilities?.includes('MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API'));
    const mock = path.join(directory, 'mock-upstream.cjs');
    fs.writeFileSync(mock, `globalThis.fetch = async (input, init) => {
        const url = new URL(input);
        if (!['https://generativelanguage.googleapis.com', 'https://platform-gateway.example', 'https://aiplatform.googleapis.com'].includes(url.origin)) throw new Error('Unexpected outbound destination');
        if (!url.hostname.endsWith('aiplatform.googleapis.com') && process.env.GOOGLE_GEMINI_BASE_URL && url.origin !== process.env.GOOGLE_GEMINI_BASE_URL) throw new Error('SDK platform endpoint override was lost');
        const headers = new Headers(init.headers);
        if (!String(headers.get('user-agent')).includes('aistudio-build')) throw new Error('Missing AI Studio SDK user agent');
        const key = headers.get('x-goog-api-key');
        const text = key === 'fake-platform-secret' ? 'automatic-ok' : key === 'fake-personal-key' ? 'personal-ok' : 'WRONG_KEY';
        const payload = JSON.parse(init.body);
        if (url.pathname.endsWith(':countTokens')) return Response.json({ totalTokens: 7 });
        if (url.pathname.endsWith(':batchEmbedContents')) return Response.json({ embeddings: payload.requests.map(() => ({ values: [0.1, 0.2] })) });
        const generatedText = payload.generationConfig?.responseMimeType === 'application/json' ? JSON.stringify({ result: text }) : text;
        const parts = [{ text: generatedText }];
        if (payload.generationConfig?.responseModalities?.includes('IMAGE')) {
            if (!JSON.stringify(payload.contents).includes('aW1hZ2U=')) throw new Error('Input image was lost');
            parts.push({ inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } });
        }
        const body = { candidates: [{ content: { role: 'model', parts }, finishReason: 'STOP' }] };
        if (url.pathname.endsWith(':streamGenerateContent') && JSON.stringify(payload.contents).includes('simulate-stream-json')) return Response.json(body);
        return url.pathname.endsWith(':streamGenerateContent')
            ? new Response('data: ' + JSON.stringify(body) + '\\n\\n', { headers: { 'content-type': 'text/event-stream' } })
            : Response.json(body);
    };`);
    async function start(secret) {
        const child = spawn(process.execPath, ['--require', mock, 'server.cjs'], {
            cwd: directory, env: { ...process.env, NODE_OPTIONS: '', PORT: '0', GEMINI_API_KEY: secret, GOOGLE_API_KEY: '', VERTEX_API_KEY: '',
                GOOGLE_GEMINI_BASE_URL: secret ? 'https://platform-gateway.example' : '', GOOGLE_VERTEX_BASE_URL: '' },
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        const origin = await new Promise((resolve, reject) => {
            let output = '';
            const timeout = setTimeout(() => { child.kill(); reject(new Error('Packaged server did not start')); }, 10000);
            child.stdout.on('data', data => {
                output += data.toString();
                const match = output.match(/ready on port (\d+)/);
                if (match) { clearTimeout(timeout); resolve('http://127.0.0.1:' + match[1]); }
            });
            child.once('error', error => { clearTimeout(timeout); reject(error); });
            child.once('exit', code => { clearTimeout(timeout); if (!output.match(/ready on port/)) reject(new Error('Packaged server exited: ' + code)); });
        });
        return { origin, close: () => new Promise(resolve => { child.once('exit', resolve); child.kill(); }) };
    }
    try {
        for (const secret of ['fake-platform-secret', '']) {
            const server = await start(secret);
            try {
                const status = await fetch(server.origin + '/api/aistudio/gemini/status').then(r => r.json());
                assert.equal(status.runtime, 'ai-studio');
                assert.equal(status.protocol, 2);
                assert.equal(status.configured, !!secret);
                assert.ok(!JSON.stringify(status).includes('fake-platform-secret'));
                const html = await fetch(server.origin).then(r => r.text());
                assert.match(html, /<div id="root">/);
                const asset = html.match(/src="([^\"]+\.js)"/)[1];
                assert.equal((await fetch(new URL(asset, server.origin))).status, 200);
                const options = { httpOptions: { baseUrl: server.origin + '/api/aistudio/gemini' } };
                const automatic = new GoogleGenAI({ ...options, apiKey: 'AI_STUDIO_SERVER_AUTH' });
                if (secret) assert.equal((await automatic.models.generateContent({ model: 'gemini-3.1-flash-lite', contents: 'translate' })).text, 'automatic-ok');
                else await assert.rejects(automatic.models.generateContent({ model: 'gemini-3.1-flash-lite', contents: 'translate' }), /GEMINI_API_KEY/);
                const personal = new GoogleGenAI({ ...options, apiKey: 'fake-personal-key' });
                assert.equal((await personal.models.generateContent({ model: 'gemini-3.1-flash-lite', contents: 'translate' })).text, 'personal-ok');
                let text = '';
                for await (const chunk of await personal.models.generateContentStream({ model: 'gemini-3.1-flash-lite', contents: 'translate' })) text += chunk.text || '';
                assert.equal(text, 'personal-ok');
                const StudioClient = loadStudioClient(server.origin);
                const compatible = new StudioClient({ apiKey: 'fake-personal-key' });
                let recovered = '';
                for await (const chunk of await compatible.models.generateContentStream({ model: 'gemini-3.1-flash-lite', contents: 'simulate-stream-json' })) recovered += chunk.text || '';
                assert.equal(recovered, 'personal-ok');
                if (secret) {
                    const compatibleAutomatic = new StudioClient({ apiKey: 'AI_STUDIO_SERVER_AUTH' });
                    let automaticRecovery = '';
                    for await (const chunk of await compatibleAutomatic.models.generateContentStream({ model: 'gemini-3.1-flash-lite', contents: 'simulate-stream-json' })) automaticRecovery += chunk.text || '';
                    assert.equal(automaticRecovery, 'automatic-ok');
                }
                const image = await personal.models.generateContent({ model: 'gemini-2.5-flash-image',
                    contents: [{ role: 'user', parts: [{ text: 'edit' }, { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } }] }],
                    config: { responseModalities: ['TEXT', 'IMAGE'] } });
                assert.equal(image.candidates[0].content.parts[1].inlineData.data, 'aW1hZ2U=');
                const structured = await personal.models.generateContent({ model: 'gemini-3.1-flash-lite', contents: 'workflow',
                    config: { responseMimeType: 'application/json', responseSchema: { type: 'OBJECT', properties: { result: { type: 'STRING' } } } } });
                assert.equal(JSON.parse(structured.text).result, 'personal-ok');
                const embedding = await personal.models.embedContent({ model: 'gemini-embedding-001', contents: ['a', 'b'], config: { outputDimensionality: 2 } });
                assert.deepEqual(embedding.embeddings[1].values, [0.1, 0.2]);
                assert.equal((await personal.models.countTokens({ model: 'gemini-3.1-flash-lite', contents: 'count' })).totalTokens, 7);
                const vertex = new GoogleGenAI({ vertexai: true, apiKey: 'fake-personal-key', httpOptions: { baseUrl: server.origin + '/api/aistudio/vertex' } });
                assert.equal((await vertex.models.generateContent({ model: 'gemini-3.1-flash-lite', contents: 'vertex' })).text, 'personal-ok');
                console.log('PASS delivered ZIP: startup, platform configuration=' + !!secret + ', personal key, streaming, incomplete-stream recovery, input/output images, structured workflow output, embeddings, tokens, Vertex');
            } finally { await server.close(); }
        }
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
