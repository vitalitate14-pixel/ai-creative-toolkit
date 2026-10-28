const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function setup(nativeCopy, failRead = false) {
  const png = new Blob(['decoded'], { type: 'image/png' });
  const calls = [];
  const context = {
    exports: {}, require: () => ({ getOriginalImagePath: image => image.originalPath || '' }), Blob, console: { warn() {}, error() {} },
    window: { electronAPI: nativeCopy ? { copyImagePromptSheetImage: nativeCopy } : undefined, ClipboardItem: true },
    navigator: { clipboard: { write: async items => { calls.push(items); await items[0].data['image/png']; } } },
    ClipboardItem: class { constructor(data) { this.data = data; } },
    FileReader: class {
      readAsDataURL(blob) {
        queueMicrotask(() => {
          if (failRead && blob !== png) this.onerror();
          else { this.result = `data:${blob.type};base64,AAAA`; this.onload(); }
        });
      }
    },
    createImageBitmap: async () => { if (failRead) throw Error('unreadable'); return { width: 2, height: 2, close() {} }; },
    document: {
      querySelector: () => ({ complete: true, naturalWidth: 2, naturalHeight: 2 }),
      createElement: () => ({ getContext: () => ({ drawImage() {} }), toBlob: callback => callback(png) })
    }
  };
  const source = fs.readFileSync('apps/template-batch-editor/utils/gyazoUploader.ts', 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { copy: context.exports.copyImageToClipboard, calls, png };
}

test('native rejection retries with a decoded PNG and corrected extension', async () => {
  const calls = [];
  const { copy } = setup(async (url, name) => { calls.push({ url, name }); return { success: calls.length > 1, error: 'unsupported image' }; });
  const file = Object.assign(new Blob(['webp'], { type: 'image/webp' }), { name: 'photo.webp' });
  assert.equal((await copy(file)).success, true);
  assert.deepEqual(calls.map(call => call.name), ['photo.webp', 'photo.png']);
  assert.match(calls[1].url, /^data:image\/png/);
});

test('modified PNG can recover from the image already displayed on the page', async () => {
  const { copy } = setup(async () => ({ success: true }), true);
  const file = Object.assign(new Blob(['old'], { type: 'image/png' }), { name: 'photo.png' });
  assert.equal((await copy(file, 'blob:preview')).success, true);
});

test('missing image gives recovery instructions without writing an empty bitmap', async () => {
  const { copy, calls } = setup();
  const result = await copy(new Blob([]));
  assert.equal(result.success, false);
  assert.match(result.error, /查找素材/);
  assert.equal(calls.length, 0);
});

test('browser requests clipboard access before asynchronous decoding finishes', async () => {
  const { copy, calls } = setup();
  const operation = copy(Object.assign(new Blob(['webp'], { type: 'image/webp' }), { name: 'photo.webp' }));
  assert.equal(calls.length, 1);
  assert.equal(typeof calls[0][0].data['image/png'].then, 'function');
  assert.equal((await operation).success, true);
});

test('manual recovery refreshes a nonempty stale File after compression, preserving its ID', () => {
  const context = { exports: {}, Blob };
  const source = fs.readFileSync('apps/template-batch-editor/utils/findMissingImages.ts', 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, context);
  const oldFile = Object.assign(new Blob(['original bytes']), { name: 'photo.jpg' });
  const replacement = Object.assign(new Blob(['small']), { name: 'photo.jpg', webkitRelativePath: 'folder/photo.jpg' });
  const images = [{ id: 'bound-image', name: oldFile.name, fullPath: 'folder/photo.jpg', file: oldFile, size: oldFile.size }];
  const find = context.exports.findMissingImages;
  assert.equal(find(images, [replacement]).matches.size, 0);
  assert.equal(find(images, [replacement], true).matches.get('bound-image'), replacement);
  const other = Object.assign(new Blob(['small']), { name: 'photo.jpg', webkitRelativePath: 'other/photo.jpg' });
  const ambiguous = find([{ ...images[0], fullPath: 'photo.jpg' }], [replacement, other], true);
  assert.equal(ambiguous.matches.size, 0);
  assert.equal(ambiguous.ambiguous, 1);
});
