import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULTS } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { Toolbox } from '../src/tools.mjs';
import { ResearchRunner, researchCandidates } from '../src/research-runtime.mjs';
import { MockJev } from '../src/providers/mock.mjs';
import { codeSurface, codeInspect, codeReferences, codeState, codeCompare } from '../src/research-code.mjs';
import { digest } from '../src/util.mjs';

const source=`pragma solidity ^0.8.20;
contract Vault {
  mapping(address => uint256) public balances;
  modifier onlyOwner() { _; }
  function deposit(uint256 amount) external { balances[msg.sender] += amount; }
  function withdraw(uint256 amount) external onlyOwner { _withdraw(msg.sender, amount); }
  function redeem(uint256 amount) external { _withdraw(msg.sender, amount); }
  function _withdraw(address user,uint256 amount) internal { balances[user] -= amount; payable(user).transfer(amount); }
}\n`;
function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'eutrya-research-')),workspace=path.join(root,'workspace');fs.mkdirSync(path.join(workspace,'contracts'),{recursive:true});fs.writeFileSync(path.join(workspace,'contracts','Vault.sol'),source);t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return {root,workspace};}

test('semantic code tools map surface, calls, state writes and structural differences',t=>{
  const {workspace}=fixture(t);const surface=codeSurface(workspace,'.');assert.ok(surface.externallyReachable.some(x=>x.name==='withdraw'));const inspected=codeInspect(workspace,'contracts/Vault.sol','withdraw');assert.deepEqual(inspected.modifiers,['onlyOwner']);assert.ok(inspected.calls.includes('_withdraw'));const refs=codeReferences(workspace,'.','_withdraw');assert.ok(refs.enclosingFunctions.includes('redeem'));const state=codeState(workspace,'.','balances');assert.ok(state.writes.some(x=>x.enclosing==='_withdraw'));const compared=codeCompare(workspace,'contracts/Vault.sol',['withdraw','redeem']);assert.deepEqual(compared.compared[0].modifiers,['onlyOwner']);assert.deepEqual(compared.compared[1].modifiers,[]);
});

test('research frontier eliminates already explored actions and follows discovered code',t=>{
  const {workspace,root}=fixture(t),settings={...DEFAULTS,sessionRoot:path.join(root,'sessions')};const store=new Store(settings.sessionRoot,workspace,{redact:x=>x});t.after(()=>store.close());store.state.task='Trace withdrawal authorization';store.state.research={version:1,round:1,objective:'trace withdrawals',plan:null,invariants:[],hypotheses:[],questions:[],exploredActions:[],evidence:[],packets:[],microSteps:0,plannerCalls:0};
  const plan={seeds:['withdraw'],questions:[]};let c=researchCandidates(store.state,plan);assert.equal(c[0].action.type,'code_symbol');store.state.research.exploredActions.push(digest(c[0].action));store.state.observations.push({id:'o1',action:c[0].action,result:{query:'withdraw',definitions:[{path:'contracts/Vault.sol',kind:'function',name:'withdraw'}]}});store.state.research.evidence.push({observationId:'o1',round:1,candidateId:'r1',summary:'x'});c=researchCandidates(store.state,plan);assert.ok(c.some(x=>x.action.type==='code_inspect'&&x.action.symbol==='withdraw'));
});

test('research runner calls strategist at boundaries while Jev drives multiple local searches',async t=>{
  const {workspace,root}=fixture(t),settings={...DEFAULTS,sessionRoot:path.join(root,'sessions'),maxCalls:30,retries:0};const store=new Store(settings.sessionRoot,workspace,{redact:x=>x});t.after(()=>store.close());
  const plans=[
    {status:'continue',summary:'Map withdrawal paths.',objective:'Trace every path that reaches _withdraw and compare authorization.',invariants:[{id:'INV1',statement:'Asset-reducing paths must enforce intended authorization.',priority:'high'}],hypotheses:[{id:'H1',claim:'Sibling withdrawal paths may enforce different guards.',status:'open',question:'Do callers of _withdraw have asymmetric modifiers?'}],questions:[{id:'Q1',text:'Which callers reach _withdraw?',seeds:['withdraw','_withdraw']}],seeds:['withdraw','_withdraw'],microSteps:3,answer:''},
    {status:'complete',summary:'Local evidence gathered.',objective:'Complete.',invariants:[{id:'INV1',statement:'Asset-reducing paths must enforce intended authorization.',priority:'high'}],hypotheses:[{id:'H1',claim:'withdraw and redeem are structurally asymmetric around onlyOwner.',status:'supported',question:'Intent still requires human/protocol-context confirmation.'}],questions:[],seeds:[],microSteps:1,answer:'The local review found an authorization asymmetry worth manual protocol-context review; it is evidence of a lead, not by itself proof of a vulnerability.'}
  ];
  const cortex={source:'mock',index:0,async researchPlan(){return {data:plans[Math.min(this.index++,plans.length-1)],usage:{inputTokens:0,outputTokens:0,costUsd:0},model:'fixture-strategist'};}};
  const jev=new MockJev();const toolbox=new Toolbox({workspace,store,config:settings,approve:async()=>false,redact:x=>x,readOnly:true,allowedTools:['code_surface','code_symbol','code_references','code_inspect','code_state','code_compare']});const events=[];const runner=new ResearchRunner({store,cortex,jev,toolbox,config:settings,onEvent:e=>events.push(e),redact:x=>x});runner.start('Review the vault withdrawal authorization invariant.');await runner.run({maxRounds:2});
  assert.equal(runner.state.status,'ANSWERED');assert.equal(runner.state.research.plannerCalls,2);assert.equal(runner.state.research.microSteps,3);assert.equal(runner.state.meter.cortexCalls,2);assert.equal(runner.state.meter.jevCalls,3);assert.equal(runner.state.observations.length,3);assert.ok(events.some(e=>e.type==='research.decision'));assert.ok(runner.state.research.invariants.some(x=>x.id==='INV1'));assert.ok(runner.state.research.hypotheses.some(x=>x.id==='H1'&&x.status==='supported'));
});
