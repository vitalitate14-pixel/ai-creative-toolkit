const { createGeminiHandler, createStudioServer } = require('./aistudio-server.cjs');

// AI Studio 认证端点与桌面端点独立。平台 Secret 仅在此 Node 运行时读取。
const studioOptions = options => {
    let sdkFetch;
    return ({
    ...options,
    upstreamFetch: options.upstreamFetch || ((...args) => {
        sdkFetch ||= require('./aistudio-sdk/adapter.cjs').createSdkFetch();
        return sdkFetch(...args);
    }),
    geminiPrefix: '/api/aistudio/gemini',
    vertexPrefix: '/api/aistudio/vertex',
    runtimeName: 'ai-studio',
    trustSameOriginProxy: true,
    });
};

exports.createAiStudioHandler = (options = {}) => createGeminiHandler(studioOptions(options));
exports.createAiStudioServer = (options = {}) => createStudioServer(studioOptions(options));
