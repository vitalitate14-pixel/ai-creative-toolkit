/** Verified 2026-10-16 against Google's release notes and deprecation table.
 * https://ai.google.dev/gemini-api/docs/changelog
 * https://ai.google.dev/gemini-api/docs/deprecations
 * Only documented replacements are used; active models retain their identity.
 */
const REPLACEMENTS: Record<string, string> = {
    'gemini-3.7-flash': 'gemini-3.8-flash',
    'gemini-3.5-flash': 'gemini-3.6-flash',
    'gemini-3-pro-preview': 'gemini-3.1-pro-preview',
    'gemini-3.1-flash-lite-preview': 'gemini-3.1-flash-lite',
    'gemini-2.5-pro-preview-03-25': 'gemini-3.1-pro-preview',
    'gemini-2.5-pro-preview-05-06': 'gemini-3.1-pro-preview',
    'gemini-2.5-pro-preview-06-05': 'gemini-3.1-pro-preview',
    'gemini-2.5-flash-preview-05-20': 'gemini-3.6-flash',
    'gemini-2.5-flash-preview-09-25': 'gemini-3.6-flash',
    'gemini-2.5-flash-lite-preview-09-2025': 'gemini-3.1-flash-lite',
    'gemini-2.0-flash': 'gemini-3.6-flash',
    'gemini-2.0-flash-001': 'gemini-3.6-flash',
    'gemini-2.0-flash-lite': 'gemini-3.1-flash-lite',
    'gemini-2.0-flash-lite-001': 'gemini-3.1-flash-lite',
    'gemini-3.1-flash-image-preview': 'gemini-nano-banana-2.1',
    'gemini-3-pro-image-preview': 'gemini-3-pro-image',
    'gemini-2.5-flash-image-preview': 'gemini-nano-banana-2.1',
    'gemini-2.0-flash-preview-image-generation': 'gemini-nano-banana-2.1',
};

export function normalizeGeminiModel(model: string): string {
    const prefix = model.startsWith('models/') ? 'models/' : '';
    const id = prefix ? model.slice(prefix.length) : model;
    return prefix + (REPLACEMENTS[id] || id);
}

export function normalizeGeminiParams<T extends { model?: string; config?: any }>(params: T): T {
    if (!params?.model) return params;
    const model = normalizeGeminiModel(params.model);
    const version = model.match(/(?:^|\/)gemini-(\d+)(?:\.(\d+))?/);
    if (params.config && version && (+version[1] >= 4 || (+version[1] === 3 && +(version[2] || 0) >= 6))) {
        const config = { ...params.config };
        delete config.temperature;
        delete config.topP;
        delete config.topK;
        return { ...params, model, config };
    }
    return model === params.model ? params : { ...params, model };
}
