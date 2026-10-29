const { contextBridge, ipcRenderer, clipboard, webUtils } = require('electron');

// Preload is attached to a window, not to a trusted origin. Do not expose even
// direct clipboard APIs if a redirect or navigation ever leaves the local app.
const expectedOrigin = process.argv.find(arg => arg.startsWith('--ai-toolkit-origin='))?.slice('--ai-toolkit-origin='.length);
if (expectedOrigin && /^http:\/\/localhost:\d+$/.test(expectedOrigin) && window.location.origin === expectedOrigin) {

// 暴露本地缓存 API 给渲染进程
contextBridge.exposeInMainWorld('electronCache', {
    // 保存数据到本地文件（支持 GB 级别）
    save: (key, data) => ipcRenderer.invoke('cache:save', { key, data }),

    // 读取本地缓存
    load: (key) => ipcRenderer.invoke('cache:load', { key }),

    // 删除缓存
    delete: (key) => ipcRenderer.invoke('cache:delete', { key }),

    // 列出所有缓存
    list: () => ipcRenderer.invoke('cache:list'),

    // 获取缓存统计
    stats: () => ipcRenderer.invoke('cache:stats'),

    // 检测是否在 Electron 环境中
    isElectron: true
});

// 暴露统一的 electronAPI 接口
contextBridge.exposeInMainWorld('electronAPI', {
    // 缓存数据到本地
    cacheData: (key, data) => ipcRenderer.invoke('cache:save', { key, data }),

    // 加载缓存
    loadCache: (key) => ipcRenderer.invoke('cache:load', { key }),

    // 删除缓存
    deleteCache: (key) => ipcRenderer.invoke('cache:delete', { key }),

    // 列出缓存
    listCache: () => ipcRenderer.invoke('cache:list'),

    // 缓存统计
    cacheStats: () => ipcRenderer.invoke('cache:stats'),

    // 🔗 在 Chrome 中打开外部链接
    openExternal: (url) => ipcRenderer.invoke('shell:openExternal', { url }),

    // 📋 剪贴板操作（解决桌面版粘贴问题）
    clipboardReadText: () => clipboard.readText(),
    // 保留 Excel / Google Sheets 的真实表格结构；纯文本会丢失部分复杂单元格的行边界
    clipboardReadHTML: () => clipboard.readHTML(),
    clipboardWriteText: (text) => clipboard.writeText(text),
    clipboardWriteTable: (text, html) => ipcRenderer.invoke('image-prompt-sheet:copy-text', text, html),

    getOriginalFilePath: (file) => webUtils?.getPathForFile ? webUtils.getPathForFile(file) : file?.path || '',
    saveSplitProjectFile: (payload) => ipcRenderer.invoke('split-project:save-file', payload),
    // 图＋词交付表格独立浮窗
    setImagePromptSheetKeepExpanded: (enabled) => ipcRenderer.invoke('image-prompt-sheet:keep-expanded', enabled),
    getImagePromptSheetCollapsed: () => ipcRenderer.invoke('image-prompt-sheet:collapsed-state'),
    expandImagePromptSheet: () => ipcRenderer.invoke('image-prompt-sheet:expand'),
    onImagePromptSheetCollapsed: (callback) => {
        const listener = (_event, collapsed) => callback(collapsed);
        ipcRenderer.on('image-prompt-sheet:collapsed', listener);
        return () => ipcRenderer.removeListener('image-prompt-sheet:collapsed', listener);
    },
    onImagePromptSheetRestore: (callback) => {
        const listener = () => callback();
        ipcRenderer.on('image-prompt-sheet:restore', listener);
        return () => ipcRenderer.removeListener('image-prompt-sheet:restore', listener);
    },
    editImagePromptSheetCell: (edit) => ipcRenderer.invoke('image-prompt-sheet:edit-cell', edit),
    onImagePromptSheetEdit: (callback) => {
        const listener = (_event, edit) => callback(edit);
        ipcRenderer.on('image-prompt-sheet:edit', listener);
        return () => ipcRenderer.removeListener('image-prompt-sheet:edit', listener);
    },
    openImagePromptSheet: () => ipcRenderer.invoke('image-prompt-sheet:open'),
    closeImagePromptSheet: () => ipcRenderer.invoke('image-prompt-sheet:close'),
    setImagePromptSheetOpacity: (opacity) => ipcRenderer.invoke('image-prompt-sheet:set-opacity', opacity),
    publishImagePromptSheetData: (data) => ipcRenderer.invoke('image-prompt-sheet:set-data', data),
    imagePromptSheetReady: () => ipcRenderer.invoke('image-prompt-sheet:ready'),
    copyImagePromptSheetImages: (images) => ipcRenderer.invoke('image-prompt-sheet:copy-images', images),
    copyImagePromptSheetImage: (url, name, originalPath) => ipcRenderer.invoke('image-prompt-sheet:copy-image', url, name, originalPath),
    copyImagePromptSheetText: (text) => ipcRenderer.invoke('image-prompt-sheet:copy-text', text),
    onImagePromptSheetData: (callback) => {
        const listener = (_event, data) => callback(data);
        ipcRenderer.on('image-prompt-sheet:data', listener);
        return () => ipcRenderer.removeListener('image-prompt-sheet:data', listener);
    },
    onImagePromptSheetCopyShortcut: (callback) => {
        const listener = () => callback();
        ipcRenderer.on('image-prompt-sheet:copy-shortcut', listener);
        return () => ipcRenderer.removeListener('image-prompt-sheet:copy-shortcut', listener);
    },

    // 是否在Electron中
    isElectron: true
});

// 暴露平台信息
contextBridge.exposeInMainWorld('electronInfo', {
    platform: process.platform,
    version: process.versions.electron,
    isElectron: true
});
}
