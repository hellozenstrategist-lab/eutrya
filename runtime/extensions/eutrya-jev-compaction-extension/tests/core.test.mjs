import test from 'node:test';import assert from 'node:assert/strict';
import {resolveOptions} from '../src/options.mjs';
import {collectToolCalls,fitState,estimateTokens,validateMessages,probability} from '../src/core.mjs';
import {messages,setup,request,fakeAsker} from './helpers.mjs';

test('low relevance removes old completed pairs; user text and recent pairs survive',async t=>{
  const {compactor}=setup(t),ms=messages();const before=structuredClone(ms);const r=await compactor.compact(request(ms));
  assert.equal(r.status,'compacted');assert.deepEqual(ms,before);assert.equal(r.messages[0].text,ms[0].text);
  const ids=r.messages.flatMap(m=>m.toolUses.map(t=>t.tool_use_id));assert.deepEqual(ids,['o6','o7','o8']);assert.ok(r.stats.after<r.stats.before);
});
test('recent preservation considers both call and result positions',async t=>{
  const {compactor}=setup(t,{options:{preserveRecentMessages:1}});const ms=messages(4);const r=ms.splice(2,1)[0];ms.push(r);
  const out=await compactor.compact(request(ms));assert.ok(out.messages.some(m=>m.toolUses.some(t=>t.tool_use_id==='o1')));
});
test('first message tool is pinned',async t=>{
  const {compactor}=setup(t);const ms=messages();ms[0].toolUses=ms[1].toolUses;ms[1].toolUses=[];
  const r=await compactor.compact(request(ms));assert.equal(r.decisions.find(d=>d.tool_use_id==='o1').action,'keep');
});
test('high result score preserves call even with a low call score',async t=>{
  const {compactor}=setup(t,{asker:fakeAsker({callProb:0,resultProb:1})});const ms=messages();const r=await compactor.compact(request(ms));assert.equal(r.status,'held');assert.deepEqual(r.messages,ms);
});
test('call retained with preview and archive pointer when only output is stale',async t=>{
  const {compactor}=setup(t,{asker:fakeAsker({callProb:1,resultProb:0})});const r=await compactor.compact(request(messages()));
  assert.equal(r.status,'compacted');assert.equal(r.messages.flatMap(m=>m.toolUses).length,8);
  assert.match(r.messages[2].toolResults[0].text,/archive=[a-f0-9]{64}/);assert.match(r.messages[2].toolResults[0].text,/Recall the original/);
});
test('short results are not enlarged by adding archive notices',async t=>{
  const {compactor}=setup(t,{asker:fakeAsker({callProb:1,resultProb:0})});const ms=messages(8,3);const r=await compactor.compact(request(ms));assert.deepEqual(r.messages,ms);assert.equal(r.status,'held');
});
test('threshold equality keeps rather than drops',async t=>{
  const {compactor}=setup(t,{asker:fakeAsker({prob:.35})});const r=await compactor.compact(request(messages()));assert.equal(r.status,'held');
});
test('pending call remains even without a result',async t=>{
  const {compactor}=setup(t);const ms=messages();ms.splice(2,1);const r=await compactor.compact(request(ms));assert.equal(r.decisions[0].reason,'incomplete');
});
for(const kind of ['write','edit','run','mkdir','mcp','spawn','note','finish'])test(`non-eligible ${kind} is protected`,async t=>{
  const {compactor}=setup(t);const ms=messages();ms[1].toolUses[0].tool=kind;const r=await compactor.compact(request(ms));assert.equal(r.decisions[0].reason,'non-eligible-tool');assert.equal(r.decisions[0].action,'keep');
});
test('error observations are protected by default',async t=>{
  const {compactor}=setup(t);const ms=messages();ms[2].toolResults[0].isError=true;const r=await compactor.compact(request(ms));assert.equal(r.decisions[0].reason,'error');
});
test('an explicit pin overrides a zero Jev score',async t=>{
  const {compactor}=setup(t);const r=await compactor.compact(request(messages(),{pinnedCallIds:['o2']}));assert.equal(r.decisions[1].reason,'explicit');
});
test('a pin for an absent call is rejected rather than silently ignored',async t=>{
  const {compactor}=setup(t);await assert.rejects(compactor.compact(request(messages(),{pinnedCallIds:['missing']})),{code:'PIN'});
});
test('all user, assistant and system text stays exact and in order',async t=>{
  const {compactor}=setup(t);const ms=messages();ms[1].text='Reasoned explanation\nwith exact path src/a.ts';ms.splice(3,0,{role:'system',text:'System constraints.',toolUses:[]});ms[4].text='  \n';
  const r=await compactor.compact(request(ms));assert.deepEqual(r.messages.filter(m=>m.text!== '').map(m=>m.text),ms.filter(m=>m.text!== '').map(m=>m.text));
});
test('arbitrary message and result metadata survive reconstruction',async t=>{
  const {compactor}=setup(t,{asker:fakeAsker({callProb:1,resultProb:0})});const ms=messages();ms[2].attachments=[{type:'reference',id:'blob7'}];ms[2].toolResults[0].metadata={encoding:'text'};
  const r=await compactor.compact(request(ms));assert.deepEqual(r.messages[2].attachments,ms[2].attachments);assert.deepEqual(r.messages[2].toolResults[0].metadata,{encoding:'text'});
});
test('system/developer tool calls are never candidates',async t=>{
  const {compactor}=setup(t);const ms=messages();ms[1].role='developer';const r=await compactor.compact(request(ms));assert.equal(r.decisions[0].reason,'instruction');
});
for(const kind of ['orphan','duplicate-call','duplicate-result','result-before-call','inline-output'])test(`${kind} is rejected before inference`,async t=>{
  const {compactor,asker}=setup(t);const ms=messages();
  if(kind==='orphan')ms[2].toolResults[0].tool_use_id='missing';
  if(kind==='duplicate-call')ms[3].toolUses[0].tool_use_id='o1';
  if(kind==='duplicate-result')ms[4].toolResults[0].tool_use_id='o1';
  if(kind==='result-before-call')[ms[1],ms[2]]=[ms[2],ms[1]];
  if(kind==='inline-output')ms[1].toolUses[0].text='inline';
  await assert.rejects(compactor.compact(request(ms)));assert.equal(asker.calls.length,0);
});
test('unknown configuration keys fail explicitly',()=>assert.throws(()=>resolveOptions({pretendFast:true}),{code:'OPTIONS'}));
for(const patch of [{keepThreshold:NaN},{keepThreshold:1},{maxConcurrency:100},{maxBatches:0},{targetRatio:.8},{eligibleTools:['read','read']},{preserveRecentMessages:-1}])test(`invalid option ${JSON.stringify(patch)}`,()=>assert.throws(()=>resolveOptions(patch),{code:'OPTIONS'}));
test('token estimator handles digits, symbols and Unicode without claiming exact tokens',()=>{assert.equal(estimateTokens(''),0);assert.ok(estimateTokens('{"123":"你好🌍"}')>0);});
test('malformed roles and non-JSON values fail validation',()=>{
  const o=resolveOptions(),ms=messages();ms[0].role='banana';assert.throws(()=>validateMessages(ms,o));ms[0].role='user';ms[1].toolUses[0].input.x=()=>0;assert.throws(()=>validateMessages(ms,o));
});
test('evaluator state can shrink while output conversation text remains untouched',async t=>{
  const {compactor,asker}=setup(t,{options:{maxStateTokens:4000,maxRequestTokens:8000}});const ms=messages();ms[3].text='Long exact wording. '.repeat(4000);
  const r=await compactor.compact(request(ms));assert.match(r.stats.stateStage,/abridged|compact/);assert.ok(r.messages.some(m=>m.text===ms[3].text));assert.ok(JSON.stringify(asker.calls[0].state).length<JSON.stringify(ms).length);
});
for(const value of [-.01,1.01,NaN,Infinity,'0.9',null])test(`invalid probability ${String(value)} is rejected`,()=>assert.throws(()=>probability({x:{type:'boolean',probability:value}},'x'),{code:'ANSWER'}));
test('raw TypeSafe noul response cannot be confused with Vercel boolean response',()=>assert.throws(()=>probability({x:{noul:.1}},'x'),{code:'ANSWER'}));
