const electron = require('electron');
console.log('[DEBUG] electron module:', typeof electron, electron);
console.log('[DEBUG] app:', typeof electron.app, electron.app);

const { app, BrowserWindow, ipcMain, session, shell, Menu, nativeImage, clipboard, dialog } = electron;
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { externalHttpUrl, cacheFilePath, trustedAppUrl, trustedIpcSender, appOrigin } = require('./security.cjs');

// 缓存目录 - 延迟初始化（在 app ready 后）
let userDataPath;
let cachePath;

// 创建应用菜单（macOS 必须有菜单才能使用 Cmd+C/V 等快捷键）
function createMenu() {
    const isMac = process.platform === 'darwin';

    const template = [
        // macOS 应用菜单
        ...(isMac ? [{
            label: app.name,
            submenu: [
                { role: 'about' },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        }] : []),
        // 编辑菜单 - 复制/粘贴等功能
        {
            label: '编辑',
            submenu: [
                { role: 'undo', label: '撤销' },
                { role: 'redo', label: '重做' },
                { type: 'separator' },
                { role: 'cut', label: '剪切' },
                { role: 'copy', label: '复制' },
                { role: 'paste', label: '粘贴' },
                ...(isMac ? [
                    { role: 'pasteAndMatchStyle', label: '粘贴并匹配格式' },
                    { role: 'delete', label: '删除' },
                    { role: 'selectAll', label: '全选' },
                ] : [
                    { role: 'delete', label: '删除' },
                    { type: 'separator' },
                    { role: 'selectAll', label: '全选' }
                ])
            ]
        },
        // 视图菜单
        {
            label: '视图',
            submenu: [
                { role: 'reload', label: '重新加载' },
                { role: 'forceReload', label: '强制重新加载' },
                { role: 'toggleDevTools', label: '开发者工具' },
                { type: 'separator' },
                { role: 'resetZoom', label: '重置缩放' },
                { role: 'zoomIn', label: '放大' },
                { role: 'zoomOut', label: '缩小' },
                { type: 'separator' },
                { role: 'togglefullscreen', label: '全屏' }
            ]
        },
        // 窗口菜单
        {
            label: '窗口',
            submenu: [
                { role: 'minimize', label: '最小化' },
                { role: 'zoom', label: '缩放' },
                ...(isMac ? [
                    { type: 'separator' },
                    { role: 'front', label: '前置所有窗口' },
                    { type: 'separator' },
                    { role: 'window' }
                ] : [
                    { role: 'close', label: '关闭' }
                ])
            ]
        }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
}

// 初始化缓存目录
function initCachePath() {
    userDataPath = app.getPath('userData');
    cachePath = path.join(userDataPath, 'sheetmind-cache');

    // 确保缓存目录存在
    if (!fs.existsSync(cachePath)) {
        fs.mkdirSync(cachePath, { recursive: true });
    }
}

let mainWindow;
let imagePromptSheetWindow;
let imagePromptSheetData = null;
let imagePromptSheetCollapsed = false;
let imagePromptSheetKeepExpanded = false;
let imagePromptSheetExpandedBounds = null;

function setImagePromptSheetCollapsed(collapsed) {
    const win = imagePromptSheetWindow;
    if (!win || win.isDestroyed() || imagePromptSheetCollapsed === collapsed || win.isMinimized() || (collapsed && imagePromptSheetKeepExpanded)) return;
    imagePromptSheetCollapsed = collapsed;
    if (collapsed) {
        imagePromptSheetExpandedBounds = win.getBounds();
        win.setMinimumSize(220, 90);
        win.setBounds({ ...imagePromptSheetExpandedBounds, width: 220, height: 90 });
    } else {
        const position = win.getBounds();
        win.setMinimumSize(360, 460);
        if (imagePromptSheetExpandedBounds) win.setBounds({ ...imagePromptSheetExpandedBounds, x: position.x, y: position.y });
    }
    win.webContents.send('image-prompt-sheet:collapsed', collapsed);
}

function sendImagePromptSheetData() {
    if (imagePromptSheetWindow && !imagePromptSheetWindow.isDestroyed() && imagePromptSheetData) {
        imagePromptSheetWindow.webContents.send('image-prompt-sheet:data', imagePromptSheetData);
    }
}

function openImagePromptSheet() {
    if (imagePromptSheetWindow && !imagePromptSheetWindow.isDestroyed()) {
        imagePromptSheetWindow.show();
        imagePromptSheetWindow.focus();
        sendImagePromptSheetData();
        return { success: true, reused: true };
    }
    const baseUrl = mainWindow?.webContents?.getURL();
    if (!baseUrl) return { success: false, error: '主窗口尚未准备完成' };
    const separator = baseUrl.includes('?') ? '&' : '?';
    imagePromptSheetWindow = new BrowserWindow({
        width: 360,
        height: 780,
        minWidth: 360,
        minHeight: 460,
        // 不设 parent：macOS 的附属窗口会跟随主窗口层级，无法稳定盖住其他应用。
        alwaysOnTop: true,
        backgroundColor: '#0b1527',
        title: '图＋词交付表格（独立窗口）',
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            additionalArguments: [`--ai-toolkit-origin=${appOrigin(process.env.NODE_ENV === 'development')}`],
            partition: 'persist:main'
        }
    });
    imagePromptSheetWindow.webContents.setWindowOpenHandler(({ url }) => {
        openInChromeGlobal(url);
        return { action: 'deny' };
    });
    imagePromptSheetWindow.webContents.on('will-navigate', (event, url) => {
        if (!trustedAppUrl(url, process.env.NODE_ENV === 'development')) {
            event.preventDefault();
            openInChromeGlobal(url);
        }
    });
    // macOS 默认的 normal 置顶层级仍可能被其他应用盖住；floating 才是独立浮窗需要的层级。
    imagePromptSheetWindow.setAlwaysOnTop(true, 'floating');
    imagePromptSheetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    imagePromptSheetWindow.loadURL(`${baseUrl}${separator}imagePromptSheetDetached=1`);
    // Electron 的编辑菜单会优先吃掉 ⌘C / Ctrl+C；把它交还给浮窗的单元格选择逻辑。
    imagePromptSheetWindow.webContents.on('before-input-event', (event, input) => {
        if (input.type === 'keyDown' && (input.meta || input.control) && input.key.toLowerCase() === 'c') {
            event.preventDefault();
            imagePromptSheetWindow?.webContents.send('image-prompt-sheet:copy-shortcut');
        }
    });
    imagePromptSheetCollapsed = false;
    imagePromptSheetExpandedBounds = null;
    imagePromptSheetWindow.on('blur', () => setImagePromptSheetCollapsed(true));
    imagePromptSheetWindow.on('focus', () => setImagePromptSheetCollapsed(false));
    imagePromptSheetWindow.webContents.once('did-finish-load', () => {
        sendImagePromptSheetData();
        imagePromptSheetWindow?.webContents.send('image-prompt-sheet:collapsed', imagePromptSheetCollapsed);
    });
    imagePromptSheetWindow.on('closed', () => { imagePromptSheetWindow = null; });
    return { success: true, reused: false };
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 800,
        minHeight: 600,
        show: true, // 立即显示窗口
        backgroundColor: '#1a1a2e', // 深色背景，加载时不刺眼
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            additionalArguments: [`--ai-toolkit-origin=${appOrigin(process.env.NODE_ENV === 'development')}`],
            // 持久化 session，保持登录状态
            partition: 'persist:main'
        },
        // 使用默认标题栏，确保窗口可拖动
        title: 'AI 创作工具包 - 桌面版',
        icon: path.join(__dirname, 'icon.png')
    });

    // 开发模式加载本地服务器，生产模式启动本地HTTP服务
    const isDev = process.env.NODE_ENV === 'development';

    if (isDev) {
        mainWindow.loadURL('http://localhost:3000');
        mainWindow.webContents.openDevTools();
    } else {
        // 生产模式：启动本地 HTTP 服务器，使 Google OAuth 能够工作
        // Firebase 已将 localhost 添加到授权域名
        const http = require('http');
        const PORT = Number(new URL(appOrigin(false)).port); // 使用不常见的端口避免冲突
        const appDir = path.join(process.resourcesPath, 'app');

        // Share the same Google API routes as local development and AI Studio.
        const { createGeminiHandler } = require(path.join(process.resourcesPath, 'runtime', 'aistudio-server.cjs'));
        const handleGoogleApi = createGeminiHandler();
        const { safePublicFetch, isSameOriginRequest } = require(path.join(process.resourcesPath, 'runtime', 'safe-fetch.cjs'));
        // 创建简单的静态文件服务器
        const server = http.createServer(async (req, res) => {
            // Reject DNS rebinding against the loopback desktop server.
            if (![ `localhost:${PORT}`, `127.0.0.1:${PORT}` ].includes(req.headers.host)) {
                res.writeHead(403); res.end('Forbidden host'); return;
            }
            try {
                if (await handleGoogleApi(req, res)) return;
            } catch { res.writeHead(400); res.end('Invalid request'); return; }
            if (!isSameOriginRequest(req)) { res.writeHead(403); res.end('Forbidden'); return; }
            res.setHeader('X-Content-Type-Options', 'nosniff');
            // 图片代理：统一解决渲染进程跨域加载远程图片问题
            if (req.url && req.url.startsWith('/api/image-proxy')) {
                (async () => {
                    try {
                        const parsed = new URL(req.url, `http://127.0.0.1:${PORT}`);
                        const targetUrl = parsed.searchParams.get('url');
                        if (!targetUrl) {
                            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
                            res.end('Missing url parameter');
                            return;
                        }

                        let remoteUrl;
                        try {
                            remoteUrl = new URL(targetUrl);
                        } catch {
                            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
                            res.end('Invalid url parameter');
                            return;
                        }

                        if (!['http:', 'https:'].includes(remoteUrl.protocol)) {
                            res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
                            res.end('Only http/https is allowed');
                            return;
                        }

                        const upstream = await safePublicFetch(remoteUrl.toString(), {
                            redirect: 'follow',
                        });
                        if (!upstream.ok) {
                            res.writeHead(upstream.status, { 'Content-Type': 'text/plain; charset=utf-8' });
                            res.end(`Upstream error: ${upstream.status}`);
                            return;
                        }

                        const arrayBuffer = await upstream.arrayBuffer();
                        const buffer = Buffer.from(arrayBuffer);
                        const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
                        res.writeHead(200, {
                            'Content-Type': contentType,
                            'Content-Length': String(buffer.length),
                            'Cache-Control': 'public, max-age=86400',
                            'Content-Security-Policy': "sandbox; default-src 'none'; style-src 'unsafe-inline'"
                        });
                        res.end(buffer);
                    } catch (err) {
                        const msg = err && err.message ? err.message : String(err);
                        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                        res.end(`Proxy error: ${msg}`);
                    }
                })();
                return;
            }

            // Sanitize URL path to prevent path traversal
            let reqPath = req.url === '/' ? 'index.html' : req.url;
            // Remove query parameters
            if (reqPath.includes('?')) {
                reqPath = reqPath.split('?')[0];
            }
            // Decode and resolve to prevent directory traversal
            try { reqPath = decodeURIComponent(reqPath).replace(/^\/+/, ''); }
            catch { res.writeHead(400); res.end('Invalid path'); return; }
            let filePath = path.join(appDir, reqPath);

            // Ensure the resolved path is within appDir
            const resolvedPath = path.resolve(filePath);
            if (resolvedPath !== path.resolve(appDir) && !resolvedPath.startsWith(path.resolve(appDir) + path.sep)) {
                res.writeHead(403);
                res.end('Forbidden');
                return;
            }

            // 获取文件扩展名
            const ext = path.extname(filePath).toLowerCase();
            const mimeTypes = {
                '.html': 'text/html',
                '.js': 'application/javascript',
                '.mjs': 'application/javascript',
                '.wasm': 'application/wasm',
                '.css': 'text/css',
                '.json': 'application/json',
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.gif': 'image/gif',
                '.svg': 'image/svg+xml',
                '.woff': 'font/woff',
                '.woff2': 'font/woff2',
                '.ttf': 'font/ttf',
                '.ico': 'image/x-icon'
            };

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    // 文件不存在时返回 index.html (SPA 路由)
                    fs.readFile(path.join(appDir, 'index.html'), (err2, data2) => {
                        if (err2) {
                            res.writeHead(404);
                            res.end('Not Found');
                        } else {
                            res.writeHead(200, { 'Content-Type': 'text/html' });
                            res.end(data2);
                        }
                    });
                } else {
                    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
                    res.end(data);
                }
            });
        });

        server.listen(PORT, '127.0.0.1', () => {
            console.log(`[Electron] Local server running at http://localhost:${PORT}`);
            mainWindow.loadURL(`http://localhost:${PORT}`);
        });

        // 窗口关闭时关闭服务器
        mainWindow.on('closed', () => {
            server.close();
        });
    }

    const openInChrome = openInChromeGlobal;

    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        // 允许 Firebase/Google 认证弹窗在 Electron 中打开
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname === 'accounts.google.com' ||
                urlObj.hostname.endsWith('.firebaseapp.com') ||
                (urlObj.hostname.endsWith('.googleapis.com') && urlObj.pathname.startsWith('/identitytoolkit'))) {
                return { action: 'allow', overrideBrowserWindowOptions: { webPreferences: { preload: undefined, nodeIntegration: false, contextIsolation: true, sandbox: true } } }; // 无应用桥接的认证弹窗
            }
        } catch (e) {
            // Invalid URL, deny
        }

        // 其他链接用 Chrome 打开
        openInChrome(url);
        return { action: 'deny' };
    });

    // Remote pages must never replace a privileged app renderer.
    mainWindow.webContents.on('will-navigate', (event, url) => {
        if (!trustedAppUrl(url, isDev)) {
            event.preventDefault();
            openInChromeGlobal(url);
        }
    });

    // 处理文件下载（确保 blob URL 下载有正确文件名 + 弹出保存对话框）
    mainWindow.webContents.session.on('will-download', (event, item) => {
        const suggestedName = item.getFilename();
        // 如果文件名看起来像 UUID（blob URL 默认），尝试使用 Content-Disposition 的文件名
        if (suggestedName && !suggestedName.match(/^[0-9a-f]{8}-/)) {
            // 文件名正常，让用户选保存位置
            item.setSaveDialogOptions({
                defaultPath: suggestedName,
            });
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    initCachePath(); // 初始化缓存目录
    createMenu();    // 创建应用菜单（编辑菜单用于复制/粘贴）
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Only the application's own top-level windows may invoke privileged IPC.
const handleAppIpc = (channel, handler) => ipcMain.handle(channel, (event, ...args) => {
    if (!trustedIpcSender(event, [mainWindow, imagePromptSheetWindow], process.env.NODE_ENV === 'development')) {
        throw new Error('Untrusted IPC sender');
    }
    return handler(event, ...args);
});

handleAppIpc('split-project:save-file', async (_event, { json, filename, imagePaths }) => {
    try {
        const folders = [...new Set((imagePaths || []).filter(p => typeof p === 'string' && path.isAbsolute(p)).map(p => path.dirname(p)))];
        const suggestedDirectory = folders.length === 1 ? folders[0] : app.getPath('documents');
        const safeName = path.basename(filename || '拆分工程.aitkproj.json');
        const suffix = safeName.endsWith('.aitkproj.json') ? '.aitkproj.json' : path.extname(safeName);
        const stem = safeName.slice(0, safeName.length - suffix.length);
        let index = 1;
        for (;;) {
            const destination = path.join(suggestedDirectory, index === 1 ? safeName : `${stem} (${index})${suffix}`);
            try {
                await fs.promises.writeFile(destination, String(json), { encoding: 'utf8', flag: 'wx' });
                return { success: true, path: destination };
            } catch (error) { if (error.code !== 'EEXIST') throw error; index++; }
        }
    } catch (error) { return { success: false, error: error.message }; }
});

// ==================== 图＋词交付表格独立浮窗 ====================
handleAppIpc('image-prompt-sheet:keep-expanded', (_event, enabled) => {
    imagePromptSheetKeepExpanded = Boolean(enabled);
    const win = imagePromptSheetWindow;
    if (win && !win.isDestroyed()) {
        setImagePromptSheetCollapsed(!imagePromptSheetKeepExpanded && !win.isFocused());
    }
    return { success: true, enabled: imagePromptSheetKeepExpanded };
});
handleAppIpc('image-prompt-sheet:collapsed-state', () => imagePromptSheetCollapsed);
handleAppIpc('image-prompt-sheet:expand', () => {
    setImagePromptSheetCollapsed(false);
    imagePromptSheetWindow?.focus();
});
handleAppIpc('image-prompt-sheet:open', () => openImagePromptSheet());
handleAppIpc('image-prompt-sheet:close', () => {
    if (imagePromptSheetWindow && !imagePromptSheetWindow.isDestroyed()) imagePromptSheetWindow.close();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.show();
        mainWindow.focus();
        mainWindow.webContents.send('image-prompt-sheet:restore');
    }
    return { success: true };
});
handleAppIpc('image-prompt-sheet:set-opacity', (_event, value) => {
    const opacity = Math.min(1, Math.max(0.35, Number(value) || 1));
    if (imagePromptSheetWindow && !imagePromptSheetWindow.isDestroyed()) imagePromptSheetWindow.setOpacity(opacity);
    return { success: true, opacity };
});
handleAppIpc('image-prompt-sheet:set-data', (_event, data) => {
    imagePromptSheetData = data;
    sendImagePromptSheetData();
    return { success: true };
});
handleAppIpc('image-prompt-sheet:edit-cell', (_event, edit) => {
    if (!edit || typeof edit.id !== 'string' || ![4, 5, 6].includes(edit.column) || typeof edit.value !== 'string') return { success: false };
    if (!mainWindow || mainWindow.isDestroyed()) return { success: false };
    mainWindow.webContents.send('image-prompt-sheet:edit', edit);
    return { success: true };
});
handleAppIpc('image-prompt-sheet:ready' , () => {
    sendImagePromptSheetData();
    return imagePromptSheetData;
});
// 原图必须在本地存在；找不到时提示重新关联，不使用内存副本兜底。
async function assertLocalImageFile(filePath) {
    if (typeof filePath !== 'string' || !path.isAbsolute(filePath)) throw new Error('原图片路径无效，请查找素材重新关联');
    let stat;
    try { stat = await fs.promises.stat(filePath); } catch { stat = null; }
    if (!stat || !stat.isFile()) throw new Error(`本地找不到原图片：${path.basename(filePath)}，请查找素材重新关联`);
}

async function writeClipboardFilePaths(paths) {
    if (process.platform === 'win32') {
        // Windows：以文件拖放列表 (CF_HDROP) 写入剪贴板，等同于在资源管理器中“复制”本地文件。
        // 路径通过环境变量传入，避免拼接进命令行。
        const script = [
            'Add-Type -AssemblyName System.Windows.Forms',
            '$list = New-Object System.Collections.Specialized.StringCollection',
            'foreach ($p in (ConvertFrom-Json $env:TOOLKIT_CLIPBOARD_PATHS)) { [void]$list.Add([string]$p) }',
            'if ($list.Count -eq 0) { throw "没有可复制的文件" }',
            '[System.Windows.Forms.Clipboard]::SetFileDropList($list)',
        ].join('; ');
        await new Promise((resolve, reject) => require('child_process').execFile(
            'powershell.exe',
            ['-NoProfile', '-NonInteractive', '-STA', '-Command', script],
            { timeout: 15000, windowsHide: true, env: { ...process.env, TOOLKIT_CLIPBOARD_PATHS: JSON.stringify(paths) } },
            error => error ? reject(new Error('系统剪贴板写入失败')) : resolve()
        ));
        return;
    }
    if (process.platform !== 'darwin') throw new Error('当前系统暂不支持复制本地原文件');
        const script = `ObjC.import('AppKit'); ObjC.import('Foundation');
            const paths = ${JSON.stringify(paths)};
            const urls = $.NSMutableArray.alloc.init;
            paths.forEach(p => urls.addObject($.NSURL.fileURLWithPath($(p))));
            const board = $.NSPasteboard.generalPasteboard;
            board.clearContents;
            if (!board.writeObjects(urls)) throw new Error('系统剪贴板写入失败');
            const items = board.pasteboardItems;
            for (let i = 0; i < Number(items.count); i++) {
                const item = items.objectAtIndex(i);
                const types = item.types;
                for (let j = 0; j < Number(types.count); j++) item.dataForType(types.objectAtIndex(j));
            }
            if (Number(items.count) !== paths.length) throw new Error('剪贴板图片数量不匹配');
            String(items.count);`;
        await new Promise((resolve, reject) => require('child_process').execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script], { timeout: 15000 }, error => error ? reject(error) : resolve()));
}

handleAppIpc('image-prompt-sheet:copy-image', async (_event, url, originalName, originalPath) => {
    try {
        if (originalPath) {
            await assertLocalImageFile(originalPath);
            await writeClipboardFilePaths([originalPath]);
            return { success: true, source: 'original-file' };
        }
        const response = await fetch(url);
        if (!response.ok) throw new Error(`图片读取失败 (${response.status})`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const image = nativeImage.createFromBuffer(bytes);
        if (image.isEmpty()) throw new Error('图片格式无法复制');
        // Preserve original bytes and filename, and offer a file reference alongside the bitmap.
        let fileUrl;
        if (originalName && process.platform === 'darwin') {
            const name = path.basename(String(originalName).replace(/\\/g, '/'));
            if (!name || name === '.' || name === '..') throw new Error('图片文件名无效');
            const directory = fs.mkdtempSync(path.join(app.getPath('temp'), 'toolkit-clipboard-'));
            const filePath = path.join(directory, name);
            fs.writeFileSync(filePath, bytes);
            fileUrl = pathToFileURL(filePath).href;
        }
        if (electron.ClipboardItem) {
            await clipboard.write([new electron.ClipboardItem({
                'image/png': new Blob([image.toPNG()], { type: 'image/png' })
            })]);
        } else {
            clipboard.writeImage(image);
            if (fileUrl) clipboard.writeBuffer('public.file-url', Buffer.from(fileUrl, 'utf8'));
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});
handleAppIpc('image-prompt-sheet:copy-images', async (_event, images) => {
    try {
        if (!Array.isArray(images) || !images.length) throw new Error('没有可复制的图片');
        const root = fs.mkdtempSync(path.join(app.getPath('temp'), 'toolkit-clipboard-batch-'));
        const paths = [];
        for (const [index, item] of images.entries()) {
            if (item.originalPath) {
                await assertLocalImageFile(item.originalPath);
                paths.push(item.originalPath);
                continue;
            }
            const name = path.basename(String(item.name || '').replace(/\\/g, '/'));
            if (!name || name === '.' || name === '..') throw new Error('图片文件名无效');
            const response = await fetch(item.url);
            if (!response.ok) throw new Error(`读取图片失败：${name}`);
            const bytes = Buffer.from(await response.arrayBuffer());
            if (nativeImage.createFromBuffer(bytes).isEmpty()) throw new Error(`图片格式无效：${name}`);
            const directory = path.join(root, String(index));
            fs.mkdirSync(directory);
            const filePath = path.join(directory, name);
            fs.writeFileSync(filePath, bytes);
            paths.push(filePath);
        }
        // Multiple pasteboard file items preserve names and original bytes for file-aware targets.
        await writeClipboardFilePaths(paths);
        return { success: true, count: paths.length };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

handleAppIpc('image-prompt-sheet:copy-text', async (_event, text, html) => {
    try {
        if (typeof html === 'string' && html) {
            if (electron.ClipboardItem) {
                await clipboard.write([new electron.ClipboardItem({
                    'text/plain': String(text ?? ''),
                    'text/html': html
                })]);
            } else {
                await clipboard.write({ text: String(text ?? ''), html });
            }
        } else {
            await clipboard.writeText(String(text ?? ''));
        }
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// ==================== IPC 处理：打开外部链接 ====================

// 在 Chrome 中打开外部链接
const openInChromeGlobal = (value) => {
    let url;
    try { url = externalHttpUrl(value); }
    catch { return false; }
    const fallback = () => { shell.openExternal(url).catch(() => console.warn('[Shell] Could not open browser')); };
    // Never interpolate a renderer-controlled URL into a shell command.
    const { execFile } = require('node:child_process');
    if (process.platform === 'darwin') {
        execFile('/usr/bin/open', ['-a', 'Google Chrome', url], err => { if (err) fallback(); });
    } else {
        fallback();
    }
    return true;
};

handleAppIpc('shell:openExternal', async (event, { url }) => {
    try {
        if (!openInChromeGlobal(url)) return { success: false, error: 'Only HTTP(S) links are allowed' };
        return { success: true };
    } catch (error) {
        console.error('[Shell] Open external failed:', error);
        return { success: false, error: error.message };
    }
});

// ==================== IPC 处理：本地缓存 ====================

// 保存大数据到本地文件
handleAppIpc('cache:save', async (event, { key, data }) => {
    try {
        const filePath = cacheFilePath(cachePath, key);
        fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
        console.log(`[Cache] Saved: ${key} (${(fs.statSync(filePath).size / 1024 / 1024).toFixed(2)}MB)`);
        return { success: true };
    } catch (error) {
        console.error('[Cache] Save failed:', error);
        return { success: false, error: error.message };
    }
});

// 读取本地缓存
handleAppIpc('cache:load', async (event, { key }) => {
    try {
        const filePath = cacheFilePath(cachePath, key);
        if (fs.existsSync(filePath)) {
            const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
            console.log(`[Cache] Loaded: ${key}`);
            return { success: true, data };
        }
        return { success: false, error: 'Not found' };
    } catch (error) {
        console.error('[Cache] Load failed:', error);
        return { success: false, error: error.message };
    }
});

// 删除缓存
handleAppIpc('cache:delete', async (event, { key }) => {
    try {
        const filePath = cacheFilePath(cachePath, key);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log(`[Cache] Deleted: ${key}`);
        }
        return { success: true };
    } catch (error) {
        console.error('[Cache] Delete failed:', error);
        return { success: false, error: error.message };
    }
});

// 列出所有缓存
handleAppIpc('cache:list', async () => {
    try {
        const files = fs.readdirSync(cachePath)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                const filePath = path.join(cachePath, f);
                const stats = fs.statSync(filePath);
                return {
                    key: f.replace('.json', ''),
                    size: stats.size,
                    modifiedAt: stats.mtime.toISOString()
                };
            });
        return { success: true, files };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// 获取缓存目录大小
handleAppIpc('cache:stats', async () => {
    try {
        let totalSize = 0;
        const files = fs.readdirSync(cachePath);
        for (const file of files) {
            const stats = fs.statSync(path.join(cachePath, file));
            totalSize += stats.size;
        }
        return {
            success: true,
            totalSize,
            totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
            path: cachePath
        };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

// ==================== Opal 功能已移除 ====================
// Opal 批量生图功能仅在独立版本中可用
