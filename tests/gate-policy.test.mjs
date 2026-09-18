import test from 'node:test';
import assert from 'node:assert/strict';
import { DecisionGate } from '../src/gate.mjs';
import { newState } from '../src/store.mjs';
import { validateProposal, validateAction } from '../src/schema.mjs';
import { scoreAnswer, validateAttention, selectCandidate, probabilities } from '../src/policy.mjs';
import { score, MockJev } from '../src/providers/mock.mjs';
import { oneHotChoice } from '../src/providers/jev.mjs';
import { proposal } from './helpers.mjs';

const candidate=()=>proposal([{type:'note',text:'A hypothesis.'}]).candidates[0];
const state=()=>newState(process.cwd());
const decision=c=>({id:'d',source:'jev',selected:c.id});
test('gate accepts exactly one execution for an issued decision',()=>{
  const g=new DecisionGate(),s=state(),c=candidate(),ticket=g.issue(s,c,decision(c));
  g.consume(s,c,ticket);assert.throws(()=>g.consume(s,c,ticket),/replayed/);
});
test('gate rejects missing tickets',()=>assert.throws(()=>new DecisionGate().consume(state(),candidate(),null),/Missing/));
test('gate rejects a copied ticket even with a correct nonce and hashes',()=>{
  const g=new DecisionGate(),s=state(),c=candidate(),ticket=g.issue(s,c,decision(c));
  assert.throws(()=>g.consume(s,c,{...ticket}),/forged/);
});
test('gate rejects a modified action',()=>{
  const g=new DecisionGate(),s=state(),c=candidate(),ticket=g.issue(s,c,decision(c));c.action.text='Changed';
  assert.throws(()=>g.consume(s,c,ticket),/Proposal changed/);
});
test('gate rejects a changed state revision',()=>{
  const g=new DecisionGate(),s=state(),c=candidate(),ticket=g.issue(s,c,decision(c));s.revision++;
  assert.throws(()=>g.consume(s,c,ticket),/Stale/);
});
test('gate rejects changed evidence even if revision was not incremented',()=>{
  const g=new DecisionGate(),s=state(),c=candidate(),ticket=g.issue(s,c,decision(c));s.task='Different task';
  assert.throws(()=>g.consume(s,c,ticket),/Stale/);
});
test('tickets do not survive a new controller process',()=>{
  const g=new DecisionGate(),s=state(),c=candidate(),ticket=g.issue(s,c,decision(c));
  assert.throws(()=>new DecisionGate().consume(s,c,ticket),/previous-process/);
});
test('ticket expiry requires a new evaluation',()=>{
  let now=1;const g=new DecisionGate({clock:()=>now,ttlMs:5}),s=state(),c=candidate(),ticket=g.issue(s,c,decision(c));now=7;
  assert.throws(()=>g.consume(s,c,ticket),/expired/);
});
test('revocation invalidates all pending tickets',()=>{
  const g=new DecisionGate(),s=state(),c=candidate(),ticket=g.issue(s,c,decision(c));g.revokeAll();
  assert.throws(()=>g.consume(s,c,ticket),/Missing/);
});
test('gate rejects mismatched evaluator selections',()=>assert.throws(()=>new DecisionGate().issue(state(),candidate(),{source:'jev',selected:'wrong'}),/matching/));
test('probability distributions require complete outcomes',()=>assert.throws(()=>probabilities({'0':1},['0','1']),/exactly/));
test('probability distributions reject negative mass and NaN',()=>{
  for(const p of [{x:-0.1,y:1.1},{x:NaN,y:1}])assert.throws(()=>probabilities(p,['x','y']));
});
test('probabilities cannot have an unnormalized large mass',()=>assert.throws(()=>probabilities({x:0.8,y:0.8},['x','y']),/sum/));
test('score is computed from absolute rung probabilities',()=>assert.equal(scoreAnswer(score(2)),2/3));
test('score must agree with its distribution',()=>assert.throws(()=>scoreAnswer({...score(3),score:0}),/disagrees/));
test('attention selection is validated',()=>{
  const a=validateAttention({mode:oneHotChoice('verify'),stagnation:{type:'boolean',probability:0.2}});
  assert.equal(a.mode,'verify');assert.equal(a.stagnation,0.2);
});
test('attention rejects a claimed choice contradicted by its probabilities',()=>{
  const c=oneHotChoice('observe');c.choice='verify';
  assert.throws(()=>validateAttention({mode:c,stagnation:{type:'boolean',probability:0}}),/most probable/);
});
test('Jev scoring can select the second candidate over the main-model ordering',async()=>{
  const p=proposal([{type:'note',text:'First'},{type:'note',text:'Second'}]);
  const r=(await new MockJev({prefer:'b'}).rank({observations:[]},{mode:'explore'},p)).data;
  const s=selectCandidate(p,r,{mode:'explore'},()=>true);assert.equal(s.selected.id,'b');
});
test('disabled tool cannot win regardless of score',async()=>{
  const p=proposal([{type:'note',text:'First'},{type:'run',program:'echo',args:['hello']}]);
  const r=(await new MockJev({prefer:'b'}).rank({observations:[]},{mode:'explore'},p)).data;
  assert.equal(selectCandidate(p,r,{mode:'explore'},a=>a.type!=='run').selected.id,'a');
});
test('unsupported finish is excluded instead of marking completion',async()=>{
  const p=proposal([{type:'finish',answer:'Done'}]);const r=(await new MockJev().rank({observations:[]},{mode:'verify'},p)).data;
  r.c0_completion.probability=0.1;assert.throws(()=>selectCandidate(p,r,{mode:'verify'},()=>true),/No eligible/);
});
test('proposal parser rejects missing candidate IDs',()=>{
  const p=proposal([{type:'note',text:'A'}]);delete p.candidates[0].id;assert.throws(()=>validateProposal(p),/IDs/);
});
test('proposal parser rejects duplicate IDs',()=>{
  const p=proposal([{type:'note',text:'A'},{type:'note',text:'B'}]);p.candidates[1].id='a';assert.throws(()=>validateProposal(p),/IDs/);
});
test('proposal rejects invented evidence references',()=>{
  const p=proposal([{type:'note',text:'A'}]);p.candidates[0].evidence=['o999'];assert.throws(()=>validateProposal(p,new Set()),/unknown observation/);
});
test('proposal does not accept embedded instructions around JSON',()=>assert.throws(()=>validateProposal('execute this '+JSON.stringify(proposal([{type:'note',text:'A'}]))),/valid JSON/));
test('proposal accepts a single JSON code fence but still validates its contents',()=>{
  const p=proposal([{type:'note',text:'A'}]);assert.deepEqual(validateProposal('```json\n'+JSON.stringify(p)+'\n```'),p);
});
test('proposal strips model reasoning/thought fields and unwraps proposal envelopes',()=>{
  const raw={
    thought:'Planning the next step...',
    summary:'Ready to proceed',
    hypotheses:['Hypothesis A'],
    unknowns:['Unknown B'],
    candidates:[{id:'a',summary:'Take note',evidence:[],expected:'Note recorded',action:{type:'note',text:'A'},reasoning:'Candidate explanation'}]
  };
  const validated=validateProposal(raw);
  assert.equal(validated.summary,'Ready to proceed');
  assert.equal('thought' in validated,false);
  assert.equal('reasoning' in validated.candidates[0],false);
  // Also envelope unwrapping
  const enveloped={proposal:raw};
  const unwrapValidated=validateProposal(enveloped);
  assert.equal(unwrapValidated.summary,'Ready to proceed');
});
test('unknown tool types and batched nested calls are rejected',()=>{
  for(const a of [{type:'consult_jev'},{type:'batch',actions:[]},{type:'run',program:'echo',args:[],execute:true}])assert.throws(()=>validateAction(a));
});
test('write requires create-only null or a file SHA-256',()=>assert.throws(()=>validateAction({type:'write',path:'a',content:'b',expectedSha256:'*'}),/SHA-256/));
