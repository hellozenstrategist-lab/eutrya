import {assert,clone} from './util.mjs';
export const DEFAULTS=Object.freeze({
  autoTriggerRatio:0.72, targetRatio:0.55, minReductionRatio:0.05,
  keepThreshold:0.35, preserveRecentMessages:6, truncateHeadChars:300,
  maxStateTokens:12000,maxRequestTokens:16000,maxRequestChars:40000,
  maxBatches:8,callsPerBatch:12,maxConcurrency:2,deadlineMs:20000,
  minNewMessages:4, resultPreviewChars:400, pinErrors:true,
  eligibleTools:Object.freeze(['read','list','search','recall','Read','Glob','Grep']),
  maxMessages:10000,maxInputChars:8000000
});
export function resolveOptions(input={}) {
  assert(input && typeof input==='object' && !Array.isArray(input),'OPTIONS','Options must be an object');
  for(const k of Object.keys(input)) assert(Object.hasOwn(DEFAULTS,k),'OPTIONS',`Unknown compaction option: ${k}`);
  const o={...DEFAULTS,...input};
  for(const k of ['autoTriggerRatio','targetRatio','minReductionRatio','keepThreshold'])assert(typeof o[k]==='number'&&Number.isFinite(o[k])&&o[k]>0&&o[k]<1,'OPTIONS',`${k} must be between 0 and 1`);
  assert(o.targetRatio<o.autoTriggerRatio,'OPTIONS','targetRatio must be less than autoTriggerRatio');
  for(const [k,lo,hi] of [['preserveRecentMessages',0,1000],['truncateHeadChars',0,5000],['maxStateTokens',200,100000],['maxRequestTokens',500,200000],['maxRequestChars',2000,1000000],['maxBatches',1,64],['callsPerBatch',1,100],['maxConcurrency',1,4],['deadlineMs',10,300000],['minNewMessages',0,1000],['resultPreviewChars',0,4000],['maxMessages',1,100000],['maxInputChars',1000,64000000]]) {
    assert(Number.isSafeInteger(o[k])&&o[k]>=lo&&o[k]<=hi,'OPTIONS',`${k} must be an integer ${lo}..${hi}`);
  }
  assert(o.maxStateTokens<o.maxRequestTokens,'OPTIONS','Leave room for questions after state');
  assert(typeof o.pinErrors==='boolean','OPTIONS','pinErrors must be boolean');
  assert(Array.isArray(o.eligibleTools)&&o.eligibleTools.every(x=>typeof x==='string'&&x.length>0&&x.length<=100)&&new Set(o.eligibleTools).size===o.eligibleTools.length,'OPTIONS','eligibleTools must be unique tool names');
  const resolved=clone(o);Object.freeze(resolved.eligibleTools);return Object.freeze(resolved);
}
