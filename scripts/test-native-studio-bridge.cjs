// Run with the publicly served Google _aistudio-iframe.js as the first argument.
// Verifies that Google's injected shim does not divert the app server route;
// no Google API requests, user credentials, or global fetch mutations are used.
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');

function compile(source) {
    return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
}

async function main() {
    const shim = fs.readFileSync(process.argv[2], 'utf8');
    const marker = shim.match(/window\.GEMINI_API_KEY = '([^']+)'/)[1];
    const start = shim.indexOf('  const nativeFetch = window.fetch;');
    const end = shim.indexOf('  // See details in:', start);
    assert(start > 0 && end > start, 'Google shim fetch section must be recognizable');
    let directFetchCalls = 0;
    let serverReady = false;
    const calls = [];
    const windowContext = {
        location: { origin: 'https://preview.example', href: 'https://preview.example/' },
        GEMINI_API_KEY: marker,
        aistudio: { getHostUrl: async () => 'https://aistudio.google.com/apps/test' },
        fetch: async (resource, init) => {
            directFetchCalls++;
            if (!serverReady) return new Response('<!doctype html><html>outdated static server</html>', { headers: { 'content-type': 'text/html' } });
            assert.equal(new URL(resource).origin, 'https://preview.example');
            assert.match(new URL(resource).pathname, /^\/api\/gemini\//);
            const payload = JSON.parse(init.body);
            const tag = JSON.stringify(payload.contents).match(/call-\d+/)[0];
            calls.push(tag);
            await new Promise(resolve => setTimeout(resolve, Number(tag.split('-')[1]) % 2 ? 20 : 1));
            return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: tag }] }, finishReason: 'STOP' }] });
        },
    };
    class Channel {
        constructor() {
            this.port1 = { postMessage: data => queueMicrotask(() => this.port2.onmessage?.({ data })) };
            this.port2 = { postMessage: data => queueMicrotask(() => this.port1.onmessage?.({ data })) };
        }
    }
    const host = { postMessage() { throw new Error('App calls must not use the private AI Studio RPC proxy'); } };
    const bootstrapChannel = Promise.resolve({ port: host, urlPatterns: [/^https:\/\/generativelanguage\.googleapis\.com\//] });
    new Function('window', 'bootstrapChannel', 'MessageChannel', shim.slice(start, end))(windowContext, bootstrapChannel, Channel);
    assert.equal(Object.getOwnPropertyDescriptor(windowContext, 'fetch').set, undefined);

    const sdkEntry = require.resolve('@google/genai');
    const sdkPath = path.resolve(path.dirname(sdkEntry), '../web/index.mjs');
    const sdk = { exports: {} };
    new Function('module', 'exports', 'require', 'fetch', 'window', compile(fs.readFileSync(sdkPath, 'utf8')))(sdk, sdk.exports, createRequire(sdkPath), windowContext.fetch, windowContext);
    const legacyClient = new sdk.exports.GoogleGenAI({ apiKey: 'AISTUDIO_NATIVE_MODE_PLACEHOLDER', httpOptions: { baseUrl: 'https://preview.example/api/gemini' } });
    await assert.rejects(legacyClient.models.generateContent({ model: 'gemini-3.1-flash-lite', contents: 'legacy route' }), /Unexpected token|not valid JSON/);
    assert.equal(directFetchCalls, 1);
    directFetchCalls = 0;
    console.log('PASS missing backend returns HTML rather than being mistaken for a working Gemini route');
    serverReady = true;
    const models = { exports: {} };
    new Function('module', 'exports', compile(fs.readFileSync(path.join(__dirname, '../utils/geminiModels.ts'), 'utf8')))(models, models.exports);
    const transport = { exports: {} };
    const transportSource = fs.readFileSync(path.join(__dirname, '../utils/geminiTransport.ts'), 'utf8')
        .replace("import { isRunningInAiStudio } from './aiStudioDetect';", 'const isRunningInAiStudio = () => true;');
    const load = name => name === '@google/genai' ? sdk.exports : name === './geminiModels' ? models.exports : require(name);
    new Function('module', 'exports', 'require', 'window', compile(transportSource))(transport, transport.exports, load, windowContext);
    for (let round = 0; round < 3; round++) {
        const expected = [1, 2, 3, 4].map(i => `call-${round * 4 + i}`);
        const results = await Promise.all(expected.map(async tag => {
            const ai = new transport.exports.GoogleGenAI({ apiKey: transport.exports.STUDIO_KEY_PLACEHOLDER });
            return (await ai.models.generateContent({ model: 'gemini-3.1-flash-lite', contents: tag })).text;
        }));
        assert.deepEqual(results, expected);
        console.log(`PASS batch ${round + 1}: requests 1, 2, 3, 4 all matched their own responses`);
    }
    assert.equal(calls.length, 12);
    assert.equal(directFetchCalls, 12);
    console.log('PASS routing regression: 12/12 requests use the app server despite the injected Google shim (local fixture, not a live Google test)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
