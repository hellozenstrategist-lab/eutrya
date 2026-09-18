import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeAdapters,createNativeSelector,adaptiveContext } from '../integration/native-v02.mjs';
import { fixture,principal } from './helpers.mjs';

test('native bridge uses runtime metering for Jev and text separately',async()=>{
  const calls=[];const runtime={config:{mainModel:'fixture/text',jevModel:'fixture/evaluator'},jev:{source:'mock',evaluate:async()=>({data:{ok:true},usage:{inputTokens:7},model:'fixture/evaluator'})},async call(kind,input,fn,signal){calls.push(kind);const r=await fn(signal);return r.data;}};
  const adapters=createNativeAdapters(runtime,{streamText:async({onToken})=>{onToken('hello');return {text:'hello',usage:{outputTokens:1},model:'fixture/text'};}});
  assert.deepEqual((await adapters.jev.evaluate({state:{},questions:{}})).answers,{ok:true});let output='';assert.equal((await adapters.streamText({messages:[],maxOutputTokens:64,onToken:t=>output+=t})).text,'hello');assert.deepEqual(calls,['jev.adaptive','cortex.fast']);assert.equal(output,'hello');
});
test('native selector delegates all hard eligibility to existing selector',t=>{
  const {ext}=fixture(t);const blocked={id:'b',action:{type:'write',path:'x'}};const allowed={id:'a',action:{type:'read',path:'x'}};
  const original=()=>({selected:allowed,ranked:[{candidate:blocked,eligible:false,value:100},{candidate:allowed,eligible:true,value:0.5}]});
  const select=createNativeSelector(ext,original,()=>({learningKey:'workspace',continuityKey:'session'}));assert.equal(select().selected.id,'a');assert.equal(select().ranked[0].eligible,false);
});
test('native context retains original host context and adds scoped preferences',t=>{
  const {ext}=fixture(t);ext.controls.correct(principal,{text:'Use my variable names'});const c=adaptiveContext(ext,{original:'data'});assert.deepEqual(c.existingContext,{original:'data'});assert.match(c.adaptivePreferences.correctionNotes[0].text,/variable names/);
});
test('bridge refuses hosts without a typed evaluator instead of changing APIs',()=>{assert.throws(()=>createNativeAdapters({call(){},jev:{control(){}}}),/typed/);});
