import type { GoogleGenAIOptions } from '@google/genai';

export const AI_STUDIO_PLATFORM_KEY = 'AI_STUDIO_SERVER_AUTH';

export function isAiStudioPlatformKey(key?: string): boolean {
    return !key || key === AI_STUDIO_PLATFORM_KEY || key === 'GEMINI_API_KEY' || key === 'AISTUDIO_NATIVE_MODE_PLACEHOLDER';
}

/** 前端只传“使用平台认证”的标记，实际 Secret 只在 AI Studio Node 服务端读取。 */
export function resolveAiStudioKey(key?: string): string {
    if (!isAiStudioPlatformKey(key)) return key!;
    return AI_STUDIO_PLATFORM_KEY;
}

export function aiStudioApiBase(provider: 'gemini' | 'vertex'): string {
    const basePath = new URL('.', window.location.href).pathname;
    return new URL(`${basePath}api/aistudio/${provider}`, window.location.origin).href;
}

interface StudioStatus { runtime: string; protocol: number; configured: boolean }
const checks = new Map<string, Promise<StudioStatus>>();

/** 先验证运行包与后端配套，HTML 403、静态页面和缺少 Secret 不再混为 Key 无效。 */
export async function ensureAiStudioRuntime(key?: string, provider: 'gemini' | 'vertex' = 'gemini'): Promise<void> {
    const automatic = isAiStudioPlatformKey(key);
    const base = aiStudioApiBase(automatic ? 'gemini' : provider);
    if (!checks.has(base)) {
        checks.set(base, (async () => {
            const response = await window.fetch(`${base}/status`, { credentials: 'same-origin', cache: 'no-store' });
            if (!response.ok) throw Object.assign(new Error(`AI Studio 应用认证接口被拒绝（HTTP ${response.status}）。请确认运行的是本包的 Node 服务；更换 API Key 无法修复这个接口错误。`), { status: response.status });
            const status = await response.json().catch(() => null);
            if (status?.runtime !== 'ai-studio' || status.protocol !== 2) {
                throw new Error('AI Studio 当前运行的是旧包或静态页面，未启动配套的 Node 认证服务。启动命令应为 npm run dev。');
            }
            return status as StudioStatus;
        })());
    }
    try {
        const status = await checks.get(base)!;
        if (automatic && !status.configured) {
            throw new Error('AI Studio 服务端没有 GEMINI_API_KEY。请在该应用的 Secrets 中启用 Gemini API 集成，或在软件 API 设置中填写个人 Key。');
        }
    } catch (error) {
        checks.delete(base);
        throw error;
    }
}

/** AI Studio 专用端点；桌面版的 Key、环境和 /api/vertex 不参与。 */
export function getAiStudioClientOptions(
    options: GoogleGenAIOptions,
    provider: 'gemini' | 'vertex',
    scope?: { project: string; location: string } | null,
): GoogleGenAIOptions {
    const vertex = !isAiStudioPlatformKey(options.apiKey) && provider === 'vertex';
    return {
        ...options,
        apiKey: resolveAiStudioKey(options.apiKey),
        vertexai: vertex,
        httpOptions: {
            ...options.httpOptions,
            apiVersion: vertex ? (scope ? `v1/projects/${scope.project}/locations/${scope.location}` : 'v1') : 'v1beta',
            baseUrl: aiStudioApiBase(vertex ? 'vertex' : 'gemini'),
        },
    };
}
