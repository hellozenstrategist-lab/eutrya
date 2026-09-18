import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rig } from './helpers.mjs';
import { NativeSwarm } from '../src/swarm/swarm.mjs';
import { loadConfig } from '../src/config.mjs';
import { Store, workspaceBucket } from '../src/store.mjs';
import { makeEngine } from '../src/bootstrap.mjs';
import { nativePacket, projectPreviousTasks } from '../extensions/eutrya-jev-compaction-extension/integration/native-v02.mjs';

const scope={profileId:'fixture',userId:'owner',agentId:'admin'};

function attached(t,{prob=0,evaluate=null,config={},events=[]}={}) {
  const r=rig(t,{config,events,compactionScope:scope});
  let calls=0;
  r.evaluator.evaluate=async(state,questions,signal)=>{
    calls++;
    if(evaluate)return evaluate(state,questions,signal,r);
    return {data:Object.fromEntries(Object.keys(questions).map(k=>[k,{type:'boolean',probability:prob}])),usage:{inputTokens:20,outputTokens:0}};
  };
  const add=(n=14,size=3500)=>{
    for(let i=0;i<n;i++)r.runtime.observe({type:'read',path:`f${i}.txt`},{text:`EXACT-${i}\n`+'x'.repeat(size),sha256:'a'.repeat(64)});
    r.store.save();
  };
  return {...r,events,add,compactionCalls:()=>calls};
}

test('active runtime bypasses blind observation eviction and auto-compacts through metered Jev',async t=>{
  const r=attached(t);r.add(60,1200);
  assert.equal(r.runtime.state.observations.length,60,'old >48/last24 eviction must be bypassed');
  const original=r.store.recall('o1');
  const packet=await r.runtime.compaction.packet();
  assert.ok(r.compactionCalls()>0);
  assert.equal(r.runtime.state.meter.calls,r.compactionCalls());
  assert.equal(r.runtime.state.meter.jevCalls,r.compactionCalls());
  assert.ok(r.runtime.state.observations.length<60);
  assert.deepEqual(r.store.recall('o1'),original);
  assert.equal(packet.observationArchive.count,60);
  assert.equal(packet.observationArchive.idRange,'o1..o60');
});

test('automatic work boundary invokes Jev compaction before ordinary decision calls',async t=>{
  const r=attached(t);r.add(14);
  await r.runtime.run();
  const kinds=r.events.filter(e=>e.type==='provider.start').map(e=>e.data.kind);
  assert.equal(kinds[0],'jev.compaction');
  assert.ok(kinds.includes('jev.control'));
  assert.ok(kinds.includes('jev.rank'));
  assert.equal(r.runtime.state.status,'ANSWERED');
  assert.equal(r.runtime.state.meter.calls,r.runtime.state.meter.jevCalls+r.runtime.state.meter.cortexCalls);
});

test('manual compaction preserves task directives notebook pending state and exact retained evidence',async t=>{
  const r=attached(t,{evaluate:async(_s,q)=>({data:Object.fromEntries(Object.keys(q).map(k=>[k,{type:'boolean',probability:k.endsWith('t2')?1:0}])),usage:{}})});
  r.add(12);r.runtime.state.directives=['Keep exact requirement'];r.runtime.state.notebook=[{text:'Approved feedback',verified:false}];
  const task=r.runtime.state.task,directives=structuredClone(r.runtime.state.directives),notebook=structuredClone(r.runtime.state.notebook),original=structuredClone(r.runtime.state.observations[1]);
  const result=await r.runtime.compact();
  assert.equal(result.status,'compacted');
  assert.equal(r.runtime.state.task,task);
  assert.deepEqual(r.runtime.state.directives,directives);
  assert.deepEqual(r.runtime.state.notebook,notebook);
  assert.deepEqual(r.runtime.state.observations.find(o=>o.id==='o2'),original);
  assert.equal(r.runtime.state.pending,null);
});

test('active handler preserves complete directives and notebook before Jev sees protected context',async t=>{
  let protectedContext;
  const r=attached(t,{evaluate:async(state,q)=>{protectedContext=state.protectedContext;return {data:Object.fromEntries(Object.keys(q).map(k=>[k,{type:'boolean',probability:0}])),usage:{}};}});
  for(let i=0;i<15;i++)r.runtime.steer(`directive-${i}`);r.runtime.applySteering();
  for(let i=0;i<12;i++)r.runtime.observe({type:'note',text:`note-${i}`},{value:i});r.add(12,1000);r.store.save();
  assert.equal(r.runtime.state.directives.length,15);
  assert.equal(r.runtime.state.notebook.length,12);
  await r.runtime.compact();
  assert.deepEqual(protectedContext.directives,r.runtime.state.directives);
  assert.deepEqual(protectedContext.notebook,r.runtime.state.notebook);
});

test('pruned results stay paired and marked previews point to recallable originals',async t=>{
  const r=attached(t,{evaluate:async(_s,q)=>({data:Object.fromEntries(Object.keys(q).map(k=>[k,{type:'boolean',probability:k.startsWith('call_')?1:0}])),usage:{}})});
  r.add(12);const original=structuredClone(r.store.recall('o1').result);
  await r.runtime.compact();
  const preview=r.runtime.state.observations.find(o=>o.id==='o1');
  assert.equal(preview.result._eutryaCompaction,true);
  assert.equal(preview.result.originalObservationId,'o1');
  assert.deepEqual(r.store.recall('o1').result,original);
  assert.ok(preview.result.archiveId);
});

test('partial answer provider failure stale revision and pending effects never prune',async t=>{
  for(const mode of ['partial','failure','stale','pending'])await t.test(mode,async st=>{
    const r=attached(st,{evaluate:async(_s,q,_signal,ctx)=>{
      if(mode==='failure')throw new Error('provider unavailable');
      if(mode==='stale')ctx.runtime.state.revision++;
      if(mode==='partial')return {data:{},usage:{}};
      return {data:Object.fromEntries(Object.keys(q).map(k=>[k,{type:'boolean',probability:0}])),usage:{}};
    }});
    r.add(12);if(mode==='pending')r.runtime.state.pending={status:'execution-may-have-started'};
    const before=structuredClone(r.runtime.state.observations),meter=r.runtime.state.meter.calls;
    await assert.rejects(r.runtime.compact());
    assert.deepEqual(r.runtime.state.observations,before);
    if(mode==='pending')assert.equal(r.runtime.state.meter.calls,meter);
  });
});

test('restore requires operator approval and never rolls back usage or newer evidence',async t=>{
  const r=attached(t);r.add(12);const result=await r.runtime.compact();
  r.runtime.observe({type:'note',text:'later'},{value:123});r.store.save();const calls=r.runtime.state.meter.calls;
  assert.throws(()=>r.runtime.compaction.restore(result.archiveId),/approval/i);
  r.runtime.compaction.restore(result.archiveId,{operatorApproved:true});
  assert.equal(r.runtime.state.meter.calls,calls);
  assert.equal(r.runtime.state.observations.length,13);
  assert.equal(r.runtime.state.observations.at(-1).result.value,123);
});

test('resident compaction archives are isolated by persistent identity',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eutrya-compaction-swarm-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const config=loadConfig(undefined,{sessionRoot:path.join(root,'state'),mainModel:'mock/text'});
  const swarm=new NativeSwarm({config,workspace:root,demo:true});t.after(()=>swarm.close());
  const admin=swarm.getRuntime('admin'),auditor=swarm.getRuntime('auditor');
  assert.ok(admin.compaction&&auditor.compaction);
  assert.notEqual(admin.compaction.archive.key,auditor.compaction.archive.key);
  assert.notEqual(admin.store.dir,auditor.store.dir);
});

test('small adaptive fast-lane reply performs no full-work compaction or resident wake-up',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eutrya-compaction-fast-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const config=loadConfig(undefined,{sessionRoot:path.join(root,'state'),mainModel:'mock/text'});
  const swarm=new NativeSwarm({config,workspace:root,demo:true});t.after(()=>swarm.close());
  const result=await swarm.dispatch('Explain a queue in one sentence',{onToken:()=>{}});
  assert.equal(result.fastLane,true);
  assert.equal(swarm.runtimes.size,0);
  assert.equal(swarm.adaptive.status().meter.jevCalls,1);
});

test('gateway routes and temporary children receive isolated compaction controllers',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eutrya-compaction-scopes-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const config=loadConfig(undefined,{sessionRoot:path.join(root,'sessions'),dataRoot:path.join(root,'data'),mainModel:'mock/text'});
  const wa=path.join(root,'route-a'),wb=path.join(root,'route-b');fs.mkdirSync(wa);fs.mkdirSync(wb);
  const sa=new Store(config.sessionRoot,wa),sb=new Store(config.sessionRoot,wb);t.after(()=>{sa.close();sb.close();});
  const a=makeEngine({store:sa,config,demo:true,namespace:'gateway:telegram:user-a:chat-a'});
  const b=makeEngine({store:sb,config,demo:true,namespace:'gateway:telegram:user-b:chat-b'});
  assert.notEqual(a.compaction.archive.key,b.compaction.archive.key);

  const swarmRoot=path.join(root,'swarm-workspace');fs.mkdirSync(swarmRoot);
  const swarm=new NativeSwarm({config:{...config,sessionRoot:path.join(root,'swarm-state')},workspace:swarmRoot,demo:true});t.after(()=>swarm.close());
  const child=await swarm.runTemporarySubagent({templateId:'helper',instanceId:'child-fixture',task:'Return a bounded fixture answer',permissions:['read'],assertCurrent:()=>{}});
  assert.equal(child.instanceId,'child-fixture');
  const childDir=path.join(workspaceBucket(path.join(swarm.swarmDir,'subagents'),swarmRoot),'child-fixture','jev-compaction');
  assert.ok(fs.existsSync(childDir));
  assert.notEqual(fs.readdirSync(childDir)[0],swarm.getRuntime('admin').compaction.archive.key);
});

test('explicit disable switch is the only path back to legacy windowing',t=>{
  const r=rig(t,{config:{jevCompaction:false},compactionScope:scope});
  assert.equal(r.runtime.compaction,null);
  for(let i=0;i<60;i++)r.runtime.observe({type:'note',text:`n${i}`},{value:i});
  assert.ok(r.runtime.state.observations.length<60);
  const result=r.runtime.compact();
  assert.equal(result.status,'legacy_compacted');
  assert.equal(r.runtime.state.observations.length,12);
  assert.equal(r.runtime.state.meter.calls,0);
});


test('compaction packet bounds accumulated previous task history without mutating durable state',t=>{
  const r=attached(t,{config:{maxPromptChars:12000}});
  r.runtime.state.previousTasks=Array.from({length:80},(_,i)=>({
    task:`prior-task-${i} `+'q'.repeat(3000),
    status:'ANSWERED',
    answer:`prior-answer-${i} `+'a'.repeat(7000)
  }));
  const before=structuredClone(r.runtime.state.previousTasks);
  const packet=nativePacket(r.runtime.state,[]);
  assert.deepEqual(r.runtime.state.previousTasks,before,'packet projection must not rewrite durable history');
  assert.ok(packet.previousTasks.length<=4);
  assert.equal(packet.previousTaskArchive.total,80);
  assert.ok(packet.previousTaskArchive.omitted>=76);
  assert.ok(JSON.stringify(packet.previousTasks).length<=7000);
});

test('previous task projection retains the newest handoffs deterministically',()=>{
  const rows=Array.from({length:10},(_,i)=>({task:`task-${i}`,status:'ANSWERED',answer:`answer-${i}`}));
  const projected=projectPreviousTasks(rows,{maxItems:3,maxChars:6400});
  assert.deepEqual(projected.recent.map(x=>x.task),['task-7','task-8','task-9']);
  assert.equal(projected.total,10);
  assert.equal(projected.omitted,7);
});

test('new task remains runnable after a large legacy previousTasks history',async t=>{
  const r=attached(t,{config:{maxPromptChars:12000}});
  r.runtime.state.previousTasks=Array.from({length:100},(_,i)=>({
    task:`legacy-${i} `+'x'.repeat(3000),
    status:'ANSWERED',
    answer:'y'.repeat(6000)
  }));
  r.runtime.startTask('Fresh bounded task');
  await r.runtime.run();
  assert.equal(r.runtime.state.status,'ANSWERED');
  assert.ok(r.runtime.state.previousTasks.length<=24);
});
