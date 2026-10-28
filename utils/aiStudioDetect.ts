/**
 * AI Studio 环境检测工具
 * 
 * 检测当前是否运行在 AI Studio 模式。
 * 
 * 检测方式（任一满足即为 AI Studio 模式）：
 * 1. 环境变量 VITE_AI_STUDIO=true（打包 AI Studio 源码时在 .env.local 中设置）
 * 2. URL hostname 包含 aistudio.google.com
 * 3. 任何由 Google AI Studio 创建的 Gemini API key（包括新版 Auth Key）
 * 
 * 在 AI Studio 模式下：
 * - 不加 vertexai: true
 * - 生图使用 imageConfig 而非 responseModalities
 */

/**
 * 检测环境变量是否标记为 AI Studio 模式
 */
const isEnvAiStudio = (): boolean => {
    try {
        return (import.meta as any).env?.VITE_AI_STUDIO === 'true';
    } catch {
        return false;
    }
};

const isHostAiStudio = (): boolean => {
    if (typeof window === 'undefined') return false;
    try {
        const hostname = window.location.hostname;
        const href = window.location.href;

        // 1. 检查 Chrome/Webkit 的 ancestorOrigins，看祖先 Origin 里是否包含 aistudio.google.com
        if ((window.location as any).ancestorOrigins && (window.location as any).ancestorOrigins.contains('https://aistudio.google.com')) {
            return true;
        }

        // 2. 检查来源网页（如果是嵌入在 iframe 中）
        if (typeof document !== 'undefined' && document.referrer && document.referrer.includes('aistudio.google.com')) {
            return true;
        }

        // 3. 检查 URL 参数（AI Studio 嵌入的 iframe URL 经常带参数）
        if (href.includes('fullscreenApplet=true') || href.includes('showAssistant=true') || href.includes('aistudio=true')) {
            return true;
        }

        // 4. 检查 href 是否包含相关域名（针对 blob: 或 sandboxed 域）
        if (href.includes('aistudio.google.com') || href.includes('googleusercontent.com') || href.includes('idx.dev') || href.includes('cloudworkstations.dev')) {
            return true;
        }

        // 5. 如果在 iframe 中且不是我们自己的网站域名，判定为 AI Studio 模式（与 index.tsx 里的 appEdition 逻辑对齐）
        const isInIframe = window.self !== window.top;
        if (isInIframe && hostname && !hostname.includes('ai-toolkit') && !hostname.includes('localhost') && !hostname.includes('127.0.0.1')) {
            return true;
        }

        // 6. 检查 Google 的托管域名、沙箱域名以及 IDX/Cloud Workstations 预览域名
        return hostname === 'ai.studio'
            || hostname === 'aistudio.google.com'
            || hostname.endsWith('.aistudio.google.com')
            || hostname.endsWith('.googleusercontent.com')
            || hostname.endsWith('.idx.dev')
            || hostname.includes('.idx.dev')
            || hostname.endsWith('.cloudworkstations.dev')
            || hostname.includes('.cloudworkstations.dev')
            || (hostname.endsWith('.google.com') && (window.location.pathname.includes('/aistudio') || hostname.includes('gateway')));
    } catch {
        return false;
    }
};

export const shouldUseAiStudioMode = (apiKey?: string): boolean => {
    // 1. AI Studio 域名 → Gemini 端点；无前端 Key 时由同源服务端转发认证。
    if (isHostAiStudio()) return true;

    // 2. 在前端和客户端环境下，Vertex AI (aiplatform.googleapis.com) 不支持标准 API 密钥进行 StreamGenerateContent，
    //    总是会触发 "API keys are not supported by this API" 错误。因此，所有客户端 API Key 的调用必须走
    //    Google AI Studio 模式（标准 Gemini 端点：generativelanguage.googleapis.com）。
    if (apiKey && apiKey.trim().length > 0) {
        // 2026-05 起 AI Studio 新建的 Auth Key 可使用 AQ 前缀。
        // 它们仍属于 Gemini API，必须走 generativelanguage.googleapis.com；
        // 不能再按 AQ 前缀误判为 Vertex AI key。
        // 浏览器端如需 Vertex AI，应使用服务账号/OAuth，而不是把 Gemini Auth Key 路由到 Vertex。
        // 只有显式设置环境变量时才允许走 Vertex 端点。
        try {
            if ((import.meta as any).env?.VITE_FORCE_VERTEX_AI === 'true') {
                return false;
            }
        } catch { /* ignore */ }
        return true;
    }

    // 3. 无 key + 环境变量 → AI Studio 构建模式（打包 AI Studio 版本时用）
    if (isEnvAiStudio()) return true;
    return true;
};

/**
 * 是否运行在 AI Studio 环境中（不依赖 key）
 */
export const isRunningInAiStudio = (): boolean => {
    return isEnvAiStudio() || isHostAiStudio();
};
