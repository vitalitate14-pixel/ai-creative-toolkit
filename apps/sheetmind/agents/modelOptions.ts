/**
 * 共享的 AI 模型选项列表
 * 数据整理的所有 Agent 和独立工具共用此配置。
 */

export const INHERIT_VALUE = '__global__';

export const MODEL_OPTIONS = [
    { value: INHERIT_VALUE, label: '继承全局设置' },
    { value: 'gemini-3.8-flash', label: '🚀 gemini-3.8-flash (GA·最新旗舰)' },
    { value: 'gemini-3.7-flash', label: '⚡ gemini-3.7-flash (GA·高性能)' },
    { value: 'gemini-3.6-flash', label: '⚡ gemini-3.6-flash (GA·均衡)' },
    { value: 'gemini-3.5-flash', label: '⚡ gemini-3.5-flash (GA·经典稳定)' },
    { value: 'gemini-3.5-flash-lite', label: '⚡ gemini-3.5-flash-lite (GA·极速轻量⚡)' },
    { value: 'gemini-3.1-flash-lite', label: '⚡ gemini-3.1-flash-lite (GA·Lite⚡)' },
    { value: 'gemini-2.5-flash', label: '⚡ gemini-2.5-flash (GA)' },
    { value: 'gemini-2.5-flash-lite', label: '⚡ gemini-2.5-flash-lite (GA·最快)' },
    { value: 'gemini-2.5-pro', label: '🧠 gemini-2.5-pro (GA·强推理)' },
    { value: 'gemini-3-flash-preview', label: 'gemini-3-flash-preview (Preview)' },
    { value: 'gemini-3.1-pro-preview', label: 'gemini-3.1-pro-preview (Preview·最新)' },
];

/**
 * 解析有效模型：如果用户选了"继承全局"，则使用 fallback（全局模型或默认值）
 */
export function resolveModel(selectedModel: string | undefined, fallback: string = 'gemini-2.5-flash'): string {
    if (!selectedModel || selectedModel === INHERIT_VALUE) {
        return fallback;
    }
    return selectedModel;
}
