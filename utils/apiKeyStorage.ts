import { isRunningInAiStudio } from './aiStudioDetect';

/** AI Studio 不读取桌面版的 Key、密钥池开关或服务类型设置。 */
export function apiKeyStorageKey(key: string, studio = isRunningInAiStudio()): string {
    return studio ? `aistudio_${key}` : key;
}

export function apiKeyPoolDocument(studio = isRunningInAiStudio()): string {
    return studio ? 'aistudio-pool' : 'pool';
}

/** 旧模块的桌面环境变量回退不得进入 AI Studio 的平台认证。 */
export function desktopEnvironmentKey(value: unknown, studio = isRunningInAiStudio()): string {
    return !studio && typeof value === 'string' ? value : '';
}
