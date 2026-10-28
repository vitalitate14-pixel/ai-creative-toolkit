// Regression coverage for retiring the formerly shared cloud endpoints.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {module,exports:module.exports,require:name=>{assert.ok(name in mocks,`Unexpected dependency: ${name}`);return mocks[name];},console});
 return module.exports;
}
for(const name of ['getServiceAccountToken','sheetsProxy','sharedPoolStatus','sharedGemini','migrateLegacyCloudData']) {
 test(`${name} is retired and cannot return credentials or touch cloud data`,async()=>{
  const endpoints=load('functions/src/index.ts',{'firebase-functions':{https:{onRequest:handler=>handler}}});
  const response={code:200,set(){},status(code){this.code=code;return this;},json(data){this.data=data;}};
  await endpoints[name]({body:{},method:'POST'},response);
  assert.equal(response.code,410);assert.ok(response.data.error);assert.equal(response.data.token,undefined);
 });
}
test('personal API keys use the local device identity without login or a public spreadsheet',async()=>{
 let saved;
 const service=load('services/apiKeyManagementService.ts',{
  './localFirestore':{LOCAL_USER_ID:'local'},
  './userApiPoolService':{loadUserApiPool:async id=>{assert.equal(id,'local');return[{apiKey:'test-not-a-secret',nickname:'Local'}];},saveUserApiPool:async(id,keys)=>{saved={id,keys};}},
 });
 const keys=await service.fetchUserApiKeys('old-account@example.com');assert.equal(keys[0].apiKey,'test-not-a-secret');assert.equal(keys[0].user,'本机');
 await service.saveApiKeys('different-account@example.com',[{apiKey:'new-test-value',nickname:'Mine',status:'active'}]);assert.equal(saved.id,'local');assert.equal(saved.keys[0].apiKey,'new-test-value');assert.equal(service.fetchSharedApiKeys,undefined);
});
test('automatic result uploads remain off even when an old configuration enabled them',async()=>{
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('services/sheetsSyncService.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,
 {module,exports:module.exports,localStorage:{getItem:()=>JSON.stringify({autoSave:true,webAppUrl:'https://old.example',submitter:'old'})},console,fetch:()=>{throw new Error('Network must not be reached');}});
 assert.equal(module.exports.getSheetsSyncConfig().autoSave,false);
 const result=await module.exports.saveImageRecognitionResult('https://example.com/image.png','result');assert.equal(result.success,false);
});
