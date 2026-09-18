import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseContextBudget, parseAutoCompact, shouldAutoApproveExec } from '../src/interactive-settings.mjs';
import { loadConfig, updateConfig } from '../src/config.mjs';
import { NativeSwarm } from '../src/swarm/swarm.mjs';

test('context command parser accepts integers and k/m suffixes within reviewed bounds',()=>{
  assert.equal(parseContextBudget('48000'),48000);
  assert.equal(parseContextBudget('64k'),64000);
  assert.equal(parseContextBudget('0.1m'),100000);
  assert.equal(parseContextBudget(''),null);
  assert.throws(()=>parseContextBudget('3k'),/4k/);
  assert.throws(()=>parseContextBudget('201k'),/200k/);
  assert.throws(()=>parseContextBudget('64kb'),/Use \/context/);
});

test('autocompact parser accepts explicit on/off forms and rejects ambiguous values',()=>{
  assert.equal(parseAutoCompact('on'),true);
  assert.equal(parseAutoCompact('enabled'),true);
  assert.equal(parseAutoCompact('off'),false);
  assert.equal(parseAutoCompact('0'),false);
  assert.equal(parseAutoCompact(''),null);
  assert.throws(()=>parseAutoCompact('maybe'),/autocompact on/);
});

test('config updates persist only validated settings',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eutrya-config-update-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const file=path.join(root,'config.json');
  let next=updateConfig(file,{maxPromptChars:64000});
  assert.equal(next.maxPromptChars,64000);
  assert.equal(loadConfig(file).maxPromptChars,64000);
  next=updateConfig(file,{jevCompaction:false});
  assert.equal(next.jevCompaction,false);
  assert.equal(loadConfig(file).maxPromptChars,64000);
  assert.throws(()=>updateConfig(file,{maxPromptChars:3000}),/maxPromptChars/);
});

test('swarm applies context settings live by recycling idle resident runtimes',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eutrya-live-context-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const config=loadConfig(undefined,{sessionRoot:path.join(root,'state'),mainModel:'mock/text'});
  const swarm=new NativeSwarm({config,workspace:root,demo:true});
  t.after(()=>swarm.close());

  const first=swarm.getRuntime('admin');
  assert.equal(first.config.maxPromptChars,48000);
  assert.ok(first.compaction);

  const changed=await swarm.applyRuntimeSettings({maxPromptChars:72000,jevCompaction:false});
  assert.deepEqual(changed,{maxPromptChars:72000,jevCompaction:false});
  assert.equal(swarm.runtimes.size,0);

  const second=swarm.getRuntime('admin');
  assert.notEqual(second,first);
  assert.equal(second.config.maxPromptChars,72000);
  assert.equal(second.compaction,null);
});


test('yolo auto-approval is limited to local run and shell actions',()=>{
  assert.equal(shouldAutoApproveExec(true,{type:'run'}),true);
  assert.equal(shouldAutoApproveExec(true,{type:'shell'}),true);
  assert.equal(shouldAutoApproveExec(true,{type:'write'}),false);
  assert.equal(shouldAutoApproveExec(true,{type:'mcp'}),false);
  assert.equal(shouldAutoApproveExec(false,{type:'run'}),false);
});

test('swarm live settings can temporarily expose and hide execution tools',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eutrya-yolo-tools-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const config=loadConfig(undefined,{sessionRoot:path.join(root,'state'),mainModel:'mock/text',allowExec:false});
  const swarm=new NativeSwarm({config,workspace:root,demo:true});
  t.after(()=>swarm.close());

  let runtime=swarm.getRuntime('admin');
  assert.equal(runtime.toolbox.available().includes('run'),false);

  await swarm.applyRuntimeSettings({allowExec:true});
  runtime=swarm.getRuntime('admin');
  assert.equal(runtime.toolbox.available().includes('run'),true);
  assert.equal(runtime.toolbox.available().includes('shell'),true);

  await swarm.applyRuntimeSettings({allowExec:false});
  runtime=swarm.getRuntime('admin');
  assert.equal(runtime.toolbox.available().includes('run'),false);
});
