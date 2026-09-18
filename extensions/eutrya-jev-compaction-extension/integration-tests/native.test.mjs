import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {installNativeCompaction,nativePacket} from '../integration/native-v02.mjs';
const root=process.env.EUTRYA_NATIVE_ROOT;if(!root)throw new Error('Use npm run verify:native -- /path/to/original/eutrya');
const {rig}=await import(pathToFileURL(path.join(root,'tests/helpers.mjs')));
function attach(t,{prob=0,fn=null,options={},config={}}={}) {
  const r=rig(t,{config});let evalCalls=0;
  r.runtime.jev.evaluate=async(_state,questions,signal)=>{
    evalCalls++;if(fn)return fn(_state,questions,signal,r);
    return {data:Object.fromEntries(Object.keys(questions).map(k=>[k,{type:'boolean',probability:prob}])),usage:{inputTokens:20,outputTokens:0}};
  };
  const ext=installNativeCompaction(r.runtime,{scope:{profileId:'fixture',userId:'owner',sessionId:r.runtime.state.id,agentId:'admin'},options,allowMock:true});
  const add=(n=12,size=3500)=>{for(let i=0;i<n;i++)r.runtime.observe({type:'read',path:`f${i}.txt`},{text:`EXACT-${i}\n`+'x'.repeat(size),sha256:'a'.repeat(64)});r.store.save();};
  return {...r,ext,add,evalCalls:()=>evalCalls};
}
test('real native observe cutoff is disabled only when extension is attached',t=>{
  const {runtime,add}=attach(t);add(60,20);assert.equal(runtime.state.observations.length,60);
});
test('real native auto packet compacts before the next model and retains recall',async t=>{
  const {runtime,ext,store,add,evalCalls}=attach(t);add(14);const original=store.recall('o1');
  const p=await ext.packet();assert.ok(evalCalls()>0);assert.ok(runtime.state.observations.length<14);assert.deepEqual(store.recall('o1'),original);
  assert.equal(runtime.state.meter.jevCalls,1);assert.equal(p.observationArchive.count,14);assert.equal(runtime.state.totalSteps,0);
});
test('actual work loop uses the new automatic packet seam',async t=>{
  const {runtime,add,evalCalls}=attach(t);add(14);await runtime.run();assert.equal(runtime.state.status,'ANSWERED');assert.ok(evalCalls()>0);assert.equal(runtime.state.meter.jevCalls,3);assert.equal(runtime.state.meter.cortexCalls,1);
});
test('real manual /compact replacement preserves budget, notebook, task and summary',async t=>{
  const {runtime,add}=attach(t);add(12);runtime.state.meter.calls=17;runtime.state.notebook.push({text:'Approved feedback',verified:false});runtime.state.summary='Unverified model summary';
  const task=runtime.state.task,notebook=structuredClone(runtime.state.notebook);const r=await runtime.compact();
  assert.equal(r.status,'compacted');assert.equal(runtime.state.meter.calls,18);assert.deepEqual(runtime.state.notebook,notebook);assert.equal(runtime.state.task,task);assert.equal(runtime.state.summary,'Unverified model summary');assert.equal(runtime.busy,false);
});
test('original full evidence survives truncation, active result becomes marked preview',async t=>{
  const {runtime,add,store}=attach(t,{fn:async(_s,q)=>({data:Object.fromEntries(Object.keys(q).map(k=>[k,{type:'boolean',probability:k.startsWith('call_')?1:0}])),usage:{}})});
  add(12);const original=store.recall('o1').result;await runtime.compact();assert.equal(runtime.state.observations[0].result._eutryaCompaction,true);assert.deepEqual(store.recall('o1').result,original);
});
test('outage preserves actual host context and counts attempted request',async t=>{
  const {runtime,add}=attach(t,{fn:async()=>{throw new Error('provider unavailable');}});add();const before=structuredClone(runtime.state.observations);
  await assert.rejects(runtime.compact(),/provider unavailable/);assert.deepEqual(runtime.state.observations,before);assert.equal(runtime.state.meter.calls,1);
});
test('pending effect blocks automatic compaction without a request',async t=>{
  const {runtime,ext,add,evalCalls}=attach(t);add();runtime.state.pending={type:'uncertain'};await assert.rejects(ext.packet(),{code:'PENDING'});assert.equal(evalCalls(),0);
});
test('steering while Jev is evaluating discards the context update',async t=>{
  const {runtime,add}=attach(t,{fn:async(_s,q,_signal,r)=>{r.runtime.steer('New requirement; retain the old work.');return {data:Object.fromEntries(Object.keys(q).map(k=>[k,{type:'boolean',probability:0}])),usage:{}};}});add();const before=structuredClone(runtime.state.observations);
  await assert.rejects(runtime.compact(),/Operator changed direction/);assert.deepEqual(runtime.state.observations,before);assert.ok(runtime.state.directives.includes('New requirement; retain the old work.'));
});
test('material revision race discards stale compaction',async t=>{
  const {runtime,add}=attach(t,{fn:async(_s,q,_signal,r)=>{r.runtime.state.revision++;return {data:Object.fromEntries(Object.keys(q).map(k=>[k,{type:'boolean',probability:0}])),usage:{}};}});add();const before=structuredClone(runtime.state.observations);
  await assert.rejects(runtime.compact(),{code:'STALE'});assert.deepEqual(runtime.state.observations,before);
});
test('protected overflow stops instead of blind slicing',async t=>{
  const {runtime,ext}=attach(t);runtime.state.task='A'.repeat(100000);await assert.rejects(ext.packet(),{code:'CONTEXT_FULL'});
});
test('budget exhaustion leaves history unchanged and never falls back',async t=>{
  const {runtime,add}=attach(t,{config:{maxCalls:1}});add();runtime.state.meter.calls=1;const before=structuredClone(runtime.state.observations);
  await assert.rejects(runtime.compact(),/request limit/);assert.deepEqual(runtime.state.observations,before);
});
test('operator restoration merges original context without rolling back calls or new evidence',async t=>{
  const {runtime,ext,add,store}=attach(t);add();const r=await runtime.compact();runtime.observe({type:'note',text:'New later evidence'},{value:123});store.save();const count=runtime.state.meter.calls;
  assert.throws(()=>ext.restore(r.archiveId),{code:'APPROVAL'});ext.restore(r.archiveId,{operatorApproved:true});assert.equal(runtime.state.observations.length,13);assert.equal(runtime.state.meter.calls,count);assert.equal(runtime.state.observations[0].result.text.startsWith('EXACT-0'),true);assert.equal(runtime.state.observations.at(-1).result.value,123);
});
test('puzzle hidden environment never enters the new native packet',t=>{
  const {runtime}=attach(t);runtime.state.environment={seed:123,hiddenWiring:'SECRET'};const p=nativePacket(runtime.state);assert.ok(!JSON.stringify(p).includes('SECRET'));
});
test('metred requests use original retry accounting',async t=>{
  let n=0;const {runtime,add}=attach(t,{config:{retries:1},fn:async(_s,q)=>{if(n++===0)throw Object.assign(new Error('retryable'),{statusCode:429});return {data:Object.fromEntries(Object.keys(q).map(k=>[k,{type:'boolean',probability:0}])),usage:{}};}});add();await runtime.compact();assert.equal(runtime.state.meter.calls,2);assert.equal(runtime.state.meter.jevCalls,2);
});
test('disabling extension returns host to original behavior',t=>{
  const {runtime,ext,add}=attach(t);ext.uninstall();add(20,10);runtime.compact();assert.equal(runtime.state.observations.length,12);assert.equal(runtime.state.meter.calls,0);
});
test('native stop cancels a manual compaction without losing context',async t=>{
  const {runtime,add}=attach(t,{fn:async()=>new Promise(()=>{})});add();const before=structuredClone(runtime.state.observations);const run=runtime.compact();setTimeout(()=>runtime.stop(),10);await assert.rejects(run,{name:'AbortError'});assert.deepEqual(runtime.state.observations,before);assert.equal(runtime.busy,false);
});
test('small native context does not acquire compaction overhead',async t=>{
  const {runtime,ext,add,evalCalls}=attach(t);add(2,20);await ext.packet();assert.equal(evalCalls(),0);assert.equal(runtime.state.meter.calls,0);
});
test('retained native result objects are not mistaken for truncated JSON due to property order',async t=>{
  const {runtime,add}=attach(t);add(12);const recent=structuredClone(runtime.state.observations.slice(-3));await runtime.compact();
  assert.deepEqual(runtime.state.observations,recent);for(const o of runtime.state.observations)assert.equal(o.result._eutryaCompaction,undefined);
});
test('high-scoring native results remain exactly the original records after a mixed pass',async t=>{
  const {runtime,add}=attach(t,{fn:async(_s,q)=>({data:Object.fromEntries(Object.keys(q).map(k=>[k,{type:'boolean',probability:k.endsWith('t2')?1:0}])),usage:{}})});add(12);const original=structuredClone(runtime.state.observations[1]);await runtime.compact();assert.deepEqual(runtime.state.observations.find(o=>o.id==='o2'),original);
});
