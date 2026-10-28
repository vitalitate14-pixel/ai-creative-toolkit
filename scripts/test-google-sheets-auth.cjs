const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load() {
    const data = new Map([['google_sheets_client_id', 'personal.apps.googleusercontent.com'], ['local-profile-data', 'keep-me']]);
    let options;
    const storage = {
        getItem: key => data.get(key) ?? null,
        setItem: (key, value) => data.set(key, value),
        removeItem: key => data.delete(key),
        key: index => [...data.keys()][index] ?? null,
        get length() { return data.size; },
    };
    const module = { exports: {} };
    const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../services/googleSheetsAuthService.ts'), 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    vm.runInNewContext(code, {
        module, exports: module.exports, localStorage: storage,
        window: { google: { accounts: { oauth2: { initTokenClient(config) {
            options = config;
            return { requestAccessToken() {} };
        } } } }, prompt() { throw new Error('Saved client ID should be used'); } },
    });
    return { service: module.exports, data, getOptions: () => options };
}

test('loading the app does not start authorization or create a software account', () => {
    const { service, getOptions, data } = load();
    assert.equal(getOptions(), undefined);
    assert.equal(service.getGoogleAccessToken(), null);
    assert.equal(data.get('local-profile-data'), 'keep-me');
    assert.equal(service.signUp, undefined);
    assert.equal(service.signInWithEmail, undefined);
});

test('explicit Sheets authorization requests only Sheets scopes and stores an expiring token', async () => {
    const { service, getOptions } = load();
    const pending = service.authorizeGoogleSheetsWrite();
    assert.equal(getOptions().scope, 'https://www.googleapis.com/auth/spreadsheets');
    getOptions().callback({ access_token: 'mock-token', expires_in: 3600 });
    await pending;
    assert.equal(service.getGoogleAccessToken(), 'mock-token');
    assert.equal(service.hasSheetsWritePermission(), true);
    assert.equal(service.isGoogleTokenExpiringSoon(), false);
});

test('read-only authorization does not mark the token as writable', async () => {
    const { service, getOptions } = load();
    const pending = service.authorizeGoogleSheetsRead();
    assert.equal(getOptions().scope, 'https://www.googleapis.com/auth/spreadsheets.readonly');
    getOptions().callback({ access_token: 'mock-read-token', expires_in: 3600 });
    await pending;
    assert.equal(service.hasSheetsWritePermission(), false);
});

test('expired authorization clears only Sheets credentials and preserves local data', () => {
    const { service, data } = load();
    data.set('google_oauth_access_token', 'expired');
    data.set('google_oauth_token_expiry', String(Date.now() - 1));
    assert.equal(service.getGoogleAccessToken(), null);
    assert.equal(data.has('google_oauth_access_token'), false);
    assert.equal(data.get('local-profile-data'), 'keep-me');
});

test('closing an authorization popup rejects and allows retry', async () => {
    const { service, getOptions } = load();
    const first = service.authorizeGoogleSheetsRead();
    getOptions().error_callback();
    await assert.rejects(first, /授权窗口/);
    const retry = service.authorizeGoogleSheetsRead();
    getOptions().callback({ error: 'access_denied' });
    await assert.rejects(retry, /access_denied/);
});

test('old local presets can migrate without initializing Firebase', () => {
    const { service, data, getOptions } = load();
    data.set('firebase:authUser:old-project', JSON.stringify({ uid: 'legacy-local-id' }));
    assert.equal(service.getLegacyLocalUserId(), 'legacy-local-id');
    assert.equal(getOptions(), undefined);
});
