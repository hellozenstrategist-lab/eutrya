import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {createCompactor,FileArchive,hash} from '../src/index.mjs';
const root=fs.mkdtempSync(path.join(os.tmpdir(),'eutrya-compaction-demo-'));
const scope={profileId:'offline-demo',userId:'fixture-user',sessionId:'fixture-session',agentId:'fixture-admin'};
const archive=new FileArchive({root,scope});
const messages=[{role:'user',text:'Explain the parser bug. Keep my exact requirement: preserve empty fields.',toolUses:[]}];
for(let i=0;i<10;i++)messages.push(
  {role:'assistant',text:i===1?'The exact error is ParserError: empty field.':'',toolUses:[{tool_use_id:`read-${i}`,tool:'read',input:{path:`fixture-${i}.txt`}}]},
  {role:'tool',text:'',toolUses:[],toolResults:[{tool_use_id:`read-${i}`,text:`ORIGINAL ${i}: `+'old log data '.repeat(450)}]}
);
const asker={source:'mock',async ask(_state,questions) {
  return {answers:Object.fromEntries(Object.keys(questions).map(k=>[k,{type:'boolean',probability:k.endsWith('t2')?1:0}]))};
}};
const compactor=createCompactor({asker,archive,scope,allowMock:true});
try {
  const result=await compactor.compact({messages,goal:'Explain the parser bug',budget:{limit:40000},force:true});
  console.log('OFFLINE FIXTURE — not real Jev inference or a speed/quality benchmark');
  console.log(JSON.stringify({status:result.status,source:result.source,stats:result.stats,
    exactTextPreserved:result.messages.filter(m=>m.text).map(m=>m.text),
    archiveRestoresOriginal:hash(compactor.restore(result.archiveId).messages)===hash(messages)},null,2));
  // JSON object key ordering can differ after durable canonicalization; compare structurally.
  const original=compactor.restore(result.archiveId);console.log(`Restored ${original.messages.length} original messages. Temporary demo archive removed on exit.`);
}finally{fs.rmSync(root,{recursive:true,force:true});}
