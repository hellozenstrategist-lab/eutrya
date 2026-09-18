import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {FileArchive,createCompactor} from '../src/index.mjs';
export const scope={profileId:'local',userId:'owner',sessionId:'session-1',agentId:'admin'};
export function messages(count=8,length=1500) {
  const ms=[{role:'user',text:'Explain the result. Never modify generated files.',toolUses:[]}];
  for(let i=1;i<=count;i++) {
    ms.push({role:'assistant',text:'',toolUses:[{tool_use_id:`o${i}`,tool:'read',input:{path:`file-${i}.txt`}}]});
    ms.push({role:'tool',text:'',toolUses:[],toolResults:[{tool_use_id:`o${i}`,text:`ORIGINAL-${i}\n`+'x'.repeat(length)}]});
  }
  return ms;
}
export function fakeAsker({prob=0,callProb=prob,resultProb=prob,source='mock',fn=null}={}) {
  const calls=[];
  return {source,calls,async ask(state,questions,signal) {
    calls.push({state,questions,signal});if(fn)return fn(state,questions,signal);
    return {answers:Object.fromEntries(Object.keys(questions).map(k=>[k,{type:'boolean',probability:k.startsWith('call_')?callProb:resultProb}]))};
  }};
}
export function setup(t,{options={},asker=fakeAsker(),ownScope=scope,...extra}={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eutrya-compaction-test-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const archive=new FileArchive({root,scope:ownScope});
  const compactor=createCompactor({scope:ownScope,archive,asker,allowMock:true,options,...extra});
  return {root,archive,asker,compactor};
}
export const request=(ms,extra={})=>({messages:ms,budget:{limit:1000000},force:true,...extra});
