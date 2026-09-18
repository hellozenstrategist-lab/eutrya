import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { rig, proposal } from './helpers.mjs';
import { MockJev, DemoCortex, ScriptedCortex } from '../src/providers/mock.mjs';
import { makePuzzle, PUZZLE_TASK } from '../src/puzzle.mjs';
import { packetOf } from '../src/memory.mjs';
import { Store } from '../src/store.mjs';
import { Eutrya } from '../src/runtime.mjs';
import { Toolbox } from '../src/tools.mjs';

test('runtime calls Jev before the model and before execution without voluntary invocation',async t=>{
  const events=[];const {runtime}=rig(t,{events});await runtime.run();
  const types=events.map(e=>e.type);
  assert.ok(types.indexOf('jev.control')<types.indexOf('cortex.proposal'));
  assert.ok(types.indexOf('decision')<types.indexOf('observation'));
  assert.equal(runtime.state.meter.jevCalls,2);assert.equal(runtime.state.meter.cortexCalls,1);
  assert.equal(runtime.state.status,'ANSWERED');
});
test('runtime enforces a different evaluator-selected candidate',async t=>{
  const {runtime}=rig(t,{actions:[{type:'note',text:'Bad first ordering'},{type:'note',text:'Evaluator selected this'}],jev:new MockJev({prefer:'b'})});
  await runtime.run();assert.equal(runtime.state.observations[0].action.text,'Evaluator selected this');
});
test('control failure blocks main-model calls and all actions',async t=>{
  const jev=new MockJev();jev.control=async()=>{throw new Error('Jev unavailable');};
  const {runtime,model}=rig(t,{jev});await runtime.run();
  assert.equal(model.index,0);assert.equal(runtime.state.totalSteps,0);assert.equal(runtime.state.status,'ERROR');assert.equal(runtime.state.meter.calls,1);
});
test('rank failure blocks execution after a main-model proposal',async t=>{
  const jev=new MockJev();jev.rank=async()=>{throw new Error('Jev unavailable');};
  const {runtime}=rig(t,{jev});await runtime.run();assert.equal(runtime.state.totalSteps,0);assert.equal(runtime.state.status,'ERROR');
});
test('malformed evaluation is fail-closed',async t=>{
  const jev=new MockJev();jev.control=async()=>({data:{},usage:{}});
  const {runtime}=rig(t,{jev});await runtime.run();assert.equal(runtime.state.totalSteps,0);assert.equal(runtime.state.status,'ERROR');
});
test('malformed proposal does not execute a tool',async t=>{
  const cortex={source:'mock',propose:async()=>({data:'not json',usage:{}})};
  const {runtime}=rig(t,{cortex});await runtime.run();assert.equal(runtime.state.totalSteps,0);assert.equal(runtime.state.meter.calls,2);
});
test('hard provider-attempt budget counts calls before dispatch',async t=>{
  const {runtime}=rig(t,{config:{maxCalls:2}});await runtime.run();assert.equal(runtime.state.meter.calls,2);assert.equal(runtime.state.totalSteps,0);assert.equal(runtime.state.status,'PAUSED');
});
test('HTTP retries consume separate budget reservations',async t=>{
  const jev=new MockJev();const original=jev.control.bind(jev);let calls=0;
  jev.control=async(...args)=>{if(calls++===0){const e=new Error('busy');e.statusCode=429;throw e;}return original(...args);};
  const {runtime}=rig(t,{jev,config:{retries:1}});await runtime.run();
  assert.equal(runtime.state.meter.calls,4);assert.equal(runtime.state.meter.unpricedCalls,1);assert.equal(runtime.state.status,'ANSWERED');
});
test('timeout is not retried and cannot execute a delayed result',async t=>{
  const jev=new MockJev();let calls=0;jev.control=async()=>{calls++;return new Promise(()=>{});};
  const {runtime}=rig(t,{jev,config:{timeoutMs:25,retries:2}});await runtime.run();assert.equal(calls,1);assert.equal(runtime.state.totalSteps,0);assert.match(runtime.state.reason,/timeout/);
});
test('stop cancels an in-flight evaluation and pauses',async t=>{
  const jev=new MockJev();jev.control=async()=>new Promise(()=>{});
  const {runtime}=rig(t,{jev});const running=runtime.run();setTimeout(()=>runtime.stop(),10);await running;
  assert.equal(runtime.state.status,'PAUSED');assert.equal(runtime.state.totalSteps,0);
});
test('steering received during a proposal discards that proposal before action',async t=>{
  let runtime,calls=0;
  const cortex={source:'mock',propose:async()=>{
    calls++;if(calls===1)runtime.steer('Use the corrected direction.');
    return {data:proposal([{type:'note',text:calls===1?'STALE':'FRESH'}]),usage:{}};
  }};
  ({runtime}=rig(t,{cortex}));await runtime.run();
  assert.equal(runtime.state.observations.length,1);assert.equal(runtime.state.observations[0].action.text,'FRESH');assert.equal(calls,2);
});
test('the actual selected attention mode is supplied to the main model',async t=>{
  let seen;const cortex={source:'mock',propose:async(_packet,a)=>{seen=a.mode;return {data:proposal([{type:'note',text:'Evidence gathered'}]),usage:{}};}};
  const {runtime}=rig(t,{cortex});await runtime.run();assert.equal(seen,'observe');
});
test('generic answers are never automatically VERIFIED',async t=>{
  const {runtime}=rig(t);await runtime.run();assert.equal(runtime.state.status,'ANSWERED');assert.equal(runtime.state.observations[0].result.verification,'NOT_INDEPENDENTLY_VERIFIED');
});
test('independent puzzle checker rejects a confident but premature finish',async t=>{
  const {runtime}=rig(t,{environment:makePuzzle(1)});await runtime.run();assert.equal(runtime.state.status,'PAUSED');assert.equal(runtime.state.observations[0].result.verification,'FAILED');
});
test('offline switchboard demo learns through observations and reaches verified completion',async t=>{
  const {runtime}=rig(t,{environment:makePuzzle(7),cortex:new DemoCortex(),config:{maxSteps:24}});runtime.startTask(PUZZLE_TASK);await runtime.run();
  assert.equal(runtime.state.status,'VERIFIED');assert.equal(runtime.state.meter.calls,runtime.state.totalSteps*3);
});
test('hidden puzzle state never enters a model/evaluator packet',t=>{
  const {runtime}=rig(t,{environment:makePuzzle(1)});const p=packetOf(runtime.state);assert.ok(!('environment'in p));assert.ok(!JSON.stringify(p).includes('masks'));assert.ok(!JSON.stringify(p).includes('seed'));
});
test('compaction preserves metering and full observation archive',t=>{
  const {runtime,store}=rig(t);for(let i=0;i<20;i++)runtime.observe({type:'note',text:'note '+i},{value:i});
  runtime.state.meter.calls=17;runtime.compact();assert.equal(runtime.state.observations.length,12);assert.equal(runtime.state.meter.calls,17);assert.equal(store.recall('o1').result.value,0);
});
test('state/usage persist across a session restart',async t=>{
  const r=rig(t);await r.runtime.run();const id=r.store.state.id;r.store.close();
  const s=new Store(r.settings.sessionRoot,r.workspace,{id,existing:true,redact:x=>x});
  t.after(()=>s.close());assert.equal(s.state.meter.calls,3);assert.equal(s.state.status,'ANSWERED');
});
test('pending effects prevent automatic replay on resume',async t=>{
  const {runtime}=rig(t);runtime.state.pending={candidate:proposal([{type:'run',program:'echo',args:['x']}]).candidates[0]};
  await assert.rejects(()=>runtime.run(),/uncertain outcome/);assert.equal(runtime.state.meter.calls,0);
});
test('human reconciliation records an assertion rather than verified evidence',t=>{
  const {runtime}=rig(t);runtime.state.pending={candidate:proposal([{type:'note',text:'pending'}]).candidates[0]};
  runtime.resolve('I inspected the file; it was not changed.');assert.equal(runtime.state.pending,null);assert.equal(runtime.state.observations[0].result.independentlyVerified,false);
});
test('denied writes produce an observation without creating files',async t=>{
  const {runtime,workspace}=rig(t,{actions:[{type:'write',path:'new.txt',content:'hello',expectedSha256:null}],approve:async()=>false});
  await runtime.run();assert.ok(!fs.existsSync(path.join(workspace,'new.txt')));assert.equal(runtime.state.observations[0].result.denied,true);assert.equal(runtime.state.pending,null);
});
test('approved writes create a durable result, backup, and cleared journal',async t=>{
  const {runtime,workspace,store}=rig(t,{actions:[{type:'write',path:'new.txt',content:'hello',expectedSha256:null}]});
  await runtime.run();assert.equal(fs.readFileSync(path.join(workspace,'new.txt'),'utf8'),'hello');assert.equal(runtime.state.pending,null);
  const observation=runtime.state.observations[0];assert.ok(fs.existsSync(path.join(store.dir,'backups',observation.result.backupId+'.json')));
  assert.equal(store.read().pending,null);
});
test('repeated identical action/result pairs stop a loop',async t=>{
  const p=proposal([{type:'list',path:'.'}]);const {runtime}=rig(t,{proposals:[p,p,p,p],config:{maxSteps:10}});await runtime.run();
  assert.equal(runtime.state.totalSteps,3);assert.equal(runtime.state.status,'PAUSED');assert.match(runtime.state.reason,/unproductive loop/);
});
test('a disabled process is rejected even when the model proposes it',async t=>{
  const {runtime}=rig(t,{actions:[{type:'run',program:'echo',args:['x']}]});await runtime.run();assert.equal(runtime.state.totalSteps,0);assert.match(runtime.state.reason,/No eligible/);
});
test('jev.rank input budgeting stays within maxPromptChars even with full observations',async t=>{
  const {runtime}=rig(t,{config:{maxPromptChars:12000}});
  for(let i=0;i<10;i++) {
    runtime.observe({type:'note',text:`Note observation step ${i}`},{data:'x'.repeat(1000)});
  }
  const largeProposal=proposal([
    {type:'finish',answer:'Candidate A finished with answer '+('a'.repeat(300))},
    {type:'note',text:'Candidate B with large description '+('b'.repeat(300))}
  ]);
  largeProposal.summary='Long summary describing work on the harness '.repeat(10);
  runtime.cortex={source:'mock',propose:async()=>({data:largeProposal,usage:{}})};
  await runtime.run();
  assert.equal(runtime.state.status,'ANSWERED');
  assert.ok(runtime.state.totalSteps>=1);
});
