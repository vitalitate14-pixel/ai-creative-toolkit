const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const electron = require('electron');

electron.app.whenReady().then(async () => {
    const { clipboard } = electron;
    const previous = await Promise.all((await clipboard.read()).map(async item => {
        const data = Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)])));
        return new electron.ClipboardItem(data);
    }));
    try {
        const source = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
        const start = source.indexOf("handleAppIpc('image-prompt-sheet:copy-text'");
        const end = source.indexOf('// ==================== IPC 处理：打开外部链接', start);
        let handler;
        vm.runInNewContext(source.slice(start, end), {
            electron, clipboard, handleAppIpc: (_name, callback) => { handler = callback; }
        });
        const text = 'photo.jpg\t\tgroup 2\tfinal prompt';
        const html = '<table><tr><td>photo.jpg</td><td></td><td>group 2</td><td>final prompt</td></tr></table>';
        assert.equal((await handler(null, text, html)).success, true);
        const [item] = await clipboard.read();
        assert.equal(await (await item.getType('text/plain')).text(), text);
        assert.match(await (await item.getType('text/html')).text(), /<td><\/td><td>group 2<\/td>/);
        console.log('PASS actual Electron clipboard: TSV and HTML retain four columns including the empty column');
        assert.equal((await handler(null, 'plain text')).success, true);
        assert.equal(await clipboard.readText(), 'plain text');
        console.log('PASS actual Electron clipboard: plain text');
        const os = require('node:os');
        const { execFileSync } = require('node:child_process');
        const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'toolkit-original-path-test-'));
        const originalPath = path.join(directory, '原图 test.png');
        fs.writeFileSync(originalPath, electron.nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aL1sAAAAASUVORK5CYII=').toPNG());
        const imageHandlers = new Map();
        const imageStart = source.indexOf('async function writeClipboardFilePaths(paths)');
        vm.runInNewContext(source.slice(imageStart, start), {
            electron, clipboard, fs, path, process, Buffer, Blob, require,
            nativeImage: electron.nativeImage, app: electron.app,
            pathToFileURL: require('node:url').pathToFileURL,
            fetch: () => { throw new Error('Original path copy must not read cached URL'); },
            handleAppIpc: (name, callback) => imageHandlers.set(name, callback)
        });
        const imageResult = await imageHandlers.get('image-prompt-sheet:copy-image')(null, 'blob:stale', '原图 test.png', originalPath);
        assert.equal(imageResult.success, true, imageResult.error);
        const fileUrl = execFileSync('/usr/bin/osascript', ['-l', 'JavaScript', '-e', "ObjC.import('AppKit'); ObjC.unwrap($.NSPasteboard.generalPasteboard.pasteboardItems.objectAtIndex(0).stringForType('public.file-url'));"], { encoding: 'utf8' }).trim();
        assert.equal(decodeURIComponent(new URL(fileUrl).pathname), originalPath);
        console.log('PASS actual macOS clipboard points to original source file, never the cached URL or a copied temporary file');
        fs.rmSync(directory, { recursive: true });
        vm.runInNewContext(source.slice(start, end), {
            electron,
            clipboard: { write: async () => { throw new Error('write rejected'); } },
            handleAppIpc: (_name, callback) => { handler = callback; }
        });
        const failed = await handler(null, text, html);
        assert.equal(failed.success, false);
        assert.equal(failed.error, 'write rejected');
        console.log('PASS asynchronous clipboard failure is returned to the UI');
    } finally {
        if (previous.length) await clipboard.write(previous); else await clipboard.clear();
    }
}).then(() => electron.app.exit(0), error => { console.error(error); electron.app.exit(1); });
