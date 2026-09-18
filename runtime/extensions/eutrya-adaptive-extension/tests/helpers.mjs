import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAdaptive } from '../src/index.mjs';
export const scope={userId:'owner',workspaceId:'workspace',conversationId:'conversation'};
export const principal={kind:'authenticated-user',id:'owner'};
export const bool=p=>({type:'boolean',probability:p});
export const pick=(name,names)=>({type:'choice',choice:name,probabilities:Object.fromEntries(names.map(x=>[x,x===name?1:0]))});
export function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
export const profile=(role,templates=[])=>({enabled:true,role,manualOnly:false,allowedEvents:['TASK_ASSIGNED','REVIEW_REQUIRED'],canDelegate:templates.length>0,allowedTemplates:templates});
export const template=(role,templates=[])=>({enabled:true,role,canDelegate:templates.length>0,allowedTemplates:templates});
export function mockJev({route='fast',activate=true,onEvaluate=null}={}) {
  const calls=[];
  return {source:'mock',model:'fixture-jev',calls,async evaluate(args){calls.push(args);if(onEvaluate)return onEvaluate(args);
    if(args.questions.route)return {answers:{route:pick(route,['fast','work','clarify']),toolFree:bool(route==='fast'?1:0)}};
    const names=Object.keys(args.questions.actor.criteria);return {answers:{actor:pick(activate?names.find(x=>x!=='sleep'):'sleep',names),...Object.fromEntries(Object.keys(args.questions).filter(k=>k!=='actor').map(k=>[k,bool(k.endsWith('_necessary')?(activate?1:0):1)]))}};
  }};
}
export function fixture(t,options={}) {
  const dir=mkdtempSync(path.join(os.tmpdir(),'eutrya-adaptive-'));
  const jev=options.jev??mockJev();const textCalls=[];
  const ext=createAdaptive({directory:dir,scope,allowMocks:true,jev,streamText:async args=>{textCalls.push(args);args.onToken('A bounded ');args.onToken('answer.');return {text:'A bounded answer.',usage:{inputTokens:20,outputTokens:5}};},...options});
  t.after(async()=>{await ext.close();rmSync(dir,{recursive:true,force:true});});
  return {ext,dir,jev,textCalls};
}
export const rows=[{id:'read',strategy:'observe',action:{type:'read',path:'a.txt'},value:0.8,eligible:true},{id:'think',strategy:'deepen',action:{type:'note',text:'An alternative'},value:0.7,eligible:true}];
