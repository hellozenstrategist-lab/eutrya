// Optional compatibility check against the user's checked-out Native v0.2 API.
// This test imports the actual host code. Inference stays explicitly MOCK.
import path from 'node:path';
import os from 'node:os';
import { mkdtempSync,rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createAdaptive } from '../src/index.mjs';
import { createNativeAdapters,createNativeSelector } from './native-v02.mjs';
const base=process.argv[2];if(!base)throw new Error('Usage: node integration/verify-native.mjs /path/to/eutrya');
const {Eutrya}=await import(pathToFileURL(path.resolve(base,'src/runtime.mjs')).href);
const {selectCandidate}=await import(pathToFileURL(path.resolve(base,'src/policy.mjs')).href);
const dir=mkdtempSync(path.join(os.tmpdir(),'eutrya-native-adaptive-'));
const state={meter:{calls:0,jevCalls:0,cortexCalls:0,unpricedCalls:0,usageMissingCalls:0,inputTokens:0,outputTokens:0,knownCostUsd:0}};
const host=new Eutrya({store:{state,save(){},event(type,data){return {type,...data};}},toolbox:{},cortex:{source:'mock'},jev:{source:'mock',async evaluate(){return {data:{route:{type:'choice',choice:'fast',probabilities:{fast:1,work:0,clarify:0}},toolFree:{type:'boolean',probability:1}},usage:{inputTokens:5,outputTokens:2}};}},config:{mainModel:'fixture/text',jevModel:'fixture/jev',maxPromptChars:24000,maxCalls:12,retries:0,timeoutMs:2000,maxKnownCostUsd:null}});
const adapters=createNativeAdapters(host,{streamText:async({onToken})=>{onToken('Host bridge works.');return {text:'Host bridge works.',usage:{inputTokens:8,outputTokens:4}};}});
const extension=createAdaptive({directory:dir,scope:{userId:'fixture',workspaceId:'fixture',conversationId:'fixture'},allowMocks:true,...adapters});
try {
  const result=await extension.replies.maybeReply({task:'Explain a simple concept'});
  assert.equal(result.text,'Host bridge works.');assert.equal(state.meter.jevCalls,1);assert.equal(state.meter.cortexCalls,1);assert.equal(state.meter.calls,2);
  const candidate={id:'a',summary:'Read',expected:'Text',evidence:[],action:{type:'read',path:'test.txt'}};
  const score={type:'score',score:2,probabilities:{0:0,1:0,2:1,3:0}};
  const ranks={c0_progress:score,c0_information:score,c0_grounding:{type:'boolean',probability:1},c0_repetition:{type:'boolean',probability:0}};
  const select=createNativeSelector(extension,selectCandidate,()=>({learningKey:'read-work',continuityKey:'fixture-task'}));
  assert.equal(select({candidates:[candidate]},ranks,{mode:'observe'},()=>true).selected.id,'a');
  console.log(JSON.stringify({nativeVersionTested:'0.2.0',inference:'MOCK',realRuntimeCall:true,realBaseSelector:true,hostProviderAttempts:state.meter.calls,status:'PASS'},null,2));
} finally {await extension.close();rmSync(dir,{recursive:true,force:true});}
