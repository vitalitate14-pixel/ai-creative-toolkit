const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { Readable } = require('node:stream');
const { externalHttpUrl, cacheFilePath, trustedIpcSender } = require('../electron/security.cjs');
const { isPublicAddress, isSameOriginRequest, safePublicFetch } = require('../runtime/safe-fetch.cjs');

test('external URLs reject executable schemes and preserve shell metacharacters as URL data', () => {
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,test', 'https://user:secret@example.com', 'https://example.com/\n']) assert.throws(() => externalHttpUrl(url));
    assert.match(externalHttpUrl('https://example.com/$(touch%20test)'), /^https:\/\/example.com\//);
    const main = fs.readFileSync(path.join(__dirname, '../electron/main.js'), 'utf8');
    assert.doesNotMatch(main, /\bexec\(/);
});

test('cache identifiers cannot escape their directory on either OS', () => {
    for (const key of ['../outside', '..\\outside', 'C:outside', '/tmp/x', '', '.', '..', 'bad\0key']) assert.throws(() => cacheFilePath('/cache', key));
    assert.equal(cacheFilePath('/cache', 'sheetmind-cache_1'), '/cache/sheetmind-cache_1.json');
});

test('IPC requires a known app window, its main frame, and exact app origin', () => {
    const frame = { url: 'http://localhost:51789/?imagePromptSheetDetached=1' };
    const wc = { mainFrame: frame };
    const win = { isDestroyed: () => false, webContents: wc };
    assert.equal(trustedIpcSender({ sender: wc, senderFrame: frame }, [win], false), true);
    assert.equal(trustedIpcSender({ sender: wc, senderFrame: { url: frame.url } }, [win], false), false);
    frame.url = 'http://localhost:51789.attacker.example/';
    assert.equal(trustedIpcSender({ sender: wc, senderFrame: frame }, [win], false), false);
    frame.url = 'https://accounts.google.com/';
    assert.equal(trustedIpcSender({ sender: wc, senderFrame: frame }, [win], false), false);
});

test('SSRF rejects private, mapped, multicast, metadata and reserved addresses', async () => {
    for (const ip of ['127.0.0.1', '10.0.0.1', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', '64:ff9b::7f00:1', '2001:db8::1']) assert.equal(isPublicAddress(ip), false, ip);
    assert.equal(isPublicAddress('8.8.8.8'), true);
    assert.equal(isPublicAddress('2606:4700:4700::1111'), true);
    const dependencies = { lookup: async () => [{ address: '127.0.0.1', family: 4 }], request() { throw new Error('Network must not be reached'); } };
    await assert.rejects(safePublicFetch('http://2130706433/', {}, dependencies), /Private/);
    await assert.rejects(safePublicFetch('https://example.com/', {}, dependencies), /Private/);
    await assert.rejects(safePublicFetch('http://example.com:22/', {}, dependencies), /Unsupported/);
});

test('SSRF validates redirects and pins the validated DNS answer to the connection', async () => {
    let requests = 0;
    const dependencies = {
        lookup: async () => [{ address: '8.8.8.8', family: 4 }],
        request(url, options, callback) {
            requests++;
            options.lookup('example.com', {}, (err, address) => { assert.equal(err, null); assert.equal(address, '8.8.8.8'); });
            const req = new EventEmitter();
            req.write = () => {};
            req.destroy = error => req.emit('error', error);
            req.end = () => queueMicrotask(() => {
                const res = Readable.from([]);
                res.statusCode = 302;
                res.headers = { location: 'http://169.254.169.254/latest/meta-data/' };
                callback(res);
                req.emit('close');
            });
            return req;
        }
    };
    await assert.rejects(safePublicFetch('https://example.com/', {}, dependencies), /Private/);
    assert.equal(requests, 1);
});

test('browser origin checks fail closed for invalid and spoofed forwarded origins', () => {
    assert.equal(isSameOriginRequest({ headers: { host: 'localhost:3000', origin: 'null' } }), false);
    assert.equal(isSameOriginRequest({ headers: { host: 'localhost:3000', origin: 'https://evil.example', 'x-forwarded-host': 'evil.example' } }), false);
    assert.equal(isSameOriginRequest({ headers: { host: 'localhost:3000', origin: 'http://localhost:3000' } }), true);
});

test('extension accepts only known toolkit origins and bounded valid messages', () => {
    const context = {};
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../extensions/toolkit-bridge/security.js'), 'utf8'), Object.assign(context, { URL }));
    const security = context.ToolkitBridgeSecurity;
    assert.equal(security.trustedUrl('https://evil.web.app/'), false);
    assert.equal(security.trustedUrl('http://localhost:9999/'), false);
    assert.equal(security.trustedUrl('https://ai-toolkit-b2b78.web.app/'), true);
    assert.equal(security.validMessage({ action: 'fillPrompt', platform: 'flow', prompt: 'hello' }), true);
    assert.equal(security.validMessage({ action: 'fillPrompt', platform: 'flow', prompt: { toString: 'bad' } }), false);
});

function loadTypeScript(file, imports = {}) {
    const ts = require('typescript');
    const compiled = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText;
    const module = { exports: {} };
    vm.runInNewContext(compiled, { module, exports: module.exports, require(name) {
        if (name in imports) return imports[name];
        throw new Error(`Unexpected import: ${name}`);
    }, console, URL, Date });
    return module.exports;
}

test('exported HTML escapes attacker-controlled project, feedback and image attributes', () => {
    const types = loadTypeScript('apps/image-review/types.ts');
    const report = loadTypeScript('apps/image-review/services/reportExportService.ts', { '../types': types, './imageCompressService': {} });
    const attack = '<img src=x onerror="window.__securityXss=1">';
    const image = {
        id: 'test', status: 'revision', annotations: [], originalInput: attack,
        imageUrl: 'https://example.com/x" onload="window.__securityXss=1',
        feedbackItems: [{ severity: 'major', suggestionCn: attack, problemCn: attack,
            suggestionTranslation: { english: attack }, problemTranslation: { english: attack },
            colorHex: 'red" onmouseover="window.__securityXss=1', referenceImageUrl: 'javascript:window.__securityXss=1' }]
    };
    for (const language of ['bilingual', 'english']) {
        const html = report.generateBilingualHTMLReport([image], { name: attack, batchNumber: attack, reviewerName: attack, reviewDate: attack, notes: attack, overallSummary: attack, overallSummaryEn: attack }, 'online', [], language);
        assert.ok(html.includes('&lt;img'));
        assert.ok(!html.includes(attack));
        assert.doesNotMatch(html, /src="javascript:/);
        assert.doesNotMatch(html, /background-color: red"/);
        assert.doesNotMatch(html, /<img src=x/);
    }
});

test('migrated PDF.js and Mammoth parse real PDF and DOCX files through DocumentService', async () => {
    // Node requires PDF.js's legacy entry for the built-in browser API polyfills.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const { pathToFileURL } = require('node:url');
    const { documentService } = loadTypeScript('apps/ai-mind-map/services/documentService.ts', {
        'pdfjs-dist': pdfjs,
        'pdfjs-dist/build/pdf.worker.min.mjs?url': { default: pathToFileURL(require.resolve('pdfjs-dist/legacy/build/pdf.worker.min.mjs')).href },
        mammoth: { default: require('mammoth/mammoth.browser.js') }
    });
    const { jsPDF } = require('jspdf');
    const pdf = new jsPDF();
    pdf.text('Security audit PDF import', 10, 10);
    const pdfResult = await documentService.parseDocument(new File([pdf.output('arraybuffer')], 'security.pdf', { type: 'application/pdf' }));
    assert.equal(pdfResult.success, true, pdfResult.error);
    assert.match(pdfResult.text, /Security audit PDF import/);
    const JSZip = require('jszip');
    const zip = new JSZip();
    zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    zip.file('_rels/.rels', '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
    zip.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Security audit DOCX import</w:t></w:r></w:p></w:body></w:document>');
    const docxResult = await documentService.parseDocument(new File([await zip.generateAsync({ type: 'nodebuffer' })], 'security.docx'));
    assert.equal(docxResult.success, true, docxResult.error);
    assert.match(docxResult.text, /Security audit DOCX import/);
});
