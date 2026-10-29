const FORBIDDEN_SDK_CONFIG_KEYS = new Set(['httpOptions', 'abortSignal', '__proto__', 'constructor', 'prototype']);

function sanitizeSdkConfig(obj) {
    const clean = {};
    if (!obj || typeof obj !== 'object') return clean;
    for (const [k, v] of Object.entries(obj)) {
        if (!FORBIDDEN_SDK_CONFIG_KEYS.has(k)) clean[k] = v;
    }
    return clean;
}

/** 全软件的 AI Studio SDK 适配：保留原有多模态/工具/结构化输出请求。 */
function createSdkFetch({ GoogleGenAI, fallbackFetch = fetch } = {}) {
    const Client = GoogleGenAI || require('@google/genai').GoogleGenAI;
    return async (input, init) => {
        const url = new URL(input);
        const match = url.pathname.match(/^\/(v1beta|v1|v1beta1)\/(?:(projects\/[a-zA-Z0-9-]+\/locations\/[a-z0-9-]+)\/)?(?:publishers\/google\/)?models\/([^/:]+):(generateContent|streamGenerateContent|countTokens|embedContent|batchEmbedContents)$/);
        const headers = new Headers(init.headers);
        headers.set('User-Agent', 'aistudio-build');
        // 保留文件等非模型接口的原有能力；实际模型调用全部通过官方 SDK。
        if (!match) return fallbackFetch(input, { ...init, headers });
        const key = headers.get('x-goog-api-key');
        try {
            const payload = JSON.parse(Buffer.from(init.body || '{}').toString());
            const vertexai = url.protocol === 'https:' && (url.hostname === 'aiplatform.googleapis.com' || /^[a-z0-9-]+-aiplatform\.googleapis\.com$/.test(url.hostname));
            const ai = new Client({
                apiKey: key,
                vertexai,
                httpOptions: {
                    // 与参考项目一样，Gemini 地址由官方 SDK/平台环境决定。
                    // 不覆盖 GOOGLE_GEMINI_BASE_URL 等平台注入设置。
                    ...(vertexai ? { baseUrl: url.origin + '/' } : {}),
                    apiVersion: match[1] + (match[2] ? '/' + match[2] : ''),
                    headers: { 'User-Agent': 'aistudio-build' },
                },
            });
            const model = match[3];
            const operation = match[4];
            if (operation === 'embedContent' || operation === 'batchEmbedContents') {
                const requests = Array.isArray(payload.requests) ? payload.requests : null;
                const { content, requests: ignored, model: ignoredModel, ...rawOptions } = payload || {};
                const options = sanitizeSdkConfig(rawOptions);
                const groups = new Map();
                (requests || [{ content, ...options }]).forEach((request, index) => {
                    const { content, model: requestedModel, ...rawConfig } = request || {};
                    if (requestedModel !== undefined && requestedModel !== '' && (typeof requestedModel !== 'string' || !/^(?:models\/)?[a-zA-Z0-9._-]+$/.test(requestedModel))) {
                        throw Object.assign(new Error('Invalid embedding model parameter'), { status: 400 });
                    }
                    const targetModel = requestedModel || model;
                    const config = sanitizeSdkConfig(rawConfig);
                    const groupKey = JSON.stringify([targetModel, config]);
                    if (!groups.has(groupKey)) groups.set(groupKey, { model: targetModel, config, items: [] });
                    groups.get(groupKey).items.push({ content, index });
                });
                const embeddings = [];
                await Promise.all([...groups.values()].map(async group => {
                    const result = await ai.models.embedContent({
                        model: group.model,
                        contents: group.items.map(item => item.content),
                        config: { ...group.config, abortSignal: init.signal },
                    });
                    group.items.forEach((item, index) => { embeddings[item.index] = result.embeddings?.[index]; });
                }));
                return Response.json(requests ? { embeddings } : { embedding: embeddings[0] });
            }
            const source = (payload && typeof payload.generateContentRequest === 'object' && payload.generateContentRequest) || payload || {};
            const { contents, generationConfig, ...rawOptions } = source;
            const params = {
                model,
                contents,
                config: {
                    ...sanitizeSdkConfig(generationConfig),
                    ...sanitizeSdkConfig(rawOptions),
                    abortSignal: init.signal,
                },
            };
            if (operation === 'countTokens') return Response.json(await ai.models.countTokens(params));
            if (operation === 'generateContent') return Response.json(await ai.models.generateContent(params));
            const iterator = (await ai.models.generateContentStream(params))[Symbol.asyncIterator]();
            // 先取得首块，确保初始认证/配额错误仍以原 HTTP 状态返回。
            let first = await iterator.next();
            const encoder = new TextEncoder();
            const body = new ReadableStream({
                async pull(controller) {
                    try {
                        const chunk = first || await iterator.next();
                        first = null;
                        if (chunk.done) controller.close();
                        else controller.enqueue(encoder.encode('data: ' + JSON.stringify(chunk.value) + '\n\n'));
                    } catch (error) { controller.error(error); }
                },
                async cancel() { await iterator.return?.(); },
            });
            return new Response(body, { headers: { 'Content-Type': 'text/event-stream' } });
        } catch (error) {
            const code = Number(error.status || error.code || 502);
            const status = code >= 400 && code <= 599 ? code : 502;
            const message = String(error.message || 'AI Studio SDK request failed');
            return Response.json({ error: { code: status, message: key ? message.split(key).join('[hidden key]') : message } }, { status });
        }
    };
}

module.exports = { createSdkFetch };
