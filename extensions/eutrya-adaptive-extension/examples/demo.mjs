import { mkdtempSync,rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAdaptive } from '../src/index.mjs';
const directory=mkdtempSync(path.join(os.tmpdir(),'eutrya-adaptive-demo-'));
const principal={kind:'authenticated-user',id:'demo-user'};
const registered={admin:{enabled:true,role:'coordinates the task',manualOnly:false,allowedEvents:['TASK_ASSIGNED'],canDelegate:true,allowedTemplates:['helper']},engineer:{enabled:true,role:'implements a bounded change',manualOnly:false,allowedEvents:['TASK_ASSIGNED'],canDelegate:false,allowedTemplates:[]}};
const choice=(name,names)=>({type:'choice',choice:name,probabilities:Object.fromEntries(names.map(k=>[k,k===name?1:0]))});
let wakeCount=0;
const extension=createAdaptive({directory,scope:{userId:'demo-user',workspaceId:'demo-workspace',conversationId:'demo-profile'},allowMocks:true,config:{agents:registered,templates:{helper:{enabled:true,role:'temporary helper',canDelegate:false,allowedTemplates:[]}}},
  jev:{source:'mock',model:'fixture-not-a-real-model',async evaluate({questions}) {
    console.log('  [MOCK Jev] '+(questions.route?'route ordinary explanation':'authorize one activation'));
    return {answers:questions.route?{route:choice('fast',['fast','work','clarify']),toolFree:{type:'boolean',probability:1}}:{actor:choice('a0',Object.keys(questions.actor.criteria)),...Object.fromEntries(Object.keys(questions).filter(k=>k!=='actor').map(k=>[k,{type:'boolean',probability:1}]))}};
  }},
  streamText:async({onToken})=>{const text='A stack is a last-in, first-out collection: the last item added is the first removed.';onToken(text);return {text};},
  swarm:{runResident:async args=>{wakeCount++;console.log(`  Existing resident ${args.agentId} woke.`);const child=await args.delegate({templateId:'helper',task:'Check the small example',permissions:['read']});return {summary:'Resident retained its identity.',child:child.result};},runSubagent:async args=>{wakeCount++;console.log(`  Temporary subagent ${args.templateId} woke.`);return {checked:'fixture'};}}
});
try {
  console.log('\nEUTRYA ADAPTIVE EXTENSION • OFFLINE FIXTURE ONLY\n');
  console.log('1. Sleeping residents:',extension.actors.status().agents.map(x=>`${x.id}=${x.status}`).join(', '));
  console.log('\n2. User correction: “Answer first. This is too long.”');
  extension.controls.correct(principal,{text:'Answer first. This is too long.'});
  console.log('  Persisted:',extension.status().learning.preferences);
  console.log('\n3. Fast text lane (one evaluator + one text call):');
  const answer=await extension.replies.maybeReply({task:'Explain a stack.'},{onToken:t=>process.stdout.write(t)});
  console.log(`\n  ${answer.verification}`);
  console.log('\n4. Jev-gated resident → temporary subagent:');
  const rootId=extension.actors.beginRoot({task:'Check a local example',permissions:['read']});
  await extension.actors.runResident({rootId,agentId:'admin',task:'Check the example'});
  console.log('  Model invocation callbacks:',wakeCount,'(idle peers were never called)');
  console.log('\n5. Verified-outcome policy stabilization:');
  for(let i=0;i<5;i++){const d=extension.decisions.choose([{id:'read',strategy:'read-before-edit',action:{type:'read',path:'example'},value:0.8,eligible:true}],{learningKey:'fixture-coding',continuityKey:'fixture'});extension.recordOutcome({observationId:`check-${i}`,decisionId:d.decision.id,passed:true,checker:'fixture-independent-check'});}
  const learned=extension.decisions.choose([{id:'read',strategy:'read-before-edit',action:{type:'read',path:'example'},value:0.8,eligible:true}],{learningKey:'fixture-coding',continuityKey:'fixture'});
  console.log('  Learned bounded bias:',learned.selected.bias);
  console.log('\nNo live Jev performance or five-second latency claim is demonstrated.\n');
}finally{await extension.close();rmSync(directory,{recursive:true,force:true});}
