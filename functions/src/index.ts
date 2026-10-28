/** Retired cloud features. Keep deployed URLs inert when this replacement is published. */
import * as functions from 'firebase-functions';
const retired = () => functions.https.onRequest((_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.status(410).json({ error: '云同步、共享 AI 和内置服务账号已移除，请更新应用使用本地保存及个人密钥' });
});
export const getServiceAccountToken = retired();
export const sheetsProxy = retired();
export const sharedPoolStatus = retired();
export const sharedGemini = retired();
export const migrateLegacyCloudData = retired();
