import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rig, proposal } from './helpers.mjs';
import { safePath } from '../src/tools.mjs';
import { textHash } from '../src/util.mjs';
import { Store } from '../src/store.mjs';
import { validateConfig, DEFAULTS } from '../src/config.mjs';
import { validateAction } from '../src/schema.mjs';

test('workspace paths reject traversal and absolute paths',t=>{
  const {workspace}=rig(t);for(const p of ['../x','a/../../x','/etc/passwd'])assert.throws(()=>safePath(workspace,p,{allowMissing:true}));
});
test('private files and state directories are not accessible through tools',t=>{
  const {workspace}=rig(t);for(const p of ['.env','.env.local','.git/config','.ssh/id_rsa','auth.json','certificate.pem','.eutrya/state.json'])assert.throws(()=>safePath(workspace,p,{allowMissing:true}));
});
test('symlinks and dangling symlinks are rejected',t=>{
  const {workspace,root}=rig(t);const target=path.join(root,'outside.txt');fs.writeFileSync(target,'private');
  fs.symlinkSync(target,path.join(workspace,'link'));fs.symlinkSync(path.join(root,'missing'),path.join(workspace,'dangling'));
  for(const p of ['link','dangling'])assert.throws(()=>safePath(workspace,p,{allowMissing:true}),/Symlinks/);
});
test('hard-linked files are rejected',t=>{
  const {workspace,root}=rig(t);const target=path.join(root,'outside.txt');fs.writeFileSync(target,'private');fs.linkSync(target,path.join(workspace,'hardlink'));
  assert.throws(()=>safePath(workspace,'hardlink'),/Hard-linked/);
});
test('read results preserve line ranges and source hashes',async t=>{
  const {runtime,workspace}=rig(t,{actions:[{type:'read',path:'text.txt',startLine:2,endLine:3}]});
  fs.writeFileSync(path.join(workspace,'text.txt'),'one\ntwo\nthree\n');await runtime.run();const r=runtime.state.observations[0].result;
  assert.equal(r.content,'2|two\n3|three');assert.equal(r.sha256,textHash('one\ntwo\nthree\n'));
});
test('binary file reads are rejected',async t=>{
  const {runtime,workspace}=rig(t,{actions:[{type:'read',path:'binary.bin',startLine:1,endLine:2}]});
  fs.writeFileSync(path.join(workspace,'binary.bin'),Buffer.from([0,1,2]));await runtime.run();assert.equal(runtime.state.totalSteps,0);assert.match(runtime.state.reason,/Binary/);
});
test('literal search does not treat regex syntax as instructions',async t=>{
  const {runtime,workspace}=rig(t,{actions:[{type:'search',path:'.',text:'a.*b'}]});
  fs.writeFileSync(path.join(workspace,'one.txt'),'a.*b\naxxb');await runtime.run();assert.equal(runtime.state.observations[0].result.matches.length,1);
});
test('file edits require exactly one matching occurrence',async t=>{
  const content='same same';const {runtime,workspace}=rig(t,{actions:[{type:'edit',path:'text.txt',oldText:'same',newText:'x',expectedSha256:textHash(content)}]});
  fs.writeFileSync(path.join(workspace,'text.txt'),content);await runtime.run();assert.equal(fs.readFileSync(path.join(workspace,'text.txt'),'utf8'),content);assert.match(runtime.state.reason,/exactly once/);
});
test('create-only write never overwrites an existing file',async t=>{
  const {runtime,workspace}=rig(t,{actions:[{type:'write',path:'text.txt',content:'new',expectedSha256:null}]});
  fs.writeFileSync(path.join(workspace,'text.txt'),'old');await runtime.run();assert.equal(fs.readFileSync(path.join(workspace,'text.txt'),'utf8'),'old');assert.match(runtime.state.reason,/already exists/);
});
test('hash check detects a file changed during approval',async t=>{
  let workspace;const content='old';
  const r=rig(t,{actions:[{type:'write',path:'text.txt',content:'agent update',expectedSha256:textHash(content)}],approve:async()=>{fs.writeFileSync(path.join(workspace,'text.txt'),'operator update');return true;}});
  workspace=r.workspace;fs.writeFileSync(path.join(workspace,'text.txt'),content);await r.runtime.run();
  assert.equal(fs.readFileSync(path.join(workspace,'text.txt'),'utf8'),'operator update');assert.match(r.runtime.state.reason,/File changed/);
});
test('native directory creation obeys write permissions',async t=>{
  const {runtime,workspace}=rig(t,{actions:[{type:'mkdir',path:'src'}],approve:async()=>true});await runtime.run();assert.ok(fs.statSync(path.join(workspace,'src')).isDirectory());
});
test('process execution requires explicit per-command approval',async t=>{
  let asked=0;const {runtime}=rig(t,{actions:[{type:'run',program:process.execPath,args:['-e','console.log("ok")']}],config:{allowExec:true,autoWrite:true},approve:async()=>{asked++;return false;}});
  await runtime.run();assert.equal(asked,1);assert.equal(runtime.state.observations[0].result.denied,true);
});
test('approved local process returns actual exit status and output',async t=>{
  const {runtime}=rig(t,{actions:[{type:'run',program:process.execPath,args:['-e','console.log("hello");process.exit(3)']}],config:{allowExec:true}});
  await runtime.run();const r=runtime.state.observations[0].result;assert.equal(r.exitCode,3);assert.equal(r.stdout.trim(),'hello');assert.equal(runtime.state.pending,null);
});
test('process environment does not receive the Gateway API key',async t=>{
  const previous=process.env.AI_GATEWAY_API_KEY;process.env.AI_GATEWAY_API_KEY='fixture-key-value';
  t.after(()=>{if(previous===undefined)delete process.env.AI_GATEWAY_API_KEY;else process.env.AI_GATEWAY_API_KEY=previous;});
  const {runtime}=rig(t,{actions:[{type:'run',program:process.execPath,args:['-e','console.log(process.env.AI_GATEWAY_API_KEY ?? "ABSENT")']}],config:{allowExec:true}});
  await runtime.run();assert.equal(runtime.state.observations[0].result.stdout.trim(),'ABSENT');
});
test('interrupting a process keeps its effect journal unresolved',async t=>{
  const {runtime}=rig(t,{actions:[{type:'run',program:process.execPath,args:['-e','setInterval(()=>{},1000)']}],config:{allowExec:true}});
  const p=runtime.run();setTimeout(()=>runtime.stop(),80);await p;assert.equal(runtime.state.status,'NEEDS_REVIEW');assert.ok(runtime.state.pending);
  await assert.rejects(()=>runtime.run(),/uncertain outcome/);
});
test('journal remains pending if a completed write cannot record its observation',async t=>{
  const {runtime,workspace,store}=rig(t,{actions:[{type:'write',path:'text.txt',content:'written',expectedSha256:null}]});
  const original=store.event.bind(store);let failed=false;
  store.event=(type,data)=>{if(type==='observation'&&!failed){failed=true;throw new Error('simulated journal failure');}return original(type,data);};
  await runtime.run();assert.equal(fs.readFileSync(path.join(workspace,'text.txt'),'utf8'),'written');assert.equal(runtime.state.status,'NEEDS_REVIEW');assert.ok(runtime.state.pending);
});
test('session locking prevents concurrent controllers',t=>{
  const {settings,workspace,store}=rig(t);assert.throws(()=>new Store(settings.sessionRoot,workspace,{id:store.state.id,existing:true}),/already open/);
});
test('state corruption is rejected on resume',t=>{
  const {settings,workspace,store}=rig(t);const id=store.state.id,file=store.file;store.close();
  const e=JSON.parse(fs.readFileSync(file,'utf8'));e.state.task='tampered';fs.writeFileSync(file,JSON.stringify(e));
  assert.throws(()=>new Store(settings.sessionRoot,workspace,{id,existing:true}),/checksum/);
});
test('trace chain detects an altered record',t=>{
  const {store}=rig(t);let text=fs.readFileSync(store.trace,'utf8');text=text.replace('task.started','task.changed');fs.writeFileSync(store.trace,text);
  assert.throws(()=>store.readEvents(),/integrity/);
});
test('partial trace tails fail closed rather than being silently discarded',t=>{
  const {store}=rig(t);fs.appendFileSync(store.trace,'{"partial":');assert.throws(()=>store.readEvents(),/Incomplete/);
});
test('configuration rejects silently ignored permission/config typos',()=>assert.throws(()=>validateConfig({...DEFAULTS,unknownKey:true}),/Unsupported/));
test('configuration requires a separate text-model slot',()=>assert.throws(()=>validateConfig({...DEFAULTS,mainModel:'typesafe-ai/jev'}),/evaluator slot/));

test('shell and browser actions validate against strict schemas',() => {
  assert.throws(() => validateAction({ type: 'shell' }), /required/);
  assert.throws(() => validateAction({ type: 'shell', command: 'ls', extra: 1 }), /unsupported/);
  assert.throws(() => validateAction({ type: 'browser', url: 'ftp://bad' }), /http/);
  assert.throws(() => validateAction({ type: 'browser', url: 'file:///etc/passwd' }), /http/);

  assert.doesNotThrow(() => validateAction({ type: 'shell', command: 'echo ok' }));
  assert.doesNotThrow(() => validateAction({ type: 'browser', url: 'https://example.com' }));
});

test('approved shell command returns actual output and exit code', async t => {
  const { runtime } = rig(t, {
    actions: [{ type: 'shell', command: 'echo "shell-ok" && exit 0' }],
    config: { allowExec: true }
  });
  await runtime.run();
  const r = runtime.state.observations[0].result;
  assert.equal(r.exitCode, 0);
  assert.match(r.stdout, /shell-ok/);
  assert.equal(runtime.state.pending, null);
});

test('shell command environment does not receive the Gateway API key', async t => {
  const previous = process.env.AI_GATEWAY_API_KEY;
  process.env.AI_GATEWAY_API_KEY = 'secret-gateway-token';
  t.after(() => {
    if (previous === undefined) delete process.env.AI_GATEWAY_API_KEY;
    else process.env.AI_GATEWAY_API_KEY = previous;
  });
  const { runtime } = rig(t, {
    actions: [{ type: 'shell', command: 'echo "KEY:${AI_GATEWAY_API_KEY:-UNSET}"' }],
    config: { allowExec: true }
  });
  await runtime.run();
  assert.match(runtime.state.observations[0].result.stdout, /KEY:UNSET/);
});

test('browser action fetches and formats web page content', async t => {
  const { runtime } = rig(t, {
    actions: [{ type: 'browser', url: 'https://example.com' }]
  });
  await runtime.run();
  const r = runtime.state.observations[0].result;
  assert.equal(r.url, 'https://example.com');
  assert.match(r.title, /Example Domain/);
  assert.ok(r.content.length > 0);
  assert.ok(Array.isArray(r.links));
});
