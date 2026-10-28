const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { Readable, Writable } = require('node:stream');
const { createGeminiHandler, createStudioServer } = require('../runtime/aistudio-server.cjs');

// Exercise the actual TypeScript transport without importing browser-only modules.
const source = fs.readFileSync(require('node:path').join(__dirname, '../utils/geminiTransport.ts'), 'utf8')
    .replace("import { isRunningInAiStudio } from './aiStudioDetect';", 'const isRunningInAiStudio = () => nativeMode;');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const modelModule = { exports: {} };
const modelSource = fs.readFileSync(require('node:path').join(__dirname, '../utils/geminiModels.ts'), 'utf8');
new Function('module', 'exports', ts.transpileModule(modelSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText)(modelModule, modelModule.exports);
function loadTransport(windowContext, nativeMode = false) {
    const compiled = { exports: {} };
    const load = name => name === './geminiModels' ? modelModule.exports : require(name);
    new Function('module', 'exports', 'require', 'window', 'nativeMode', code)(compiled, compiled.exports, load, windowContext, nativeMode);
    return compiled.exports;
}
const { createGeminiFetch, STUDIO_KEY_PLACEHOLDER } = loadTransport();
const api = 'https://generativelanguage.googleapis.com/v1beta/models/';

function client(native = true, response = new Response('{}', { headers: { 'content-type': 'application/json' } })) {
    const calls = [];
    return { calls, fetch: createGeminiFetch(async (...args) => { calls.push(args); return response; }, {
        nativeMode: () => native, origin: 'https://preview.example', basePath: '/preview/app/'
    }) };
}

test('all native SDK and REST endpoints use server authentication and preserve payloads', async () => {
    for (const method of ['generateContent', 'streamGenerateContent', 'embedContent', 'countTokens']) {
        const c = client();
        const payload = { contents: [{ role: 'user', parts: [{ inlineData: { data: 'image', mimeType: 'image/png' } }] }], tools: [{ googleSearch: {} }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 1024 } } };
        await c.fetch(api + `gemini-3.1-flash-image:${method}?alt=sse&key=${STUDIO_KEY_PLACEHOLDER}`, {
            method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': STUDIO_KEY_PLACEHOLDER, authorization: 'unused' }, body: JSON.stringify(payload)
        });
        const [url, init] = c.calls[0];
        assert.equal(url.origin, 'https://preview.example');
        assert.equal(url.pathname, `/preview/app/api/gemini/v1beta/models/gemini-3.1-flash-image:${method}`);
        assert.equal(url.search, '?alt=sse');
        assert.equal(init.headers.has('x-goog-api-key'), false);
        assert.equal(init.headers.has('authorization'), false);
        assert.deepEqual(JSON.parse(new TextDecoder().decode(init.body)), payload);
    }
});

test('native REST uses one server route for all keys; website user keys remain direct', async () => {
    const c = client();
    await c.fetch(new Request(api + 'gemini-3-flash-preview:generateContent', { method: 'POST', body: '{}' }));
    assert.equal(c.calls[0][0].host, 'preview.example');
    await c.fetch(api + 'gemini-3-flash-preview:generateContent?key=user-key');
    assert.equal(c.calls[1][0].host, 'preview.example');
    assert.equal(c.calls[1][0].searchParams.has('key'), false);
    assert.equal(c.calls[1][1].headers.get('x-goog-api-key'), 'user-key');
    const website = client(false);
    await website.fetch(api + 'gemini-3-flash-preview:generateContent?key=user-key');
    assert.equal(website.calls[0][0].host, 'generativelanguage.googleapis.com');
    assert.equal(website.calls[0][0].searchParams.get('key'), 'user-key');
});

test('sampling compatibility changes only modern Gemini, preserving image and schema settings', async () => {
    for (const [model, modern] of [['gemini-3.6-flash', true], ['gemini-3.10-flash', true], ['gemini-4-argon', true], ['gemini-3.1-flash-lite', false], ['gemini-2.5-pro', false]]) {
        const c = client(false);
        await c.fetch(api + model + ':generateContent', { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': 'user-key' }, body: JSON.stringify({ generationConfig: { temperature: 0.3, topP: 0.9, topK: 20, imageConfig: { aspectRatio: '16:9' }, responseSchema: { type: 'OBJECT' } } }) });
        const body = c.calls[0][1].body;
        const config = JSON.parse(typeof body === 'string' ? body : new TextDecoder().decode(body)).generationConfig;
        assert.equal(config.temperature, modern ? undefined : 0.3);
        assert.equal(config.topP, modern ? undefined : 0.9);
        assert.equal(config.topK, modern ? undefined : 20);
        assert.deepEqual(config.imageConfig, { aspectRatio: '16:9' });
        assert.deepEqual(config.responseSchema, { type: 'OBJECT' });
    }
});

test('other providers and static resources bypass the transport unchanged', async () => {
    const c = client();
    const init = { method: 'POST', body: 'hello' };
    await c.fetch('https://api.groq.com/openai/v1/chat/completions', init);
    assert.equal(c.calls[0][1], init);
    await c.fetch('/assets/image.png');
    assert.equal(c.calls[1][0], '/assets/image.png');
});

test('streams and error responses remain untouched; old deployments give actionable errors', async () => {
    const response = new Response('data: {"text":"hello"}\n\n', { headers: { 'content-type': 'text/event-stream' } });
    const c = client(true, response);
    assert.equal(await c.fetch(api + 'gemini-3-flash-preview:streamGenerateContent'), response);
    const old = client(true, new Response('<html/>', { headers: { 'content-type': 'text/html' } }));
    await assert.rejects(old.fetch(api + 'gemini-3-flash-preview:generateContent'), /Gemini 返回了 HTML 页面/);
    assert.equal(old.calls.length, 2);
    const outside = client(false);
    await assert.rejects(outside.fetch(api + 'gemini-3-flash-preview:generateContent?key=' + STUDIO_KEY_PLACEHOLDER), /服务端连接未启用/);
    assert.equal(outside.calls.length, 0);
});

async function handle({ url, method = 'POST', headers = {}, body = '{}', key = 'server-secret', upstream } = {}) {
    const req = Readable.from([Buffer.from(body)]);
    Object.assign(req, { url, method, headers: { host: 'preview.example', ...headers } });
    const chunks = [];
    const res = new Writable({ write(chunk, enc, cb) { chunks.push(chunk); cb(); } });
    res.headers = {};
    res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; };
    res.writeHead = (status, values = {}) => { res.status = status; res.headersSent = true; Object.entries(values).forEach(([k, v]) => res.setHeader(k, v)); };
    const calls = [];
    const handled = await createGeminiHandler({ getKey: () => key, upstreamFetch: async (...args) => { calls.push(args); return upstream || new Response('data: {"text":"ok"}\n\n', { headers: { 'content-type': 'text/event-stream' } }); } })(req, res);
    return { handled, res, calls, text: Buffer.concat(chunks).toString() };
}

test('server injects only runtime secret, keeps SSE and strips browser query key', async () => {
    const result = await handle({ url: '/preview/app/api/gemini/v1beta/models/gemini:streamGenerateContent?alt=sse&key=untrusted' });
    assert.equal(result.handled, true);
    assert.equal(result.res.status, 200);
    assert.equal(result.calls[0][0].origin, 'https://generativelanguage.googleapis.com');
    assert.equal(result.calls[0][0].search, '?alt=sse');
    assert.equal(result.calls[0][1].headers['x-goog-api-key'], 'server-secret');
    assert.equal(result.text, 'data: {"text":"ok"}\n\n');
    assert.equal(result.text.includes('server-secret'), false);
});

test('server preserves Google 400 and 429 errors, without retrying', async () => {
    for (const status of [400, 429]) {
        const result = await handle({ url: '/api/gemini/v1beta/models/gemini:generateContent', upstream: new Response('{"error":{"message":"original"}}', { status, headers: { 'content-type': 'application/json' } }) });
        assert.equal(result.res.status, status);
        assert.equal(result.text, '{"error":{"message":"original"}}');
        assert.equal(result.calls.length, 1);
    }
});

test('missing secret, forbidden destinations and cross-origin callers never reach Google', async () => {
    for (const [opts, status] of [
        [{ url: '/api/gemini/v1beta/models/gemini:generateContent', key: '' }, 503],
        [{ url: '/api/gemini/https://evil.example/' }, 400],
        [{ url: '/api/gemini/v1beta/models/gemini:generateContent', headers: { origin: 'https://evil.example' } }, 403],
        [{ url: '/api/gemini/v1beta/models/gemini:generateContent', headers: { 'sec-fetch-site': 'cross-site' } }, 403],
    ]) {
        const result = await handle(opts);
        assert.equal(result.res.status, status);
        assert.equal(result.calls.length, 0);
    }
});

test('status reports configuration without revealing credentials; non-API routes pass through', async () => {
    const result = await handle({ url: '/api/gemini/status', method: 'GET' });
    assert.deepEqual(JSON.parse(result.text), { transport: 'server', configured: true });
    assert.equal(result.calls.length, 0);
    assert.equal((await handle({ url: '/index.html', method: 'GET' })).handled, false);
});

test('real Google SDK uses the same HTTP server for text, SSE, images and embeddings', async () => {
    const calls = [];
    const server = createStudioServer({ getKey: () => 'runtime-test-secret', upstreamFetch: async (url, init) => {
        assert.equal(init.headers['x-goog-api-key'], 'runtime-test-secret');
        assert.equal(url.searchParams.has('key'), false);
        const body = JSON.parse(init.body.toString());
        calls.push({ path: url.pathname, body });
        if (calls.length === 1) return new Response('<!doctype html><html>Temporary gateway page</html>', { headers: { 'content-type': 'text/html' } });
        if (url.pathname.endsWith(':embedContent')) return Response.json({ embedding: { values: [0.1, 0.2] } });
        if (url.pathname.endsWith(':batchEmbedContents')) return Response.json({ embeddings: [{ values: [0.1, 0.2] }] });
        const result = { candidates: [{ content: { role: 'model', parts: url.pathname.includes('image')
            ? [{ inlineData: { data: 'aW1hZ2U=', mimeType: 'image/png' } }]
            : [{ text: 'translated' }] }, finishReason: 'STOP' }] };
        return url.pathname.endsWith(':streamGenerateContent')
            ? new Response(`data: ${JSON.stringify(result)}\n\n`, { headers: { 'content-type': 'text/event-stream' } })
            : Response.json(result);
    } });
    const realFetch = globalThis.fetch;
    try {
        await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
        const origin = `http://127.0.0.1:${server.address().port}`;
        const windowContext = { location: { origin, href: origin + '/' } };
        Object.defineProperty(windowContext, 'fetch', { get: () => realFetch });
        const { GoogleGenAI } = loadTransport(windowContext, true);
        const ai = new GoogleGenAI({ apiKey: STUDIO_KEY_PLACEHOLDER });
        const text = await ai.models.generateContent({ model: 'gemini-3.7-flash', contents: 'Translate hello', config: { temperature: 0.3 } });
        assert.equal(text.text, 'translated');
        assert.equal(calls[0].body.generationConfig.temperature, undefined);
        assert.equal(calls[0].path, '/v1beta/models/gemini-3.8-flash:generateContent');
        let output = '';
        for await (const chunk of await ai.models.generateContentStream({ model: 'gemini-3.8-flash', contents: 'hello' })) output += chunk.text || '';
        assert.equal(output, 'translated');
        const image = await ai.models.generateContent({ model: 'gemini-3.1-flash-image', contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } }, { text: 'edit image' }] }], config: { responseModalities: ['TEXT', 'IMAGE'] } });
        assert.equal(image.candidates[0].content.parts[0].inlineData.mimeType, 'image/png');
        const embedding = await ai.models.embedContent({ model: 'gemini-embedding-001', contents: 'hello' });
        assert.deepEqual(embedding.embeddings[0].values, [0.1, 0.2]);
        const status = await realFetch(origin + '/api/gemini/status').then(r => r.json());
        assert.deepEqual(status, { transport: 'server', configured: true });
        assert.equal(calls.length, 5);
        assert.deepEqual(calls[0].body, calls[1].body);
        assert.equal(globalThis.fetch, realFetch);
        assert.equal(windowContext.fetch, realFetch);
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

test('official model replacements apply without upgrading active models or Groq', () => {
    const { normalizeGeminiModel, normalizeGeminiParams } = modelModule.exports;
    for (const [old, current] of [
        ['gemini-3.7-flash', 'gemini-3.8-flash'],
        ['gemini-3.5-flash', 'gemini-3.6-flash'],
        ['gemini-3-pro-image-preview', 'gemini-3-pro-image'],
        ['gemini-3.1-flash-image-preview', 'gemini-nano-banana-2.1'],
        ['gemini-2.0-flash', 'gemini-3.6-flash'],
        ['gemini-3.1-flash-lite-preview', 'gemini-3.1-flash-lite'],
    ]) {
        assert.equal(normalizeGeminiModel(old), current);
        assert.equal(normalizeGeminiModel('models/' + old), 'models/' + current);
    }
    for (const active of ['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-3.1-flash-image', 'groq:llama-3.3-70b-versatile']) assert.equal(normalizeGeminiModel(active), active);
    const request = { model: 'gemini-3.5-flash', config: { temperature: 0.2, topP: 0.8, topK: 20, maxOutputTokens: 2000 } };
    const normalized = normalizeGeminiParams(request);
    assert.equal(normalized.model, 'gemini-3.6-flash');
    assert.deepEqual(normalized.config, { maxOutputTokens: 2000 });
    assert.equal(request.config.temperature, 0.2);
});

test('REST model migration happens before incompatible sampling is removed', async () => {
    const c = client();
    await c.fetch(api + 'gemini-3.5-flash:generateContent', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }) });
    assert.equal(c.calls[0][0].pathname, '/preview/app/api/gemini/v1beta/models/gemini-3.6-flash:generateContent');
    assert.deepEqual(JSON.parse(c.calls[0][1].body).generationConfig, { responseMimeType: 'application/json' });
});

test('HTML with JSON MIME is converted to a transport error; auth HTML keeps its status', async () => {
    const result = await handle({ url: '/api/gemini/v1beta/models/gemini:generateContent', upstream: new Response('<!doctype html><html>gateway</html>', { headers: { 'content-type': 'application/json' } }) });
    assert.equal(result.res.status, 502);
    assert.equal(JSON.parse(result.text).error.status, 'UNAVAILABLE');
    assert.match(JSON.parse(result.text).error.message, /HTML/);
    const forbidden = await handle({ url: '/api/gemini/v1beta/models/gemini:generateContent', upstream: new Response('<html>sign in</html>', { status: 403, headers: { 'content-type': 'text/html' } }) });
    assert.equal(forbidden.res.status, 403);
    assert.equal(JSON.parse(forbidden.text).error.status, 'PERMISSION_DENIED');
});

test('caller keys are used only for Google and do not silently use the owner secret', async () => {
    const result = await handle({ url: '/api/gemini/v1beta/models/gemini:generateContent', headers: { 'x-goog-api-key': 'caller-key' } });
    assert.equal(result.calls[0][1].headers['x-goog-api-key'], 'caller-key');
    assert.equal(result.text.includes('caller-key'), false);
});

test('HTML retries are bounded and exclude 400, authentication and quota errors', async () => {
    const { runGeminiOperation } = loadTransport();
    const html = new SyntaxError(`Unexpected token '<', "<!doctype "... is not valid JSON`);
    let calls = 0;
    const success = await runGeminiOperation(async () => { if (++calls === 1) throw html; return 'ok'; }, true, async () => {});
    assert.equal(success, 'ok');
    assert.equal(calls, 2);
    calls = 0;
    await assert.rejects(runGeminiOperation(async () => { calls++; throw html; }, true, async () => {}), /Gemini 返回了 HTML 页面/);
    assert.equal(calls, 2);
    for (const status of [400, 401, 403, 404, 429]) {
        calls = 0;
        const error = Object.assign(new Error('Gemini 返回了 HTML 页面'), { status });
        await assert.rejects(runGeminiOperation(async () => { calls++; throw error; }, true, async () => {}), e => e === error);
        assert.equal(calls, 1);
    }
});

test('stream retries before the first chunk, but never repeats partial output', async () => {
    const { runGeminiStream } = loadTransport();
    const html = new SyntaxError(`Unexpected token '<', "<!doctype "... is not valid JSON`);
    let calls = 0;
    const output = [];
    const recovered = runGeminiStream(async () => {
        if (++calls === 1) throw html;
        return (async function* () { yield 'done'; })();
    }, true, async () => {});
    for await (const chunk of recovered) output.push(chunk);
    assert.deepEqual(output, ['done']);
    assert.equal(calls, 2);
    calls = 0;
    const partial = [];
    await assert.rejects(async () => {
        for await (const chunk of runGeminiStream(async () => {
            calls++;
            return (async function* () { yield 'first'; throw html; })();
        }, true, async () => {})) partial.push(chunk);
    }, /Gemini 返回了 HTML 页面/);
    assert.equal(calls, 1);
    assert.deepEqual(partial, ['first']);
});

test('module loads and clients initialize when Window.fetch is getter-only and non-configurable', () => {
    const immutableWindow = { location: { origin: 'https://preview.example', href: 'https://preview.example/preview/app/' } };
    const originalFetch = globalThis.fetch;
    Object.defineProperty(immutableWindow, 'fetch', { get: () => originalFetch, configurable: false });
    const transport = loadTransport(immutableWindow, true);
    const options = transport.getGeminiClientOptions({ apiKey: STUDIO_KEY_PLACEHOLDER });
    assert.equal(options.httpOptions.baseUrl, 'https://preview.example/preview/app/api/gemini');
    assert.doesNotThrow(() => new transport.GoogleGenAI({ apiKey: STUDIO_KEY_PLACEHOLDER }));
    const ownOptions = { apiKey: 'user-key', httpOptions: { timeout: 5000 } };
    const routedOwnOptions = transport.getGeminiClientOptions(ownOptions);
    assert.equal(routedOwnOptions.apiKey, 'user-key');
    assert.equal(routedOwnOptions.httpOptions.timeout, 5000);
    assert.equal(routedOwnOptions.httpOptions.baseUrl, options.httpOptions.baseUrl);
    assert.equal(immutableWindow.fetch, originalFetch);
    assert.equal(globalThis.fetch, originalFetch);
    assert.equal(Object.getOwnPropertyDescriptor(immutableWindow, 'fetch').set, undefined);
});

test('AI Studio iframe presence cannot override the server-secret transport', async () => {
    const nativeWindow = {
        location: { origin: 'https://preview.example', href: 'https://preview.example/' },
        GEMINI_API_KEY: 'GEMINI_API_KEY',
        aistudio: { getHostUrl: async () => 'https://aistudio.google.com/apps/test' },
    };
    Object.defineProperty(nativeWindow, 'fetch', { get: () => globalThis.fetch });
    const transport = loadTransport(nativeWindow, true);
    const options = transport.getGeminiClientOptions({ apiKey: STUDIO_KEY_PLACEHOLDER });
    assert.equal(options.apiKey, STUDIO_KEY_PLACEHOLDER);
    assert.equal(options.httpOptions.baseUrl, 'https://preview.example/api/gemini');
    const calls = [];
    const bridgeFetch = transport.createGeminiFetch(async (url, init) => {
        calls.push({ url, init });
        return new Response('{}');
    }, { nativeMode: () => true, origin: nativeWindow.location.origin, basePath: '/' });
    for (const key of ['', STUDIO_KEY_PLACEHOLDER, 'GEMINI_API_KEY']) {
        await bridgeFetch(api + 'gemini-3.1-flash-lite:generateContent' + (key ? '?key=' + key : ''), { method: 'POST', body: '{}' });
    }
    assert.equal(calls.length, 3);
    for (const call of calls) {
        assert.equal(call.url.origin, nativeWindow.location.origin);
        assert.match(call.url.pathname, /^\/api\/gemini\//);
        assert.equal(call.init.headers.has('x-goog-api-key'), false);
        assert.equal(call.url.searchParams.has('key'), false);
    }
});


test('platform placeholder never overrides a server secret or counts as configured', async () => {
    const url = '/api/gemini/v1beta/models/gemini-3.1-flash-lite:generateContent';
    for (const marker of ['GEMINI_API_KEY', STUDIO_KEY_PLACEHOLDER]) {
        const result = await handle({ url, headers: { 'x-goog-api-key': marker } });
        assert.equal(result.calls[0][1].headers['x-goog-api-key'], 'server-secret');
        const absent = await handle({ url, key: marker, headers: { 'x-goog-api-key': marker } });
        assert.equal(absent.res.status, 503);
        assert.equal(absent.calls.length, 0);
        const status = await handle({ url: '/api/gemini/status', method: 'GET', key: marker });
        assert.equal(JSON.parse(status.text).configured, false);
    }
});

test('Vertex Express SDK uses publisher paths and its own API key, including streaming', async () => {
    const requests = [];
    const server = createStudioServer({ getKey: () => 'gemini-secret-must-not-be-used', upstreamFetch: async (url, init) => {
        requests.push({ url: String(url), key: init.headers['x-goog-api-key'] });
        assert.equal(new URL(url).origin, 'https://aiplatform.googleapis.com');
        assert.equal(init.headers['x-goog-api-key'], 'vertex-test-key');
        const data = { candidates: [{ content: { role: 'model', parts: [{ text: 'vertex-ok' }] } }] };
        return String(url).includes(':streamGenerateContent')
            ? new Response(`data: ${JSON.stringify(data)}\n\n`, { headers: { 'content-type': 'text/event-stream' } })
            : Response.json(data);
    } });
    try {
        await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
        const origin = `http://127.0.0.1:${server.address().port}`;
        const transport = loadTransport({ location: { origin, href: origin + '/' }, localStorage: { getItem: key => (key === 'google_api_provider' ? 'vertex' : null) } }, true);
        const ai = new transport.GoogleGenAI({ apiKey: 'vertex-test-key' });
        assert.equal((await ai.models.generateContent({ model: 'gemini-3.1-flash-lite', contents: 'hello' })).text, 'vertex-ok');
        let text = '';
        for await (const part of await ai.models.generateContentStream({ model: 'gemini-3.1-flash-lite', contents: 'hello' })) text += part.text;
        assert.equal(text, 'vertex-ok');
        assert.equal(requests.length, 2);
        assert(requests.every(r => r.url.includes('/v1/publishers/google/models/gemini-3.1-flash-lite:')));
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

test('selecting Vertex outside AI Studio uses the local proxy on desktop, or Vertex Express directly on the web', async () => {
    const storage = { getItem: key => (key === 'google_api_provider' ? 'vertex' : null) };
    // Desktop app / local dev: same-origin /api/vertex proxy with the caller's key.
    const desktop = loadTransport({ location: { origin: 'http://localhost:51789', href: 'http://localhost:51789/', hostname: 'localhost' }, localStorage: storage });
    const desktopOptions = desktop.getGeminiClientOptions({ apiKey: 'vertex-user-key' });
    assert.equal(desktopOptions.vertexai, true);
    assert.equal(desktopOptions.apiKey, 'vertex-user-key');
    assert.equal(desktopOptions.httpOptions.baseUrl, 'http://localhost:51789/api/vertex');
    assert.equal(desktopOptions.httpOptions.apiVersion, 'v1');
    // Hosted website without a server: SDK talks to Vertex AI Express itself.
    const web = loadTransport({ location: { origin: 'https://ai-toolkit-b2b78.web.app', href: 'https://ai-toolkit-b2b78.web.app/', hostname: 'ai-toolkit-b2b78.web.app' }, localStorage: storage });
    const webOptions = web.getGeminiClientOptions({ apiKey: 'vertex-user-key' });
    assert.equal(webOptions.vertexai, true);
    assert.equal(webOptions.httpOptions.baseUrl, undefined);
    // REST callers on the website are rewritten to the Vertex publisher path.
    const calls = [];
    const restFetch = web.createGeminiFetch(async (...args) => { calls.push(args); return new Response('{}'); },
        { nativeMode: () => false, origin: 'https://ai-toolkit-b2b78.web.app', basePath: '/', provider: 'vertex' });
    await restFetch(api + 'gemini-3.6-flash:generateContent?key=vertex-user-key', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(String(calls[0][0]), 'https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-3.6-flash:generateContent?key=vertex-user-key');
    // Gemini provider on the desktop keeps calling Google directly, unchanged.
    const geminiDesktop = loadTransport({ location: { origin: 'http://localhost:51789', href: 'http://localhost:51789/', hostname: 'localhost' }, localStorage: { getItem: () => 'gemini' } });
    const plain = { apiKey: 'AIza-user' };
    assert.equal(geminiDesktop.getGeminiClientOptions(plain), plain);
});

test('Vertex project scope routes to projects/{p}/locations/{l} on proxy and direct paths, with regional hosts', async () => {
    const values = { google_api_provider: 'vertex', vertex_project: '39590905392', vertex_location: 'global' };
    const storage = { getItem: key => values[key] ?? null };
    const desktop = loadTransport({ location: { origin: 'http://localhost:51789', href: 'http://localhost:51789/', hostname: 'localhost' }, localStorage: storage });
    const options = desktop.getGeminiClientOptions({ apiKey: 'vertex-user-key' });
    assert.equal(options.httpOptions.baseUrl, 'http://localhost:51789/api/vertex');
    assert.equal(options.httpOptions.apiVersion, 'v1/projects/39590905392/locations/global');
    const web = loadTransport({ location: { origin: 'https://ai-toolkit-b2b78.web.app', href: 'https://ai-toolkit-b2b78.web.app/', hostname: 'ai-toolkit-b2b78.web.app' }, localStorage: storage });
    const webOptions = web.getGeminiClientOptions({ apiKey: 'vertex-user-key' });
    assert.equal(webOptions.httpOptions.baseUrl, 'https://aiplatform.googleapis.com');
    assert.equal(webOptions.httpOptions.apiVersion, 'v1/projects/39590905392/locations/global');
    // Regional REST direct call uses the regional host.
    const calls = [];
    const restFetch = web.createGeminiFetch(async (...args) => { calls.push(args); return new Response('{}'); },
        { nativeMode: () => false, origin: 'https://ai-toolkit-b2b78.web.app', basePath: '/', provider: 'vertex', vertexScope: { project: 'my-proj', location: 'us-central1' } });
    await restFetch(api + 'gemini-4-argon:generateContent?key=k', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(String(calls[0][0]), 'https://us-central1-aiplatform.googleapis.com/v1/projects/my-proj/locations/us-central1/publishers/google/models/gemini-4-argon:generateContent?key=k');
    // Server accepts scoped paths and picks the matching host.
    const seen = [];
    const handler = createGeminiHandler({ getKey: () => '', upstreamFetch: async url => { seen.push(String(url)); return new Response('{}', { headers: { 'content-type': 'application/json' } }); } });
    for (const loc of ['global', 'europe-west4']) {
        const req = Readable.from([Buffer.from('{}')]);
        Object.assign(req, { url: `/api/vertex/v1/projects/39590905392/locations/${loc}/publishers/google/models/gemini-4-argon:generateContent`, method: 'POST', headers: { host: 'localhost:51789', 'x-goog-api-key': 'k', 'content-type': 'application/json' } });
        const res = new Writable({ write(_c, _e, cb) { cb(); } });
        res.setHeader = () => {}; res.writeHead = () => res; res.headersSent = false;
        await handler(req, res);
    }
    assert.equal(seen[0], 'https://aiplatform.googleapis.com/v1/projects/39590905392/locations/global/publishers/google/models/gemini-4-argon:generateContent');
    assert.equal(seen[1], 'https://europe-west4-aiplatform.googleapis.com/v1/projects/39590905392/locations/europe-west4/publishers/google/models/gemini-4-argon:generateContent');
});

test('Vertex auto-region 404 retries once on projects/{p}/locations/global and remembers it', async () => {
    const values = { google_api_provider: 'vertex' };
    const storage = { getItem: key => values[key] ?? null, setItem: (key, value) => { values[key] = String(value); } };
    const transport = loadTransport({ location: { origin: 'https://ai-toolkit-b2b78.web.app', href: 'https://ai-toolkit-b2b78.web.app/', hostname: 'ai-toolkit-b2b78.web.app' }, localStorage: storage });
    const urls = [];
    const realFetch = globalThis.fetch;
    const ok = { candidates: [{ content: { role: 'model', parts: [{ text: 'global-ok' }] } }] };
    globalThis.fetch = async (input) => {
        const url = String(input instanceof Request ? input.url : input);
        urls.push(url);
        if (!url.includes('/projects/')) {
            return Response.json({ error: { code: 404, status: 'NOT_FOUND', message: 'Publisher model `projects/39590905392/locations/europe-west1/publishers/google/models/gemini-3.8-flash` was not found or your project does not have access to it.' } }, { status: 404 });
        }
        return url.includes(':streamGenerateContent')
            ? new Response(`data: ${JSON.stringify(ok)}\n\n`, { headers: { 'content-type': 'text/event-stream' } })
            : Response.json(ok);
    };
    try {
        const ai = new transport.GoogleGenAI({ apiKey: 'AQ.vertex-key' });
        assert.equal((await ai.models.generateContent({ model: 'gemini-3.8-flash', contents: 'hi' })).text, 'global-ok');
        assert.match(urls[1], /^https:\/\/aiplatform\.googleapis\.com\/v1\/projects\/39590905392\/locations\/global\/publishers\/google\/models\/gemini-3\.8-flash:generateContent/);
        assert.equal(values.vertex_project, '39590905392');
        assert.equal(values.vertex_location, 'global');
        // Streaming retry before the first chunk, on a fresh unscoped setup.
        delete values.vertex_project; delete values.vertex_location; urls.length = 0;
        const streamAi = new transport.GoogleGenAI({ apiKey: 'AQ.vertex-key' });
        let text = '';
        for await (const part of await streamAi.models.generateContentStream({ model: 'gemini-3.8-flash', contents: 'hi' })) text += part.text;
        assert.equal(text, 'global-ok');
        assert.equal(values.vertex_project, '39590905392');
    } finally {
        globalThis.fetch = realFetch;
    }
});
