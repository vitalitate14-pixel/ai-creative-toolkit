import { isRunningInAiStudio } from './aiStudioDetect';
import { GoogleGenAI as GeminiSDK, type GoogleGenAIOptions } from '@google/genai';
import { normalizeGeminiModel, normalizeGeminiParams } from './geminiModels';

export const STUDIO_KEY_PLACEHOLDER = 'AISTUDIO_NATIVE_MODE_PLACEHOLDER';
export const STUDIO_BRIDGE_KEY = 'GEMINI_API_KEY';
declare const __GOOGLE_API_PROVIDER__: string;

export function getGoogleApiProvider(): 'gemini' | 'vertex' {
    const saved = typeof window !== 'undefined' ? window.localStorage?.getItem('google_api_provider') : null;
    if (saved === 'vertex' || saved === 'gemini') return saved;
    return typeof __GOOGLE_API_PROVIDER__ !== 'undefined' && __GOOGLE_API_PROVIDER__ === 'vertex' ? 'vertex' : 'gemini';
}

/**
 * Vertex 可选的项目与区域。未填项目时使用 Express 简化路径（区域由 Google 自动分配）；
 * 填写项目后改用 projects/{项目}/locations/{区域} 路径，默认 global（Gemini 4 Argon 等仅在 global/us/eu 提供）。
 */
export function getVertexScope(): { project: string; location: string } | null {
    if (typeof window === 'undefined') return null;
    const project = (window.localStorage?.getItem('vertex_project') || '').trim();
    if (!project || !/^[a-z0-9][a-z0-9-]{0,62}$/i.test(project)) return null;
    const location = (window.localStorage?.getItem('vertex_location') || 'global').trim().toLowerCase();
    return { project, location: /^[a-z0-9-]{1,40}$/.test(location) ? location : 'global' };
}

/** Express 路径 → 可选的项目区域路径，如 /v1/publishers/... → /v1/projects/P/locations/global/publishers/... */
export function vertexScopedPath(pathname: string, scope = getVertexScope()): string {
    return scope ? pathname.replace(/^\/(v1|v1beta1)\/publishers\//, `/$1/projects/${scope.project}/locations/${scope.location}/publishers/`) : pathname;
}

/** SDK 的 apiVersion 段：填写项目后带上 projects/{项目}/locations/{区域}。 */
function vertexApiVersion(scope?: { project: string; location: string } | null): string {
    return scope ? `v1/projects/${scope.project}/locations/${scope.location}` : 'v1';
}

/** global 走 aiplatform.googleapis.com，具体区域走 {区域}-aiplatform.googleapis.com。 */
export function vertexHost(scope = getVertexScope()): string {
    return !scope || scope.location === 'global' ? 'https://aiplatform.googleapis.com' : `https://${scope.location}-aiplatform.googleapis.com`;
}

/** These strings identify platform placeholders, never Google credentials. */
function isStudioPlaceholder(key?: string): boolean {
    return !key || key === STUDIO_KEY_PLACEHOLDER || key === STUDIO_BRIDGE_KEY;
}

function isHtmlResponseError(error: any): boolean {
    const status = Number(error?.status ?? error?.code);
    if ([400, 401, 403, 404, 429].includes(status)) return false;
    return /Gemini 返回了 HTML 页面|GEMINI_HTML_RESPONSE|Unexpected token\s+['"]<['"]|<!doctype[\s\S]*not valid JSON/i.test(String(error?.message || error));
}

function htmlResponseError(): Error {
    return Object.assign(new Error('Gemini 返回了 HTML 页面，连接异常。请稍后仅重试失败项；若持续出现，请检查 AI Studio 服务端路由或登录状态。'), { status: 502, code: 'GEMINI_HTML_RESPONSE' });
}

/** One retry for a gateway HTML response; never retry auth/quota or partial output. */
export async function runGeminiOperation<T>(operation: () => Promise<T>, nativeMode: boolean, wait = () => new Promise(resolve => setTimeout(resolve, 800))): Promise<T> {
    for (let attempt = 0; ; attempt++) {
        try { return await operation(); }
        catch (error) {
            if (!isHtmlResponseError(error)) throw error;
            if (!nativeMode || attempt >= 1) throw htmlResponseError();
            await wait();
        }
    }
}

export async function* runGeminiStream<T>(operation: () => Promise<AsyncIterable<T>>, nativeMode: boolean, wait = () => new Promise(resolve => setTimeout(resolve, 800))): AsyncGenerator<T> {
    for (let attempt = 0; ; attempt++) {
        let receivedContent = false;
        try {
            for await (const chunk of await operation()) {
                receivedContent = true;
                yield chunk;
            }
            return;
        } catch (error) {
            if (!isHtmlResponseError(error)) throw error;
            if (!nativeMode || receivedContent || attempt >= 1) throw htmlResponseError();
            await wait();
        }
    }
}

/** Shared by SDK calls and the REST callers in mind map and other tools. */
export function createGeminiFetch(
    originalFetch: typeof fetch,
    options: { nativeMode: () => boolean; origin: string; basePath: string; provider?: 'gemini' | 'vertex'; vertexScope?: { project: string; location: string } | null }
): typeof fetch {
    return async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input), options.origin);
        if (url.origin !== 'https://generativelanguage.googleapis.com') return originalFetch(input, init);
        url.pathname = url.pathname.replace(/\/models\/([^/:]+)/, (_, model) => `/models/${normalizeGeminiModel(model)}`);

        const request = new Request(input, init);
        const headers = new Headers(request.headers);
        const key = headers.get('x-goog-api-key') || url.searchParams.get('key') || '';
        // All native keys (including pool rotation) must use the same transport.
        // Build apps use the Node runtime secret, including when Google's
        // legacy iframe shim is present. Never switch to its private RPC proxy.
        const useServer = options.nativeMode();
        let body: BodyInit | undefined;
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            body = await request.arrayBuffer();
            // Gemini 3.6+ and 4 no longer support custom sampling parameters.
            const match = url.pathname.match(/\/models\/gemini-(\d+)(?:\.(\d+))?/);
            if (match && (+match[1] >= 4 || (+match[1] === 3 && +(match[2] || 0) >= 6))
                && headers.get('content-type')?.includes('application/json')) {
                try {
                    const payload = JSON.parse(new TextDecoder().decode(body));
                    if (payload.generationConfig) {
                        delete payload.generationConfig.temperature;
                        delete payload.generationConfig.topP;
                        delete payload.generationConfig.topK;
                    }
                    body = JSON.stringify(payload);
                } catch { /* Preserve non-JSON payloads for Google's own validation. */ }
            }
        }

        if (key === 'SERVER_SHARED_POOL') throw new Error('共享 AI 已移除，请填写个人 API Key');

        if (useServer) {
            url.searchParams.delete('key');
            if (!isStudioPlaceholder(key)) headers.set('x-goog-api-key', key);
            else headers.delete('x-goog-api-key');
            headers.delete('authorization');
            const vertex = options.provider === 'vertex';
            const apiPath = vertex ? vertexScopedPath(url.pathname.replace(/^\/v1beta\//, '/v1/').replace('/models/', '/publishers/google/models/'), options.vertexScope ?? null) : url.pathname;
            const target = new URL(`${options.basePath}api/${vertex ? 'vertex' : 'gemini'}${apiPath}${url.search}`, options.origin);
            return runGeminiOperation(async () => {
                const response = await originalFetch(target, {
                    method: request.method, headers, body, signal: request.signal, credentials: 'same-origin'
                });
                if (response.headers.get('content-type')?.includes('text/html')) {
                    await response.body?.cancel();
                    if ([400, 401, 403, 404, 429].includes(response.status)) {
                        throw Object.assign(new Error(`Gemini 连接返回网页，HTTP ${response.status}。请检查 AI Studio 登录与访问权限。`), { status: response.status });
                    }
                    throw htmlResponseError();
                }
                if (response.status === 502 && response.headers.get('content-type')?.includes('application/json')) {
                    const errorBody = await response.clone().json().catch(() => null);
                    if (isHtmlResponseError(errorBody?.error)) throw htmlResponseError();
                }
                return response;
            }, true);
        }
        if (key === STUDIO_KEY_PLACEHOLDER || key === STUDIO_BRIDGE_KEY) {
            throw new Error('AI Studio 服务端连接未启用，请导入新版 AI Studio 包，或在顶部 API 设置中填写可用的 Gemini Key。');
        }
        if (options.provider === 'vertex') {
            // 选择 Vertex 但没有同源服务端：直接请求 Vertex AI Express 端点。
            const vertexUrl = new URL(vertexScopedPath(url.pathname.replace(/^\/v1beta\//, '/v1/').replace('/models/', '/publishers/google/models/'), options.vertexScope ?? null) + url.search, vertexHost(options.vertexScope ?? null));
            return originalFetch(vertexUrl, { method: request.method, headers, body, signal: request.signal });
        }
        return originalFetch(url, { method: request.method, headers, body, signal: request.signal });
    };
}

function browserTransportContext() {
    const provider = getGoogleApiProvider();
    return {
        // AI Studio 总是走同源服务端；选择 Vertex 时，桌面版与本地开发（localhost 上有同源 /api/vertex 代理）也走服务端。
        nativeMode: () => isRunningInAiStudio() || (provider === 'vertex' && hasLocalGoogleApiServer()),
        origin: window.location.origin,
        basePath: new URL('.', window.location.href).pathname,
        provider,
        vertexScope: provider === 'vertex' ? getVertexScope() : null,
    };
}

/** 桌面版本地服务（localhost:51789）与 Vite dev/preview 都提供 /api/gemini、/api/vertex 代理。 */
function hasLocalGoogleApiServer(): boolean {
    try { return ['localhost', '127.0.0.1'].includes(window.location.hostname); } catch { return false; }
}

export function getGeminiClientOptions(
    options: GoogleGenAIOptions,
    context = typeof window !== 'undefined' ? browserTransportContext() : undefined
): GoogleGenAIOptions {
    if (!context?.nativeMode()) {
        // 普通网页版选择 Vertex：浏览器直接使用 Vertex AI Express（API Key 模式）。
        if (context?.provider === 'vertex' && !isStudioPlaceholder(options.apiKey)) {
            const scope = context.vertexScope;
            return { ...options, vertexai: true, httpOptions: { ...options.httpOptions, apiVersion: vertexApiVersion(scope), ...(scope ? { baseUrl: vertexHost(scope) } : {}) } };
        }
        return options;
    }
    return {
        ...options,
        apiKey: isStudioPlaceholder(options.apiKey) ? STUDIO_KEY_PLACEHOLDER : options.apiKey,
        vertexai: context.provider === 'vertex',
        httpOptions: {
            ...options.httpOptions,
            apiVersion: context.provider === 'vertex' ? vertexApiVersion(context.vertexScope) : (options.httpOptions?.apiVersion || 'v1beta'),
            baseUrl: new URL(`${context.basePath}api/${context.provider === 'vertex' ? 'vertex' : 'gemini'}`, context.origin).href,
        },
    };
}

/** Vertex 模型在当前区域不可用时（常见于 Express 自动分配区域），附上可操作的中文提示。 */
function explainVertexModelError(error: any): any {
    const message = String(error?.message || '');
    if (!/Publisher model .*(not found|does not have access)/i.test(message)) return error;
    const region = (message.match(/locations\/([a-z0-9-]+)/) || [])[1] || '';
    const hint = `该模型在 Vertex 区域${region ? ` ${region}` : ''} 不可用。请在 API 设置中填写 Vertex 项目 ID/编号并选择 global 区域，或改用 gemini-3.8-flash / gemini-3.6-flash 等模型。`;
    try { error.message = `${hint}\n${message}`; return error; }
    catch { return Object.assign(new Error(`${hint}\n${message}`), { status: error?.status }); }
}

/**
 * Vertex Express 不带区域时由 Google 自动分配区域（欧洲用户常被分到 europe-west1），
 * 而 Gemini 3.x / 4.x 只在 global、us、eu 提供，于是所有模型都 404。
 * 这里从报错中读取 Key 所属项目号，自动改走 projects/{项目}/locations/global 重试一次；成功后记住该设置。
 */
function vertexRetryScope(error: any): { project: string; location: string } | null {
    if (typeof window === 'undefined' || getGoogleApiProvider() !== 'vertex' || getVertexScope()) return null;
    const message = String(error?.message || '');
    if (!/Publisher model .*(not found|does not have access)/i.test(message)) return null;
    const match = message.match(/projects\/([a-z0-9-]+)\/locations\/([a-z0-9-]+)\//i);
    if (!match || match[2] === 'global') return null;
    return { project: match[1], location: 'global' };
}

function rememberVertexScope(scope: { project: string; location: string }) {
    try {
        window.localStorage.setItem('vertex_project', scope.project);
        window.localStorage.setItem('vertex_location', scope.location);
        console.info(`[Vertex] 已自动切换到 global 区域（项目 ${scope.project}）`);
    } catch { /* storage unavailable: retry still succeeded for this call */ }
}

/** Configure each SDK instance explicitly: AI Studio's window.fetch is read-only. */
export class GoogleGenAI extends GeminiSDK {
    constructor(options: GoogleGenAIOptions) {
        if (options.apiKey === 'SERVER_SHARED_POOL') throw new Error('共享 AI 已移除，请填写个人 API Key');
        super(getGeminiClientOptions(options));
        const scopedModels = (scope: { project: string; location: string }) =>
            new GeminiSDK(getGeminiClientOptions(options, { ...browserTransportContext(), vertexScope: scope })).models;
        for (const method of ['generateContent', 'generateContentStream'] as const) {
            const original = this.models[method].bind(this.models);
            (this.models as any)[method] = async (params: any) => {
                params = normalizeGeminiParams(params);
                const operation = () => original(params);
                if (method === 'generateContentStream') {
                    const native = isRunningInAiStudio();
                    return (async function* () {
                        let received = false;
                        try {
                            for await (const chunk of runGeminiStream(operation as () => Promise<AsyncIterable<any>>, native)) { received = true; yield chunk; }
                        } catch (error) {
                            const scope = received ? null : vertexRetryScope(error);
                            if (!scope) throw explainVertexModelError(error);
                            let retried = false;
                            try {
                                for await (const chunk of await scopedModels(scope).generateContentStream(params)) {
                                    if (!retried) { retried = true; rememberVertexScope(scope); }
                                    yield chunk;
                                }
                            } catch { throw explainVertexModelError(error); }
                        }
                    })();
                }
                try { return await runGeminiOperation(operation, isRunningInAiStudio()); }
                catch (error) {
                    const scope = vertexRetryScope(error);
                    if (!scope) throw explainVertexModelError(error);
                    try {
                        const result = await scopedModels(scope).generateContent(params);
                        rememberVertexScope(scope);
                        return result;
                    } catch { throw explainVertexModelError(error); }
                }
            };
        }
    }
}

/** Explicit REST transport for callers that do not use the SDK. No globals are changed. */
export const geminiFetch: typeof fetch = (input, init) => {
    const originalFetch = globalThis.fetch.bind(globalThis);
    if (typeof window === 'undefined') return originalFetch(input, init);
    return createGeminiFetch(originalFetch, browserTransportContext())(input, init);
}
