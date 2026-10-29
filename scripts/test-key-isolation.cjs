const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const { createRequire } = require('node:module');

const root = path.resolve(__dirname, '..');
const compile = source => ts.transpileModule(source, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;

function loader(window, studio, sdk) {
    const cache = {};
    function load(name) {
        if (name === './aiStudioDetect') return { isRunningInAiStudio: () => studio };
        if (name === '@google/genai') return sdk || require(name);
        if (name.startsWith('./')) {
            if (cache[name]) return cache[name];
            const module = { exports: {} }; cache[name] = module.exports;
            const source = fs.readFileSync(path.join(root, 'utils', name + '.ts'), 'utf8');
            new Function('module', 'exports', 'require', 'window', compile(source))(module, module.exports, load, window);
            return module.exports;
        }
        return require(name);
    }
    return load;
}

function streamFixture(body, { studio = true, status = 200 } = {}) {
    const calls = [];
    const result = { candidates: [{ content: { role: 'model', parts: [{ text: 'complete-result' }] }, finishReason: 'STOP' }] };
    const fetch = async (resource, init) => {
        const url = new URL(resource);
        if (url.pathname.endsWith('/status')) return Response.json({ runtime: 'ai-studio', protocol: 2, configured: true });
        const streaming = url.pathname.endsWith(':streamGenerateContent');
        calls.push(streaming ? 'stream' : 'complete');
        return streaming ? new Response(body, { status, headers: { 'content-type': status === 200 ? 'text/event-stream' : 'application/json' } }) : Response.json(result);
    };
    const window = { location: { origin: 'https://preview.example', href: 'https://preview.example/' }, fetch };
    const sdkPath = path.resolve(path.dirname(require.resolve('@google/genai')), '../web/index.mjs');
    const sdk = { exports: {} };
    new Function('module', 'exports', 'require', 'fetch', 'window', compile(fs.readFileSync(sdkPath, 'utf8')))
        (sdk, sdk.exports, createRequire(sdkPath), fetch, window);
    const transport = loader(window, studio, sdk.exports)('./geminiTransport');
    const options = { apiKey: 'personal-test-key', httpOptions: { baseUrl: 'https://preview.example/api/aistudio/gemini' } };
    return { calls, result, raw: new sdk.exports.GoogleGenAI(options), client: new transport.GoogleGenAI(options) };
}

test('AI Studio recovers the exact incomplete-JSON error before the first output, using one complete request', async () => {
    const message = JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: 'upstream-result' }] } }] });
    for (const body of [message, 'data: ' + message]) {
        const fixture = streamFixture(body);
        await assert.rejects(async () => { for await (const chunk of await fixture.raw.models.generateContentStream({ model: 'gemini-3.1-flash-lite', contents: 'hello' })) {} }, /Incomplete JSON segment at the end/);
        fixture.calls.length = 0;
        let output = '';
        for await (const chunk of await fixture.client.models.generateContentStream({ model: 'gemini-3.1-flash-lite', contents: 'hello' })) output += chunk.text || '';
        assert.equal(output, 'complete-result');
        assert.deepEqual(fixture.calls, ['stream', 'complete']);
    }
});

test('partial stream output is never replayed, authentication errors never trigger fallback, desktop stays unchanged', async () => {
    const prefix = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'prefix' }] } }] });
    const partial = streamFixture('data: ' + prefix + '\n\n' + 'data: {"candidates":');
    const chunks = [];
    await assert.rejects(async () => { for await (const chunk of await partial.client.models.generateContentStream({ model: 'gemini-3.1-flash-lite', contents: 'hello' })) chunks.push(chunk.text); }, /Incomplete JSON segment/);
    assert.deepEqual(chunks, ['prefix']);
    assert.deepEqual(partial.calls, ['stream']);
    const denied = streamFixture('{"error":{"code":403,"message":"denied"}}', { status: 403 });
    await assert.rejects(async () => { for await (const chunk of await denied.client.models.generateContentStream({ model: 'gemini-3.1-flash-lite', contents: 'hello' })) {} }, /denied/);
    assert.deepEqual(denied.calls, ['stream']);
    const desktop = streamFixture('{}', { studio: false });
    await assert.rejects(async () => { for await (const chunk of await desktop.client.models.generateContentStream({ model: 'gemini-3.1-flash-lite', contents: 'hello' })) {} }, /Incomplete JSON segment/);
    assert.deepEqual(desktop.calls, ['stream']);
});

test('manual keys, provider settings and pool documents have separate edition namespaces', () => {
    const load = loader({}, false);
    const { apiKeyStorageKey, apiKeyPoolDocument, desktopEnvironmentKey } = load('./apiKeyStorage');
    for (const key of ['user_api_key', 'use_api_pool', 'api_pool_config', 'google_api_provider', 'vertex_project', 'vertex_location', 'smart_translate_groq_keys', 'groqKeys']) {
        assert.equal(apiKeyStorageKey(key, false), key);
        assert.equal(apiKeyStorageKey(key, true), 'aistudio_' + key);
    }
    assert.equal(apiKeyPoolDocument(false), 'pool');
    assert.equal(apiKeyPoolDocument(true), 'aistudio-pool');
    assert.equal(desktopEnvironmentKey('desktop-env-key', false), 'desktop-env-key');
    assert.equal(desktopEnvironmentKey('desktop-env-key', true), '');
});

test('desktop Vertex preferences cannot change AI Studio platform authentication', () => {
    const window = {
        location: { origin: 'https://preview.example', href: 'https://preview.example/' },
        localStorage: { getItem: key => ({ google_api_provider: 'vertex', vertex_project: 'desktop-project' })[key] ?? null },
        GEMINI_API_KEY: 'native-platform-key',
    };
    const transport = loader(window, true)('./geminiTransport');
    assert.equal(transport.getGoogleApiProvider(), 'gemini');
    assert.equal(transport.getVertexScope(), null);
    const options = transport.getGeminiClientOptions({ apiKey: transport.STUDIO_KEY_PLACEHOLDER });
    assert.equal(options.apiKey, 'AI_STUDIO_SERVER_AUTH');
    assert.equal(options.vertexai, false);
    assert.equal(options.httpOptions.baseUrl, 'https://preview.example/api/aistudio/gemini');
    const personal = transport.getGeminiClientOptions({ apiKey: 'studio-personal-key' });
    assert.equal(personal.apiKey, 'studio-personal-key');
    assert.equal(personal.httpOptions.baseUrl, options.httpOptions.baseUrl);
});

test('Electron stays desktop even when given AI Studio build flags and preview URLs', () => {
    const source = fs.readFileSync(path.join(root, 'utils/aiStudioDetect.ts'), 'utf8')
        .replaceAll('(import.meta as any)', "({ env: { VITE_AI_STUDIO: 'true' } })");
    const module = { exports: {} };
    const window = { electronAPI: {}, location: { hostname: 'aistudio.google.com', href: 'https://aistudio.google.com/' } };
    new Function('module', 'exports', 'window', compile(source))(module, module.exports, window);
    assert.equal(module.exports.isRunningInAiStudio(), false);
});

test('AI Studio distinguishes gateway 403, missing server secrets and old static packages', async () => {
    const window = {
        location: { origin: 'https://preview.example', href: 'https://preview.example/' },
        fetch: async () => new Response('<html>403 Forbidden</html>', { status: 403 }),
    };
    const { ensureAiStudioRuntime } = loader(window, true)('./aiStudioTransport');
    await assert.rejects(ensureAiStudioRuntime('personal-test-key'), /接口被拒绝.*403/);
    window.fetch = async () => Response.json({ runtime: 'ai-studio', protocol: 2, configured: false });
    await assert.rejects(ensureAiStudioRuntime(), /服务端没有 GEMINI_API_KEY/);
    await assert.doesNotReject(ensureAiStudioRuntime('personal-test-key'));
    const old = loader({ ...window, fetch: async () => new Response('<html>old app</html>') }, true)('./aiStudioTransport');
    await assert.rejects(old.ensureAiStudioRuntime('personal-test-key'), /旧包或静态页面/);
});

test('edition builds have distinct output directories and never copy over each other', () => {
    const source = fs.readFileSync(path.join(root, 'build-runner.cjs'), 'utf8');
    for (const [target, directory, flag] of [['desktop', 'dist', 'false'], ['aistudio', 'prebuilt-dist', 'true']]) {
        const calls = [];
        vm.runInNewContext(source, {
            require: name => ({
                child_process: { execFileSync: (...args) => calls.push(args) },
                fs: { cpSync() { throw new Error('Build outputs must not be copied between editions'); } },
                path,
            })[name],
            process: { platform: 'darwin', argv: ['node', 'build-runner.cjs', target], env: {}, exit(code) { assert.equal(code, 0); } },
            __dirname: root, console: { log() {}, error() {} },
        });
        assert.equal(calls.length, 1);
        assert.equal(calls[0][1].at(-1), directory);
        assert.equal(calls[0][2].env.VITE_AI_STUDIO, flag);
        assert.equal(calls[0][2].env.GEMINI_API_KEY, '');
    }
});

test('actual browser SDK uses the AI Studio server for automatic, personal and concurrent translations', async () => {
    const calls = [];
    const platformFetch = async (resource, init) => {
        const url = new URL(resource);
        assert.equal(url.origin, 'https://preview.example');
        if (url.pathname.endsWith('/status')) return Response.json({ runtime: 'ai-studio', protocol: 2, configured: true });
        assert.match(url.pathname, /^\/api\/aistudio\/gemini\//);
        const key = new Headers(init.headers).get('x-goog-api-key');
        const text = JSON.stringify(JSON.parse(init.body).contents).match(/call-\d+/)[0];
        calls.push({ key, text });
        await new Promise(resolve => setTimeout(resolve, Number(text.split('-')[1]) % 2 ? 10 : 0));
        const body = { candidates: [{ content: { role: 'model', parts: [{ text }] }, finishReason: 'STOP' }] };
        return url.pathname.endsWith(':streamGenerateContent')
            ? new Response(`data: ${JSON.stringify(body)}\n\n`, { headers: { 'content-type': 'text/event-stream' } })
            : Response.json(body);
    };
    const window = {
        location: { origin: 'https://preview.example', href: 'https://preview.example/' },
        GEMINI_API_KEY: 'native-platform-key',
    };
    Object.defineProperty(window, 'fetch', { get: () => platformFetch, configurable: false });
    const sdkPath = path.resolve(path.dirname(require.resolve('@google/genai')), '../web/index.mjs');
    const sdk = { exports: {} };
    new Function('module', 'exports', 'require', 'fetch', 'window', compile(fs.readFileSync(sdkPath, 'utf8')))
        (sdk, sdk.exports, createRequire(sdkPath), platformFetch, window);
    const transport = loader(window, true, sdk.exports)('./geminiTransport');
    const native = new transport.GoogleGenAI({ apiKey: transport.STUDIO_KEY_PLACEHOLDER });
    const personal = new transport.GoogleGenAI({ apiKey: 'studio-personal-key' });
    assert.equal((await native.models.generateContent({ model: 'gemini-3.1-flash-lite', contents: 'call-0' })).text, 'call-0');
    let streamed = '';
    for await (const chunk of await personal.models.generateContentStream({ model: 'gemini-3.1-flash-lite', contents: 'call-1' })) streamed += chunk.text || '';
    assert.equal(streamed, 'call-1');
    const expected = Array.from({ length: 12 }, (_, index) => `call-${index + 2}`);
    const results = await Promise.all(expected.map(contents => native.models.generateContent({ model: 'gemini-3.1-flash-lite', contents }).then(r => r.text)));
    assert.deepEqual(results, expected);
    assert.equal(calls[0].key, 'AI_STUDIO_SERVER_AUTH');
    assert.equal(calls[1].key, 'studio-personal-key');
    assert.ok(calls.slice(2).every(call => call.key === 'AI_STUDIO_SERVER_AUTH'));
    assert.equal(window.fetch, platformFetch);
    assert.equal(Object.getOwnPropertyDescriptor(window, 'fetch').set, undefined);
});
