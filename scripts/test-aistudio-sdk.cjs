const test = require('node:test');
const assert = require('node:assert/strict');
const { createSdkFetch } = require('../runtime/aistudio-sdk/adapter.cjs');

function fixture(overrides = {}) {
    const calls = [];
    class Client {
        constructor(options) {
            this.models = {};
            for (const method of ['generateContent', 'generateContentStream', 'countTokens', 'embedContent']) {
                this.models[method] = async params => {
                    calls.push({ method, options, params });
                    if (overrides[method]) return overrides[method](params);
                    if (method === 'embedContent') return { embeddings: params.contents.map((_, index) => ({ values: [index, params.config.outputDimensionality] })) };
                    if (method === 'countTokens') return { totalTokens: 12 };
                    return { candidates: [{ content: { parts: [{ text: 'ok' }, { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } }] } }] };
                };
            }
        }
    }
    const run = createSdkFetch({ GoogleGenAI: Client, fallbackFetch: () => { throw new Error('Unexpected fallback'); } });
    const request = (method, payload) => run('https://generativelanguage.googleapis.com/v1beta/models/model:' + method, {
        method: 'POST', headers: { 'x-goog-api-key': 'fake-user-key' }, body: Buffer.from(JSON.stringify(payload)), signal: new AbortController().signal,
    });
    return { calls, request };
}

test('all feature payloads preserve text/images, tool calls, schemas and generation settings through the SDK', async () => {
    const { calls, request } = fixture();
    const payload = {
        contents: [{ role: 'user', parts: [{ text: 'describe or edit' }, { inlineData: { mimeType: 'image/png', data: 'aW1hZ2U=' } }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'], responseMimeType: 'application/json', responseSchema: { type: 'OBJECT' }, thinkingConfig: { thinkingBudget: 512 } },
        systemInstruction: { parts: [{ text: 'custom workflow instructions' }] },
        tools: [{ googleSearch: {} }], toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
    };
    const response = await request('generateContent', payload);
    const call = calls[0];
    assert.equal(call.options.apiKey, 'fake-user-key');
    assert.equal(call.options.httpOptions.headers['User-Agent'], 'aistudio-build');
    assert.equal(call.options.httpOptions.baseUrl, undefined);
    assert.deepEqual(call.params.contents, payload.contents);
    for (const [key, value] of Object.entries(payload.generationConfig)) assert.deepEqual(call.params.config[key], value);
    for (const key of ['systemInstruction', 'tools', 'toolConfig']) assert.deepEqual(call.params.config[key], payload[key]);
    assert.equal((await response.json()).candidates[0].content.parts[1].inlineData.data, 'aW1hZ2U=');
});

test('embedding batches preserve dimensions, per-request options and result order', async () => {
    const { calls, request } = fixture();
    const response = await request('batchEmbedContents', { requests: [
        { content: { parts: [{ text: 'a' }] }, outputDimensionality: 768, taskType: 'SEMANTIC_SIMILARITY' },
        { content: { parts: [{ text: 'b' }] }, outputDimensionality: 512, taskType: 'RETRIEVAL_DOCUMENT' },
    ] });
    assert.equal(calls.length, 2);
    assert.deepEqual((await response.json()).embeddings.map(e => e.values[1]), [768, 512]);
    assert.equal(calls[1].params.config.taskType, 'RETRIEVAL_DOCUMENT');
});

test('streaming emits all multimodal chunks and preserves initial authentication errors', async () => {
    const { request } = fixture({ generateContentStream: () => (async function* () { yield { text: 'first' }; yield { inlineData: { data: 'image' } }; })() });
    const response = await request('streamGenerateContent', { contents: 'stream' });
    const body = await response.text();
    assert.match(body, /first/); assert.match(body, /image/);
    const denied = fixture({ generateContentStream: () => (async function* () { throw Object.assign(new Error('denied fake-user-key'), { status: 403 }); })() });
    const failure = await denied.request('streamGenerateContent', { contents: 'test' });
    assert.equal(failure.status, 403);
    assert.doesNotMatch(await failure.text(), /fake-user-key/);
});

test('token counting retains content and system instructions', async () => {
    const { calls, request } = fixture();
    assert.equal((await (await request('countTokens', { contents: 'hello', systemInstruction: 'system' })).json()).totalTokens, 12);
    assert.equal(calls[0].params.config.systemInstruction, 'system');
});
