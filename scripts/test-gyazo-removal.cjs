const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
function source(file) { return fs.readFileSync(path.join(root, file), 'utf8'); }
function load(file, globals = {}) {
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(source(file), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
        { module, exports: module.exports, console, URL, Blob, File, atob, ...globals });
    return module.exports;
}
test('application and archived Apps Script sources cannot upload to Gyazo or read its credentials', () => {
    function scan(folder) {
        for (const entry of fs.readdirSync(path.join(root, folder), { withFileTypes: true })) {
            if (['node_modules', 'dist', 'prebuilt-dist', 'dist-electron'].includes(entry.name)) continue;
            const file = path.join(folder, entry.name);
            if (entry.isDirectory()) scan(file);
            else if (/\.(tsx?|gs|html)$/.test(file)) assert.doesNotMatch(source(file), /upload\.gyazo\.com|gyazo_access_token|GYAZO_ACCESS_TOKEN|\b(?:uploadToGyazo|uploadFileToGyazo|getGyazoToken)\b/, file);
        }
    }
    scan('apps'); scan('非代码资料/停用功能/google-apps-script');
    assert.doesNotMatch(source('.env.example'), /GYAZO/);
});
test('legacy Gyazo URLs still normalize and clipboard helpers remain available', () => {
    for (const tool of ['script-split', 'template-batch-editor']) {
        const utils = load(`apps/${tool}/utils/gyazoUploader.ts`);
        assert.equal(utils.normalizeGyazoDirectUrl('https://gyazo.com/abcdef1234'), 'https://i.gyazo.com/abcdef1234.png');
        assert.equal(utils.toGoogleSheetsImageFormula('photo.png'), 'photo.png');
        assert.equal(typeof utils.copyImageToClipboard, 'function');
        assert.equal(typeof utils.copyImageAndPromptToClipboard, 'function');
        assert.equal(utils.uploadFileToGyazo, undefined);
    }
});
test('local file conversion works without a network or a token', () => {
    const service = load('apps/image-review/services/gyazoService.ts');
    const file = service.base64ToFile('data:image/png;base64,YWJj', 'local.png');
    assert.equal(file.name, 'local.png'); assert.equal(file.type, 'image/png'); assert.equal(file.size, 3);
    assert.deepEqual(Object.keys(service), ['base64ToFile']);
});
test('smart translate imports remain ready for OCR without publishing images', async () => {
    const file = 'apps/smart-translate/SmartTranslateApp.tsx';
    const sf = ts.createSourceFile(file, source(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let declaration;
    function find(n) { if (ts.isVariableDeclaration(n) && n.name.getText(sf) === 'addItems') declaration = n; ts.forEachChild(n, find); }
    find(sf); assert.ok(declaration);
    let items = [];
    const context = { fileToBase64: async () => 'YWJj', setItems: f => { items = f(items); }, Date, Math };
    vm.createContext(context);
    vm.runInContext(ts.transpileModule('globalThis.addItems = ' + declaration.initializer.getText(sf), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
    await context.addItems([{ name: 'local.png', type: 'image/png' }]);
    assert.equal(items.length, 1); assert.equal(items[0].status, 'idle'); assert.equal(items[0].content, 'YWJj'); assert.equal(items[0].sourceUrl, undefined);
});
test('device-local originals survive cache reopen without an image host', async () => {
    const data = new Map();
    const indexedDB = { open() {
        const req = {};
        queueMicrotask(() => {
            req.result = { transaction() {
                const tx = { objectStore() { return {
                    put(value, id) { data.set(id, value); queueMicrotask(() => tx.oncomplete()); },
                    get(id) { const r = {}; queueMicrotask(() => { r.result = data.get(id); r.onsuccess(); }); return r; }
                }; } }; return tx;
            } };
            req.onsuccess();
        }); return req;
    } };
    const cache = load('services/localImageCache.ts', { indexedDB });
    await cache.cacheLocalImage('image-1', 'data:image/png;base64,YWJj');
    assert.equal(await cache.readLocalImage('image-1'), 'data:image/png;base64,YWJj');
    assert.equal(await cache.readLocalImage('missing'), undefined);
});
