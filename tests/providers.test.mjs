import test from 'node:test';
import assert from 'node:assert/strict';
import { GatewayJev, attentionQuestions, candidateQuestions, researchQuestions } from '../src/providers/jev.mjs';
import { GatewayCortex, cortexMessages, researchMessages, availableModels } from '../src/providers/gateway.mjs';
import { DEFAULTS } from '../src/config.mjs';
import { proposal } from './helpers.mjs';
import { usageOf, redactor, safeTerminal } from '../src/util.mjs';

const config={...DEFAULTS,mainModel:'example/test-text-model'};
const packet={task:'Test only',observations:[]};
const attention={mode:'observe',stagnation:0};
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});

test('Jev uses the typed evaluation entrypoint with the configured model',async()=>{
  let request;
  const jev=new GatewayJev(config,{evaluate:async r=>{request=r;return {answers:{a:{type:'boolean',probability:1}},usage:{inputTokens:12,outputTokens:2}};}});
  const r=await jev.control(packet,new AbortController().signal);
  assert.equal(request.model,'typesafe-ai/jev');assert.equal(request.maxRetries,0);assert.ok(request.abortSignal);
  assert.equal(request.questions.mode.type,'choice');assert.deepEqual(request.state.taskState,packet);
  assert.equal(r.usage.inputTokens,12);assert.equal(r.usage.costUsd,null);
});
test('research Jev question chooses among explicit local candidates and can escalate',()=>{
  const q=researchQuestions([{id:'r1',summary:'Inspect withdraw',expected:'Map calls',action:{type:'code_inspect',path:'Vault.sol',symbol:'withdraw'}},{id:'r2',summary:'Trace balances',expected:'Map writes',action:{type:'code_state',path:'.',symbol:'balances'}}]);
  assert.equal(q.next.type,'choice');assert.deepEqual(Object.keys(q.next.criteria),['r1','r2']);assert.equal(q.escalate.type,'boolean');assert.equal(q.stagnation.type,'boolean');
});
test('research strategist uses the text provider only at planning boundaries',async()=>{
  let url,options;const plan={status:'continue',summary:'s',objective:'o',invariants:[],hypotheses:[],questions:[],seeds:['withdraw'],microSteps:4,answer:''};
  const cortex=new GatewayCortex(config,{apiKey:'test-key',fetchImpl:async(u,o)=>{url=u;options=o;return response({choices:[{message:{content:JSON.stringify(plan)},finish_reason:'stop'}],usage:{prompt_tokens:11,completion_tokens:7}});}});
  const packet={task:'Trace withdrawals',research:{round:0},evidence:[],constraints:[]};const r=await cortex.researchPlan(packet,new AbortController().signal);const body=JSON.parse(options.body);
  assert.equal(url,'https://ai-gateway.vercel.sh/v1/chat/completions');assert.equal(body.model,config.mainModel);assert.match(body.messages[0].content,/Jev-driven executor/);assert.equal(r.data,JSON.stringify(plan));assert.equal(r.usage.inputTokens,11);
});
test('research strategist prompt is strategy-only and read-only',()=>{const m=researchMessages({task:'x',forceComplete:false,research:{},evidence:[],constraints:[]});assert.match(m[0].content,/read-only/);assert.match(m[0].content,/do NOT navigate files one action at a time/);});

test('candidate criteria are independent, atomic questions with retained score distributions',()=>{
  const p=proposal([{type:'note',text:'First'},{type:'finish',answer:'Final'}]);const q=candidateQuestions(p);
  assert.equal(Object.keys(q).length,9);assert.equal(q.c0_progress.type,'score');assert.equal(q.c0_progress.criteria.length,4);
  assert.match(q.c0_information.instructions,/proposal\.candidates\[0\]/);assert.match(q.c1_progress.instructions,/proposal\.candidates\[1\]/);
  assert.equal(q.c1_completion.type,'boolean');assert.ok(!('c0_completion'in q));
});
test('Jev returns its actual answers without text parsing or heuristic replacement',async()=>{
  const actual={mode:{type:'choice',choice:'verify',probabilities:{verify:1}}};
  const jev=new GatewayJev(config,{evaluate:async()=>({answers:actual,usage:{}})});
  assert.equal((await jev.control(packet)).data,actual);
});
test('Jev errors propagate without falling back to mock',async()=>{
  const jev=new GatewayJev(config,{evaluate:async()=>{throw new Error('live provider failed');}});
  await assert.rejects(()=>jev.control(packet),/live provider failed/);assert.equal(jev.source,'jev');
});
test('text adapter uses Gateway chat completions, not Jev evaluation',async()=>{
  let url,options;
  const cortex=new GatewayCortex(config,{apiKey:'test-key',fetchImpl:async(u,o)=>{url=u;options=o;return response({choices:[{message:{content:JSON.stringify(proposal([{type:'note',text:'x'}]))},finish_reason:'stop'}],usage:{prompt_tokens:25,completion_tokens:8}});}});
  const r=await cortex.propose(packet,attention,['note']);const body=JSON.parse(options.body);
  assert.equal(url,'https://ai-gateway.vercel.sh/v1/chat/completions');assert.equal(body.model,config.mainModel);assert.ok(!('tools'in body));
  assert.deepEqual(body.response_format,{type:'json_object'});assert.equal(r.usage.inputTokens,25);assert.equal(r.usage.costUsd,null);
});
test('text adapter refuses native tool_calls from a provider',async()=>{
  const cortex=new GatewayCortex(config,{apiKey:'test',fetchImpl:async()=>response({choices:[{message:{content:'{}',tool_calls:[{function:{name:'run'}}]}}]})});
  await assert.rejects(()=>cortex.propose(packet,attention,['note']),/native tool call/);
});
test('text adapter refuses truncated output',async()=>{
  const cortex=new GatewayCortex(config,{apiKey:'test',fetchImpl:async()=>response({choices:[{message:{content:'{}'},finish_reason:'length'}]})});
  await assert.rejects(()=>cortex.propose(packet,attention,['note']),/truncated/);
});
test('HTTP errors carry a status but do not echo provider error secrets',async()=>{
  const cortex=new GatewayCortex(config,{apiKey:'test',fetchImpl:async()=>response({error:'SECRET_VALUE'},503)});
  await assert.rejects(()=>cortex.propose(packet,attention,['note']),e=>e.statusCode===503&&!e.message.includes('SECRET_VALUE'));
});
test('text model slot cannot silently select Jev',async()=>{
  const cortex=new GatewayCortex({...config,mainModel:'typesafe-ai/jev'},{apiKey:'test'});
  await assert.rejects(()=>cortex.propose(packet,attention,['note']),/text model ID/);
});
test('text-model context labels untrusted summaries and constrains its action vocabulary',()=>{
  const m=cortexMessages(packet,attention,['note','finish']);assert.match(m[0].content,/cannot execute tools directly/);
  assert.match(m[0].content,/untrusted data/);assert.match(m[1].content,/observe/);
});
test('model catalog is fetched rather than guessed from a hardcoded list',async()=>{
  const r=await availableModels({fetchImpl:async()=>response({data:[{id:'b/new'},{id:'a/older'},{x:1}]})});
  assert.deepEqual(r.map(x=>x.id),['a/older','b/new']);
});
test('unknown usage and cost remain null, not invented zero',()=>assert.deepEqual(usageOf(),{inputTokens:null,outputTokens:null,costUsd:null}));
test('known environment secrets are redacted from strings and structured logs',()=>{
  const redact=redactor({AI_GATEWAY_API_KEY:'my-private-fixture-key'});
  assert.equal(redact('key=my-private-fixture-key'),'key=[REDACTED]');assert.equal(redact({a:'my-private-fixture-key'}).a,'[REDACTED]');
});
test('untrusted terminal text cannot emit ANSI/OSC control sequences',()=>{
  const text=safeTerminal('\x1b[31mred\x1b[0m\x1b]0;malicious\x07ok\x00');assert.equal(text,'redok');
});

test('model discovery authenticates when a Gateway key is configured',async()=>{
  let options;
  await availableModels({apiKey:'fixture-key',fetchImpl:async(_url,o)=>{options=o;return response({data:[]});}});
  assert.equal(options.headers.Authorization,'Bearer fixture-key');
});
