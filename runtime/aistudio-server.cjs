const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');

const API_PREFIX = '/api/gemini';
const PLACEHOLDERS = new Set(['AISTUDIO_NATIVE_MODE_PLACEHOLDER', 'GEMINI_API_KEY', 'AI_STUDIO_SERVER_AUTH']);
const usableKey = value => {
    const key = String(value || '').trim();
    return PLACEHOLDERS.has(key) ? '' : key;
};
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.gif': 'image/gif', '.webp': 'image/webp' };

function sendError(res, code, message) {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    const status = code >= 500 ? 'UNAVAILABLE' : ({ 401: 'UNAUTHENTICATED', 403: 'PERMISSION_DENIED', 404: 'NOT_FOUND', 429: 'RESOURCE_EXHAUSTED' }[code] || 'INVALID_ARGUMENT');
    res.end(JSON.stringify({ error: { code, message, status } }));
}

/** Forward only to Google; caller-supplied keys override the app owner's secret. */
function createGeminiHandler({ getKey = () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '', upstreamFetch = fetch,
    geminiPrefix = API_PREFIX, vertexPrefix = '/api/vertex', runtimeName, trustSameOriginProxy = false } = {}) {
    return async (req, res) => {
        const incoming = new URL(req.url, 'http://localhost');
        const vertex = incoming.pathname.includes(vertexPrefix + '/');
        const prefix = vertex ? vertexPrefix : geminiPrefix;
        const prefixIndex = incoming.pathname.indexOf(prefix + '/');
        if (prefixIndex < 0) return false;
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Prevent other sites from consuming the app owner's secret via browsers.
        const origin = req.headers.origin;
        let originAllowed = true;
        try {
            if (origin) {
                const parsed = new URL(origin);
                const forwarded = req.headers['x-forwarded-host'];
                const sameOriginProxy = trustSameOriginProxy && req.headers['sec-fetch-site'] === 'same-origin'
                    && typeof forwarded === 'string' && !forwarded.includes(',') && parsed.host === forwarded;
                originAllowed = ['https:', 'http:'].includes(parsed.protocol) && (parsed.host === req.headers.host || sameOriginProxy);
            }
        }
        catch { originAllowed = false; }
        if (req.headers['sec-fetch-site'] === 'cross-site' || !originAllowed) {
            sendError(res, 403, 'Cross-origin Gemini requests are not allowed.');
            return true;
        }
        const apiPath = incoming.pathname.slice(prefixIndex + prefix.length);
        const callerKey = String(req.headers['x-goog-api-key'] || '').trim();
        const key = usableKey(callerKey) || usableKey(vertex ? process.env.VERTEX_API_KEY : getKey());
        if (apiPath === '/status' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ transport: 'server', configured: !!key, ...(runtimeName ? { runtime: runtimeName, protocol: 2 } : {}) }));
            return true;
        }
        if (!['GET', 'POST', 'DELETE'].includes(req.method)
            || !(vertex
                ? /^\/(?:v1|v1beta1)\/(?:projects\/[a-zA-Z0-9-]{1,63}\/locations\/[a-z0-9-]{1,40}\/)?publishers\/google\/models\/[a-zA-Z0-9._-]+:(?:generateContent|streamGenerateContent|countTokens|predict)$/.test(apiPath)
                : /^\/(?:v1beta|v1)\/(?:models|files|operations|interactions)(?:\/|$)/.test(apiPath))) {
            sendError(res, 400, 'Unsupported Gemini API path or method.');
            return true;
        }
        if (!key) {
            sendError(res, 503, vertex ? '请在 API 设置中填写 Vertex AI Express API Key。' : 'AI Studio 服务端尚未获得平台注入的 GEMINI_API_KEY。请检查该应用的 Gemini API 集成与 Secrets 设置。');
            return true;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 180000);
        const onClose = () => { if (!res.writableEnded) controller.abort(); };
        res.on('close', onClose);
        try {
            let body;
            if (req.method === 'POST') {
                const chunks = [];
                let size = 0;
                for await (const chunk of req) {
                    size += chunk.length;
                    if (size > 128 * 1024 * 1024) {
                        sendError(res, 413, 'Gemini request exceeds 128 MB.');
                        return true;
                    }
                    chunks.push(chunk);
                }
                body = Buffer.concat(chunks);
            }
            // Vertex 区域路径：global 用 aiplatform.googleapis.com，其他区域用 {区域}-aiplatform.googleapis.com（区域名已由上方白名单校验）。
            const vertexLocation = vertex ? (apiPath.match(/\/locations\/([a-z0-9-]+)\//) || [])[1] : '';
            const vertexHost = vertexLocation && vertexLocation !== 'global' ? `https://${vertexLocation}-aiplatform.googleapis.com` : 'https://aiplatform.googleapis.com';
            const target = new URL(apiPath, vertex ? vertexHost : 'https://generativelanguage.googleapis.com');
            incoming.searchParams.delete('key');
            target.search = incoming.searchParams.toString();
            const upstream = await upstreamFetch(target, {
                method: req.method,
                headers: { 'Content-Type': req.headers['content-type'] || 'application/json', 'x-goog-api-key': key },
                body, signal: controller.signal, redirect: 'error',
            });
            // Gateways sometimes return HTML (even with HTTP 200). Never pass it to
            // the SDK JSON parser. Peek once, then replay the bytes for JSON/SSE.
            const reader = upstream.body?.getReader();
            const first = reader ? await reader.read() : { done: true, value: undefined };
            const prefix = first.value ? new TextDecoder().decode(first.value.slice(0, 256)).trimStart() : '';
            if (upstream.headers.get('content-type')?.includes('text/html') || /^<(?:!doctype|html|head|body)\b/i.test(prefix)) {
                await reader?.cancel();
                const status = [400, 401, 403, 404, 429].includes(upstream.status) ? upstream.status : 502;
                sendError(res, status, status === 502 ? 'Gemini 返回了 HTML 页面，连接暂时异常。请稍后重试。' : `Gemini 返回了 HTML 页面，HTTP ${status}。请检查登录与访问权限。`);
                return true;
            }
            res.writeHead(upstream.status, {
                'Content-Type': upstream.headers.get('content-type') || 'application/json',
                'Cache-Control': 'no-store',
                'X-Accel-Buffering': 'no',
            });
            // Stream SSE unchanged, including Google error details and image responses.
            if (reader) {
                const replay = new ReadableStream({
                    start(stream) { if (!first.done) stream.enqueue(first.value); },
                    async pull(stream) {
                        if (first.done) { stream.close(); return; }
                        const next = await reader.read();
                        if (next.done) stream.close();
                        else stream.enqueue(next.value);
                    },
                    cancel(reason) { return reader.cancel(reason); },
                });
                await pipeline(Readable.fromWeb(replay), res);
            }
            else res.end();
        } catch (error) {
            if (!res.headersSent) sendError(res, 502, controller.signal.aborted ? 'Gemini 请求超时或已取消。' : 'AI Studio 服务端无法连接 Gemini，请检查网络后重试。');
            else res.destroy();
        } finally {
            clearTimeout(timer);
            res.off('close', onClose);
        }
        return true;
    };
}

function createStudioServer({ publicDir = path.resolve(__dirname, '../prebuilt-dist'), ...options } = {}) {
    const handleGemini = createGeminiHandler(options);
    return http.createServer(async (req, res) => {
        try {
            if (await handleGemini(req, res)) return;
            if (!['GET', 'HEAD'].includes(req.method)) return sendError(res, 405, 'Method not allowed.');
            let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
            const assets = pathname.indexOf('/assets/');
            if (assets >= 0) pathname = pathname.slice(assets);
            let file = path.resolve(publicDir, '.' + pathname);
            if (!file.startsWith(publicDir + path.sep) && file !== publicDir) return sendError(res, 403, 'Forbidden');
            if (!fs.existsSync(file) || !fs.statSync(file).isFile()) file = path.join(publicDir, 'index.html');
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': path.extname(file) === '.html' ? 'no-cache' : 'public, max-age=3600' });
            if (req.method === 'HEAD') res.end();
            else await pipeline(fs.createReadStream(file), res);
        } catch {
            if (!res.headersSent) sendError(res, 500, 'AI Studio server error.');
            else res.destroy();
        }
    });
}

module.exports = { createGeminiHandler, createStudioServer };
if (require.main === module) {
    const publicDir = path.resolve(__dirname, fs.existsSync(path.join(__dirname, 'prebuilt-dist')) ? 'prebuilt-dist' : '../prebuilt-dist');
    createStudioServer({ publicDir }).listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('AI Studio server ready (Gemini credentials remain server-side).'));
}
