import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture,mockJev,pick,bool,principal,deferred,rows } from './helpers.mjs';
import { handleAdaptiveCommand } from '../src/commands.mjs';

test('simple explanation makes one Jev request and one text request',async t=>{
  const {ext,jev,textCalls}=fixture(t);let chunks='';const r=await ext.replies.maybeReply({task:'Explain a binary tree.'},{onToken:x=>chunks+=x});assert.equal(r.handled,true);assert.equal(jev.calls.length,1);assert.equal(textCalls.length,1);assert.equal(ext.status().meter.calls,2);assert.equal(chunks,r.text);assert.equal(r.verification,'NOT_INDEPENDENTLY_VERIFIED');
});
test('fast text call has no tool or swarm interface',async t=>{
  const {ext,textCalls}=fixture(t);await ext.replies.maybeReply({task:'Explain a stack.'});assert.deepEqual(Object.keys(textCalls[0]).sort(),['maxOutputTokens','messages','onToken','signal']);assert.equal(textCalls[0].maxOutputTokens,384);
});
test('work routing preserves host full deliberation path',async t=>{
  const {ext,textCalls}=fixture(t,{jev:mockJev({route:'work'})});const r=await ext.replies.maybeReply({task:'Edit a file.'});assert.equal(r.handled,false);assert.equal(textCalls.length,0);
});
for(const key of ['requiresTools','needsFreshFacts','highStakes','unresolvedReferences','requiresVerification','forceWork'])test(`host ${key} flag blocks fast lane before model spend`,async t=>{
  const {ext,jev}=fixture(t);const r=await ext.replies.maybeReply({task:'Answer this',flags:{[key]:true}});assert.equal(r.handled,false);assert.equal(jev.calls.length,0);
});
test('low Jev tool-free confidence goes to work',async t=>{
  const {ext}=fixture(t,{jev:mockJev({onEvaluate:async()=>({answers:{route:pick('fast',['fast','work','clarify']),toolFree:bool(0.4)}})})});assert.equal((await ext.replies.plan({task:'A question'})).route,'work');
});
test('bad Jev result fails closed',async t=>{
  const {ext,textCalls}=fixture(t,{jev:mockJev({onEvaluate:async()=>({answers:{route:{type:'choice',choice:'fast',probabilities:{fast:5}},toolFree:bool(1)}})})});await assert.rejects(()=>ext.replies.plan({task:'A question'}),/distribution/);assert.equal(textCalls.length,0);
});
test('Jev outage never becomes ordinary text generation',async t=>{
  const {ext,textCalls}=fixture(t,{jev:mockJev({onEvaluate:async()=>{throw new Error('provider down');}})});await assert.rejects(()=>ext.replies.maybeReply({task:'A question'}),/provider down/);assert.equal(textCalls.length,0);assert.equal(ext.status().meter.calls,1);
});
test('reply permit cannot be reused or fabricated',async t=>{
  const {ext}=fixture(t);const plan=await ext.replies.plan({task:'Explain a list'});await ext.replies.reply(plan.permit);await assert.rejects(()=>ext.replies.reply(plan.permit),/consumed/);await assert.rejects(()=>ext.replies.reply({id:plan.permit.id}),/consumed/);
});
test('correction invalidates a prepared fast reply',async t=>{
  const {ext,textCalls}=fixture(t);const plan=await ext.replies.plan({task:'Explain a list'});ext.controls.correct(principal,{text:'More detail please'});await assert.rejects(()=>ext.replies.reply(plan.permit),/consumed/);assert.equal(textCalls.length,0);
});
test('correction while Jev is routing forces a fresh decision',async t=>{
  const wait=deferred(),entered=deferred();const {ext}=fixture(t,{jev:mockJev({onEvaluate:async()=>{entered.resolve();await wait.promise;return {answers:{route:pick('fast',['fast','work','clarify']),toolFree:bool(1)}};}})});
  const running=ext.replies.plan({task:'Explain a list'});await entered.promise;ext.controls.correct(principal,{text:'More detail'});wait.resolve();await assert.rejects(running,/changed during routing/);
});
test('learned outcomes do not invalidate an unrelated prepared text envelope',async t=>{
  const {ext}=fixture(t);const p=await ext.replies.plan({task:'Explain a list'});const d=ext.decisions.choose(rows,{learningKey:'test',continuityKey:'root'}).decision;ext.recordOutcome({observationId:'o1',decisionId:d.id,passed:true,checker:'unit'});assert.ok((await ext.replies.reply(p.permit)).text);
});
test('stream usage is metered and unknown price remains unknown',async t=>{
  const {ext}=fixture(t);await ext.replies.maybeReply({task:'Explain a list'});const m=ext.status().meter;assert.equal(m.inputTokens,20);assert.equal(m.knownCostUsd,0);assert.equal(m.unpricedCalls,2);
});
test('provider-attempt cap cannot be bypassed by switching lanes',async t=>{
  const {ext,textCalls}=fixture(t,{config:{limits:{maxProviderCalls:1}}});await assert.rejects(()=>ext.replies.maybeReply({task:'Explain a list'}),/cap reached/);assert.equal(textCalls.length,0);
});
test('text output must match streamed text',async t=>{
  const {ext}=fixture(t,{streamText:async({onToken})=>{onToken('A');return {text:'different'};}});await assert.rejects(()=>ext.replies.maybeReply({task:'Explain a list'}),/inconsistent/);
});
test('owner correction propagates into next reply instructions',async t=>{
  const {ext,textCalls}=fixture(t);ext.controls.correct(principal,{text:'More detail please'});await ext.replies.maybeReply({task:'Explain a list'});assert.match(textCalls[0].messages[0].content,/detailed/);assert.equal(textCalls[0].maxOutputTokens,1152);
});
test('abort during text generation stops waiting even when adapter ignores signal',async t=>{
  const started=deferred(),never=deferred(),controller=new AbortController();const {ext}=fixture(t,{streamText:async()=>{started.resolve();await never.promise;return {text:'late'};}});
  const p=ext.replies.maybeReply({task:'Explain a list',signal:controller.signal});await started.promise;controller.abort();await assert.rejects(p,/abort/i);never.resolve();
});
test('CLI command bridge handles feedback, freeze and admin config',async t=>{
  const {ext}=fixture(t);assert.equal((await handleAdaptiveCommand(ext,principal,'/feedback Be concise')).handled,true);await handleAdaptiveCommand(ext,principal,'/adaptive freeze');assert.equal(ext.status().learning.frozen,true);await handleAdaptiveCommand(ext,principal,'/adaptive config {"fast":{"enabled":false}}');assert.equal(ext.status().config.fast.enabled,false);assert.equal((await handleAdaptiveCommand(ext,principal,'/unrelated')).handled,false);
});

test('large context conservatively falls back instead of silently truncating',async t=>{
  const {ext,jev}=fixture(t);const p=await ext.replies.plan({task:'Explain this',context:'x'.repeat(6001)});assert.equal(p.route,'work');assert.equal(jev.calls.length,0);
});
test('plain corrections can be captured without turning quoted task text into feedback',async t=>{
  const {capturePlainCorrection}=await import('../src/commands.mjs');const {ext}=fixture(t);
  assert.equal(capturePlainCorrection(ext,principal,'That was too long.').handled,true);
  assert.equal(capturePlainCorrection(ext,principal,'Explain why people say "be concise".').handled,false);
});
