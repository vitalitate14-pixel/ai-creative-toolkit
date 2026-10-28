import { LOCAL_USER_ID } from './localFirestore';
/**
 * API Key Management Service
 * 管理当前登录用户的个人密钥，共享请求只返回服务端路由标记
 */

import { loadUserApiPool, saveUserApiPool } from './userApiPoolService';

export interface ApiKeyRow {
    user: string;
    apiKey: string;
    status: string;
    nickname: string;
}

// 检查用户是否已登录 Firebase
export const getFirebaseUserId = (): string | null => {
    return LOCAL_USER_ID;
};

/** Personal keys are stored only under the authenticated UID. */
export async function fetchUserApiKeys(_userName: string): Promise<ApiKeyRow[]> {
 const user = { uid: LOCAL_USER_ID, email: '本机' };
 const keys = await loadUserApiPool(user.uid);
 return keys.map(k => ({ user: user.email || '', apiKey: k.apiKey, status: k.status || 'active', nickname: k.nickname || '' }));
}

/**
 * 保存API密钥
 * 仅保存到当前登录账号的私有 Firebase 路径
 */
export async function saveApiKeys(_userName: string, apiKeys: Omit<ApiKeyRow, 'user'>[]): Promise<void> {
 const user = { uid: LOCAL_USER_ID, email: '本机' };
 await saveUserApiPool(user.uid, apiKeys.map(k => ({ apiKey: k.apiKey, nickname: k.nickname || '', status: k.status === 'disabled' ? 'disabled' : 'active' })));
}

/**
 * 添加单个API密钥
 */
export async function addApiKey(
    userName: string,
    apiKey: string,
    nickname: string = '',
    status: string = 'active'
): Promise<void> {
    // 先读取现有密钥
    const existingKeys = await fetchUserApiKeys(userName);

    // 检查是否已存在
    if (existingKeys.some(k => k.apiKey === apiKey)) {
        throw new Error('该API密钥已存在');
    }

    // 添加新密钥
    const allKeys = [
        ...existingKeys.map(k => ({ apiKey: k.apiKey, status: k.status, nickname: k.nickname })),
        { apiKey, status, nickname }
    ];

    await saveApiKeys(userName, allKeys);
}

/**
 * 更新API密钥
 */
export async function updateApiKey(
    userName: string,
    oldApiKey: string,
    newData: { apiKey?: string; nickname?: string; status?: string }
): Promise<void> {
    const existingKeys = await fetchUserApiKeys(userName);

    const updatedKeys = existingKeys.map(k => {
        if (k.apiKey === oldApiKey) {
            return {
                apiKey: newData.apiKey || k.apiKey,
                status: newData.status || k.status,
                nickname: newData.nickname !== undefined ? newData.nickname : k.nickname
            };
        }
        return { apiKey: k.apiKey, status: k.status, nickname: k.nickname };
    });

    await saveApiKeys(userName, updatedKeys);
}

/**
 * 删除API密钥
 */
export async function deleteApiKey(userName: string, apiKey: string): Promise<void> {
    const existingKeys = await fetchUserApiKeys(userName);

    const filteredKeys = existingKeys
        .filter(k => k.apiKey !== apiKey)
        .map(k => ({ apiKey: k.apiKey, status: k.status, nickname: k.nickname }));

    if (filteredKeys.length === existingKeys.length) {
        throw new Error('未找到要删除的API密钥');
    }

    // 如果删除后没有密钥了，直接清空 Firebase
    if (filteredKeys.length === 0) {
        const firebaseUserId = getFirebaseUserId();
        if (firebaseUserId) {
            await saveUserApiPool(firebaseUserId, []);
            // console.log('[ApiKeyService] ✅ 已清空所有 API 密钥');
            return;
        }
    }

    await saveApiKeys(userName, filteredKeys);
}
