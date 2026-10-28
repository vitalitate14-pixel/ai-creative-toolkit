// Google 表格的独立授权，不建立软件账号，也不连接 Firebase。
const TOKEN_KEY = 'google_oauth_access_token';
const EXPIRY_KEY = 'google_oauth_token_expiry';
const MODE_KEY = 'google_login_mode';
const CLIENT_ID_KEY = 'google_sheets_client_id';

export const clearGoogleAccessToken = (): void => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
    localStorage.removeItem(MODE_KEY);
};

export const getGoogleAccessToken = (): string | null => {
    const expiry = Number(localStorage.getItem(EXPIRY_KEY));
    if (!expiry || Date.now() >= expiry) {
        clearGoogleAccessToken();
        return null;
    }
    return localStorage.getItem(TOKEN_KEY);
};

export const isGoogleTokenExpiringSoon = (): boolean => {
    const expiry = Number(localStorage.getItem(EXPIRY_KEY));
    return !getGoogleAccessToken() || expiry - Date.now() < 10 * 60 * 1000;
};

export const hasSheetsWritePermission = (): boolean =>
    localStorage.getItem(MODE_KEY) === 'advanced' && !!getGoogleAccessToken();

let authorizationPending = false;

const authorize = (write: boolean): Promise<void> => {
    if (authorizationPending) return Promise.reject(new Error('Google 表格授权正在进行中'));
    const oauth = (window as any).google?.accounts?.oauth2;
    if (!oauth) return Promise.reject(new Error('Google 授权组件尚未加载，请稍后重试；也可以使用 GAS 协作方式连接表格。'));
    let configuredId = '';
    try {
        configuredId = JSON.parse(localStorage.getItem('sheets_auth_config') || '{}').customOAuthConfig?.clientId || '';
    } catch { /* 使用单独保存的 Client ID */ }
    const clientId = (localStorage.getItem(CLIENT_ID_KEY) || configuredId || localStorage.getItem('drive_organizer_client_id') ||
        window.prompt('连接 Google 表格：请输入你自己的 Google OAuth Client ID。此授权仅用于表格访问，不创建软件账号。') || '').trim();
    if (!clientId) return Promise.reject(new Error('已取消 Google 表格授权'));
    if (!clientId.endsWith('.apps.googleusercontent.com')) return Promise.reject(new Error('请填写有效的 Google OAuth Client ID'));
    localStorage.setItem(CLIENT_ID_KEY, clientId);
    authorizationPending = true;
    return new Promise<void>((resolve, reject) => {
        const fail = (message: string) => {
            authorizationPending = false;
            reject(new Error(message));
        };
        try {
            const client = oauth.initTokenClient({
                client_id: clientId,
                scope: write ? 'https://www.googleapis.com/auth/spreadsheets' : 'https://www.googleapis.com/auth/spreadsheets.readonly',
                include_granted_scopes: true,
                callback: (response: { error?: string; access_token?: string; expires_in?: number | string }) => {
                    if (response.error || !response.access_token) {
                        fail(`Google 表格授权失败：${response.error || '未取得授权令牌'}`);
                        return;
                    }
                    try {
                        localStorage.setItem(TOKEN_KEY, response.access_token);
                        localStorage.setItem(EXPIRY_KEY, String(Date.now() + Math.max(0, Number(response.expires_in || 3600) - 60) * 1000));
                        localStorage.setItem(MODE_KEY, write ? 'advanced' : 'basic');
                        authorizationPending = false;
                        resolve();
                    } catch { fail('无法在本机保存 Google 表格授权，请检查浏览器存储设置'); }
                },
                error_callback: () => fail('Google 授权窗口已关闭或无法打开，请重试'),
            });
            client.requestAccessToken();
        } catch { fail('无法打开 Google 表格授权窗口，请重试'); }
    });
};

export const authorizeGoogleSheetsRead = (): Promise<void> => authorize(false);
export const authorizeGoogleSheetsWrite = (): Promise<void> => authorize(true);

// 仅迁移旧账号 ID 下已有的本机预设，不登录、不读取远端数据。
export const getLegacyLocalUserId = (): string | null => {
    for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (!key?.startsWith('firebase:authUser:')) continue;
        try {
            const user = JSON.parse(localStorage.getItem(key) || '{}');
            if (typeof user.uid === 'string') return user.uid;
        } catch { /* 跳过已损坏的旧记录 */ }
    }
    return null;
};
