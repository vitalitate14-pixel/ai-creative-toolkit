const path = require('node:path');

function externalHttpUrl(value) {
    if (typeof value !== 'string' || /[\u0000-\u001f\u007f]/.test(value)) throw new Error('Invalid external URL');
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error('Only HTTP(S) links are allowed');
    return url.href;
}

function cacheFilePath(cacheDir, key) {
    // Cache keys are identifiers, never filesystem paths (including Windows paths).
    if (typeof key !== 'string' || !key || key.length > 200 || /[\\/\u0000-\u001f\u007f:]/.test(key) || key === '.' || key === '..') {
        throw new Error('Invalid cache key');
    }
    return path.join(cacheDir, `${key}.json`);
}

function appOrigin(isDev) {
    const port = Number(process.env.AI_TOOLKIT_LOCAL_PORT || 51789);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid local app port');
    return isDev ? 'http://localhost:3000' : `http://localhost:${port}`;
}

function trustedAppUrl(value, isDev) {
    try {
        const url = new URL(value);
        return url.origin === appOrigin(isDev);
    } catch { return false; }
}

function trustedIpcSender(event, windows, isDev) {
    const frame = event.senderFrame;
    return !!frame && windows.some(win => win && !win.isDestroyed() && win.webContents === event.sender)
        && frame === event.sender.mainFrame && trustedAppUrl(frame.url, isDev);
}

module.exports = { externalHttpUrl, cacheFilePath, trustedAppUrl, trustedIpcSender, appOrigin };
