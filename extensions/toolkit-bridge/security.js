// Shared by the isolated content script and extension service worker.
globalThis.ToolkitBridgeSecurity = (() => {
  const origins = new Set([
    'http://localhost:3000', 'http://localhost:5173', 'http://localhost:51789',
    'https://ai-toolkit-b2b78.web.app', 'https://ai-toolkit-b2b78.firebaseapp.com'
  ]);
  const trustedUrl = value => {
    try { return origins.has(new URL(value).origin); } catch { return false; }
  };
  const validMessage = message => !!message && message.action === 'fillPrompt'
    && ['flow', 'image-fx'].includes(message.platform)
    && typeof message.prompt === 'string' && message.prompt.length > 0 && message.prompt.length <= 100000
    && (message.autoGenerate === undefined || typeof message.autoGenerate === 'boolean');
  return { trustedUrl, validMessage };
})();
