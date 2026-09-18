import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import path from 'node:path';
import { createAdaptive } from '../src/index.mjs';
import { hash } from '../src/core.mjs';
import { fixture,mockJev,profile,template,principal,deferred,scope,rows } from './helpers.mjs';
const agents={admin:profile('coordinates the work',['helper']),engineer:profile('implements bounded changes',['helper']),reviewer:profile('reviews completed work')};
const templates={helper:template('temporary local helper')};
function activationFixture(t,options={}) {
  const invocations=[];
  const f=fixture(t,{config:{agents,templates},swarm:{runResident:async args=>{invocations.push(args);return {note:'host resident result'};},runSubagent:async args=>{invocations.push(args);return {note:'host subagent result'};}},...options});
  const rootId=f.ext.actors.beginRoot({task:'Explain and check a local example',permissions:['read','note']});
  return {...f,rootId,invocations};
}
test('registered residents are sleeping and cost nothing at startup',t=>{
  const {ext,jev,invocations}=activationFixture(t);assert.ok(ext.actors.status().agents.every(a=>a.status==='SLEEPING'));assert.equal(jev.calls.length,0);assert.equal(invocations.length,0);
});
test('one authorized resident wakes without activating peers',async t=>{
  const {ext,rootId,invocations,jev}=activationFixture(t);const r=await ext.actors.runResident({rootId,agentId:'engineer',task:'Read the supplied example'});assert.equal(r.status,'COMPLETED');assert.equal(invocations.length,1);assert.equal(invocations[0].agentId,'engineer');assert.equal(jev.calls.length,1);assert.ok(ext.actors.status().agents.every(a=>a.status==='SLEEPING'));
});
test('dispatch lets Jev select one eligible existing resident',async t=>{
  const {ext,rootId,invocations}=activationFixture(t);await ext.actors.dispatch({rootId,task:'Coordinate this example',event:'TASK_ASSIGNED'});assert.equal(invocations.length,1);assert.equal(invocations[0].agentId,'admin');
});
test('Jev sleep answer invokes no resident',async t=>{
  const {ext,rootId,invocations}=activationFixture(t,{jev:mockJev({activate:false})});const r=await ext.actors.runResident({rootId,agentId:'engineer',task:'An unnecessary task'});assert.equal(r.status,'SLEEPING');assert.equal(invocations.length,0);
});
test('event filter avoids evaluator spend and wakeups',async t=>{
  const {ext,rootId,jev}=activationFixture(t);const r=await ext.actors.runResident({rootId,agentId:'engineer',task:'An example',event:'CHATTER'});assert.equal(r.status,'SLEEPING');assert.equal(jev.calls.length,0);
});
test('manual-only member requires authenticated direct request and still consults Jev',async t=>{
  const manual={...agents,engineer:{...agents.engineer,manualOnly:true}};const {ext,rootId,jev,invocations}=activationFixture(t,{config:{agents:manual,templates}});
  assert.equal((await ext.actors.runResident({rootId,agentId:'engineer',task:'An example'})).status,'SLEEPING');assert.equal(jev.calls.length,0);
  await ext.actors.runResident({rootId,agentId:'engineer',task:'An example',principal});assert.equal(jev.calls.length,1);assert.equal(invocations.length,1);
});
test('disabled residents cannot be force-woken by direct request',async t=>{
  const {ext,rootId,jev}=activationFixture(t,{config:{agents:{...agents,engineer:{...agents.engineer,enabled:false}},templates}});assert.equal((await ext.actors.runResident({rootId,agentId:'engineer',task:'An example',principal})).status,'SLEEPING');assert.equal(jev.calls.length,0);
});
test('resident may invoke a Jev-gated temporary subagent and retain identity',async t=>{
  const seen=[];const {ext,rootId,jev}=activationFixture(t,{swarm:{runResident:async args=>{seen.push(args.agentId);const r=await args.delegate({templateId:'helper',task:'Check the example',permissions:['read']});return r.result;},runSubagent:async args=>{seen.push(args.instanceId);assert.deepEqual(args.permissions,['read']);assert.equal(args.templateId,'helper');return 'checked';}}});
  const result=await ext.actors.runResident({rootId,agentId:'engineer',task:'Read the example'});assert.equal(result.result,'checked');assert.equal(seen[0],'engineer');assert.match(seen[1],/^child_/);assert.equal(jev.calls.length,2);
});
test('delegation capability expires when parent sleeps',async t=>{
  let delegate;const {ext,rootId}=activationFixture(t,{swarm:{runResident:async args=>{delegate=args.delegate;return 'done';},runSubagent:async()=>''}});await ext.actors.runResident({rootId,agentId:'engineer',task:'Example'});assert.throws(()=>delegate({templateId:'helper',task:'late task'}),/currently running/);
});
test('child cannot escalate permission envelope',async t=>{
  let denied;const {ext,rootId,jev}=activationFixture(t,{swarm:{runResident:async args=>{try{await args.delegate({templateId:'helper',task:'An example',permissions:['execute']});}catch(e){denied=e;}return 'done';},runSubagent:async()=>''}});await ext.actors.runResident({rootId,agentId:'engineer',task:'Example'});assert.match(denied.message,/escalation/);assert.equal(jev.calls.length,1);
});
test('unconfigured child templates are denied before model request',async t=>{
  let denied;const {ext,rootId,jev}=activationFixture(t,{swarm:{runResident:async args=>{try{await args.delegate({templateId:'invented',task:'An example'});}catch(e){denied=e;}return 'done';},runSubagent:async()=>''}});await ext.actors.runResident({rootId,agentId:'engineer',task:'Example'});assert.match(denied.message,/not allowed/);assert.equal(jev.calls.length,1);
});
test('shared root activation cap counts declined requests',async t=>{
  const {ext,rootId,jev}=activationFixture(t,{config:{agents,templates,activation:{maxRootActivations:1}},jev:mockJev({activate:false})});await ext.actors.runResident({rootId,agentId:'engineer',task:'Example'});await assert.rejects(()=>ext.actors.runResident({rootId,agentId:'engineer',task:'Example'}),/cap reached/);assert.equal(jev.calls.length,1);
});
test('parent child-attempt cap is not reset between requests',async t=>{
  let denied;const {ext,rootId}=activationFixture(t,{config:{agents,templates,activation:{maxChildren:1}},swarm:{runResident:async args=>{await args.delegate({templateId:'helper',task:'First'});try{await args.delegate({templateId:'helper',task:'Second'});}catch(e){denied=e;}return 'done';},runSubagent:async()=>''}});await ext.actors.runResident({rootId,agentId:'engineer',task:'Example'});assert.match(denied.message,/child-attempt cap/);
});
test('bounded recursive subagents stop at maxDepth',async t=>{
  let denied;const recursive={helper:template('helper',['helper'])};const {ext,rootId}=activationFixture(t,{config:{agents,templates:recursive,activation:{maxDepth:1}},swarm:{runResident:async a=>(await a.delegate({templateId:'helper',task:'first'})).result,runSubagent:async a=>{try{await a.delegate({templateId:'helper',task:'second'});}catch(e){denied=e;}return 'done';}}});await ext.actors.runResident({rootId,agentId:'engineer',task:'Example'});assert.match(denied.message,/depth cap/);
});
test('concurrency cap rejects extra dispatch instead of waiting in a deadlock',async t=>{
  const started=deferred(),release=deferred();const {ext,rootId,jev}=activationFixture(t,{config:{agents,templates,activation:{maxConcurrent:1}},swarm:{runResident:async()=>{started.resolve();await release.promise;return 'done';}}});const running=ext.actors.runResident({rootId,agentId:'engineer',task:'Example'});await started.promise;await assert.rejects(()=>ext.actors.runResident({rootId,agentId:'admin',task:'Other'}),/concurrency cap/);release.resolve();await running;assert.equal(jev.calls.length,1);
});
test('same resident cannot be concurrently reentered',async t=>{
  const entered=deferred(),release=deferred();const {ext,rootId}=activationFixture(t,{swarm:{runResident:async()=>{entered.resolve();await release.promise;return 'done';}}});const running=ext.actors.runResident({rootId,agentId:'engineer',task:'Example'});await entered.promise;await assert.rejects(()=>ext.actors.runResident({rootId,agentId:'engineer',task:'Other'}),/already active/);release.resolve();await running;
});
test('policy change while Jev evaluates invalidates activation',async t=>{
  const entered=deferred(),release=deferred(),mock=mockJev();const {ext,rootId,invocations}=activationFixture(t,{jev:mockJev({onEvaluate:async args=>{entered.resolve();await release.promise;return mock.evaluate(args);}})});const p=ext.actors.runResident({rootId,agentId:'engineer',task:'Example'});await entered.promise;ext.controls.configure(principal,{activation:{maxDepth:0}});release.resolve();await assert.rejects(p);assert.equal(invocations.length,0);
});
test('task version change while Jev evaluates invalidates activation',async t=>{
  const entered=deferred(),release=deferred(),mock=mockJev();const {ext,rootId,invocations}=activationFixture(t,{jev:mockJev({onEvaluate:async args=>{entered.resolve();await release.promise;return mock.evaluate(args);}})});const p=ext.actors.runResident({rootId,agentId:'engineer',task:'Example'});await entered.promise;ext.actors.updateRoot(rootId,'new-steering-version');release.resolve();await assert.rejects(p,/Task state changed/);assert.equal(invocations.length,0);
});
test('ordinary learning updates do not stop active agent',async t=>{
  let extension;const {ext,rootId}=activationFixture(t,{swarm:{runResident:async args=>{const d=extension.decisions.choose(rows,{learningKey:'test',continuityKey:'test'}).decision;extension.recordOutcome({observationId:'o1',decisionId:d.id,passed:true,checker:'test'});args.assertCurrent();return 'done';}}});extension=ext;assert.equal((await ext.actors.runResident({rootId,agentId:'engineer',task:'Example'})).status,'COMPLETED');
});
test('interrupted active callback leaves review record and blocks replay',async t=>{
  const {ext,rootId}=activationFixture(t,{swarm:{runResident:async()=>{throw new Error('host interrupted');}}});await assert.rejects(()=>ext.actors.runResident({rootId,agentId:'engineer',task:'Example'}),/interrupted/);const job=ext.actors.status().jobs[0];assert.equal(job.status,'NEEDS_REVIEW');await assert.rejects(()=>ext.actors.runResident({rootId,agentId:'engineer',task:'Example'}),/uncertain/);ext.actors.reconcile(principal,job.id,'Inspected workspace; no unexpected effect remains.');assert.equal(ext.actors.status().jobs[0].status,'REVIEWED');
});
test('activation timeout quarantines an uncooperative host callback',async t=>{
  const never=deferred();const {ext,rootId}=activationFixture(t,{config:{agents,templates,activation:{timeoutMs:100}},swarm:{runResident:async()=>{await never.promise;return 'late';}}});await assert.rejects(()=>ext.actors.runResident({rootId,agentId:'engineer',task:'Example'}),/deadline/);assert.equal(ext.actors.status().jobs[0].status,'NEEDS_REVIEW');never.resolve();
});
test('root permissions cannot be escalated by supplying unknown runResident fields',async t=>{
  const {ext,rootId,invocations}=activationFixture(t);await ext.actors.runResident({rootId,agentId:'engineer',task:'Example',permissions:['execute']});assert.deepEqual(invocations[0].permissions,['note','read']);
});
test('closed roots reject future activation and may be explicitly archived',async t=>{
  const {ext,rootId}=activationFixture(t);ext.actors.closeRoot(rootId);await assert.rejects(()=>ext.actors.runResident({rootId,agentId:'engineer',task:'Example'}),/closed/);ext.actors.archiveRoot(principal,rootId);assert.equal(ext.actors.status().roots.length,0);
});
test('persisted RUNNING jobs become NEEDS_REVIEW after restart without automatic replay',async t=>{
  const {ext,rootId,dir}=activationFixture(t);await ext.actors.runResident({rootId,agentId:'engineer',task:'Example'});await ext.close();
  const file=path.join(dir,hash(scope).slice(0,32),'adaptive.json');const envelope=JSON.parse(readFileSync(file,'utf8'));Object.values(envelope.state.jobs)[0].status='RUNNING';envelope.digest=hash(envelope.state);writeFileSync(file,JSON.stringify(envelope));
  const mock=mockJev(),reopened=createAdaptive({directory:dir,scope,jev:mock,allowMocks:true});assert.equal(reopened.actors.status().jobs[0].status,'NEEDS_REVIEW');assert.equal(mock.calls.length,0);await reopened.close();
});

test('style correction steers through host callback without shutting down resident',async t=>{
  const started=deferred(),release=deferred();let steered=false;
  const {ext,rootId}=activationFixture(t,{onCorrection:()=>{steered=true;},swarm:{runResident:async args=>{started.resolve();await release.promise;args.assertCurrent();return 'done';}}});
  const running=ext.actors.runResident({rootId,agentId:'engineer',task:'Example'});await started.promise;ext.controls.correct(principal,{text:'Be concise'});assert.equal(steered,true);release.resolve();assert.equal((await running).status,'COMPLETED');
});
