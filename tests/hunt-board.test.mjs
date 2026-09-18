import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SharedWorkspace } from '../src/swarm/workspace.mjs';
import { NativeSwarm } from '../src/swarm/swarm.mjs';
import { loadConfig } from '../src/config.mjs';
import { validateAction } from '../src/schema.mjs';

function setupSwarm(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eutrya-hunt-board-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const config=loadConfig(undefined,{sessionRoot:path.join(root,'state'),mainModel:'mock/text'});
  const swarm=new NativeSwarm({config,workspace:root,demo:true});
  t.after(()=>swarm.close());
  return {root,swarm};
}

function addHunt(ws) {
  const hunt=ws.createHunt({
    title:'Authorized Example Hunt',
    pageUrl:'https://example.com/program',
    rules:'Use owned accounts only. Non-destructive testing.',
    scope:['*.example.com'],
    exclusions:['third-party services'],
    testingRules:['No denial of service','No production state corruption']
  });
  return hunt;
}

test('hunt boards and cards serialize and restore with kanban state',()=>{
  const ws=new SharedWorkspace();
  const hunt=addHunt(ws);
  const card=ws.createHuntCard({
    huntId:hunt.id,
    title:'Review authorization boundaries',
    objective:'Map sensitive state transitions and authorization checks.',
    priority:'high',
    preferredRoles:['auditor'],
    dependsOn:[]
  });
  ws.updateHuntCard(card.id,{status:'active',assignedTo:'auditor',routeEvent:{agent:'auditor',stage:'ready',source:'jev',probability:0.91},incrementAttempts:true});
  const restored=new SharedWorkspace();
  restored.restore(ws.serialize());
  assert.equal(restored.getHunt(hunt.id).title,'Authorized Example Hunt');
  assert.equal(restored.getHuntCard(card.id).assignedTo,'auditor');
  assert.equal(restored.getHuntCard(card.id).routeHistory[0].source,'jev');
  assert.equal(restored.huntBoard(hunt.id).cards.length,1);
});

test('hunt action schema accepts normalized program intake and cards',()=>{
  assert.doesNotThrow(()=>validateAction({
    type:'hunt_create',
    title:'Program',
    pageUrl:'https://example.com/program',
    rules:'Owned accounts only.',
    scope:['*.example.com'],
    exclusions:['third party'],
    testingRules:['No DoS']
  }));
  assert.doesNotThrow(()=>validateAction({
    type:'hunt_card',
    huntId:'hunt-abc123',
    title:'Auth review',
    objective:'Review authorization boundaries.',
    priority:'high',
    preferredRoles:['auditor'],
    dependsOn:[]
  }));
  assert.doesNotThrow(()=>validateAction({type:'hunt_board',huntId:'hunt-abc123'}));
  assert.doesNotThrow(()=>validateAction({type:'hunt_route',huntId:'hunt-abc123'}));
});

test('Jev hunt router excludes agents that are already working',async t=>{
  const {swarm}=setupSwarm(t);
  const hunt=addHunt(swarm.sharedWorkspace);
  const card=swarm.sharedWorkspace.createHuntCard({
    huntId:hunt.id,
    title:'Audit authorization logic',
    objective:'Review access control and sensitive state transitions.',
    priority:'high',
    preferredRoles:['auditor']
  });
  swarm.sharedWorkspace.setAgentStatus('auditor','WORKING','Another hunt card');
  const route=await swarm.routeHuntCard(card.id);
  assert.notEqual(route.agentId,'auditor');
  assert.ok(['operator','sentinel','analyst'].includes(route.agentId));
});

test('review routing avoids the original worker when another specialist is idle',async t=>{
  const {swarm}=setupSwarm(t);
  const hunt=addHunt(swarm.sharedWorkspace);
  const card=swarm.sharedWorkspace.createHuntCard({
    huntId:hunt.id,
    title:'Verify candidate evidence',
    objective:'Independently verify the evidence and competing explanations.',
    priority:'high',
    preferredRoles:['sentinel']
  });
  swarm.sharedWorkspace.updateHuntCard(card.id,{status:'review',worker:'auditor',workerResult:'Candidate evidence'});
  const route=await swarm.routeHuntCard(card.id);
  assert.notEqual(route.agentId,'auditor');
  assert.equal(route.agentId,'sentinel');
});

test('one routing wave spreads ready cards across idle residents instead of queueing behind one agent',async t=>{
  const {swarm}=setupSwarm(t);
  const hunt=addHunt(swarm.sharedWorkspace);
  for(let i=0;i<3;i++) {
    swarm.sharedWorkspace.createHuntCard({
      huntId:hunt.id,
      title:`Audit surface ${i+1}`,
      objective:'Review an authorized security surface for evidence-backed anomalies.',
      priority:i===0?'high':'medium',
      preferredRoles:['auditor']
    });
  }
  const assignments=[];
  swarm.executeHuntCard=async (cardId,agentId,stage,route)=>{
    const card=swarm.sharedWorkspace.getHuntCard(cardId);
    assignments.push({cardId,agentId,stage});
    swarm.sharedWorkspace.setAgentStatus(agentId,'WORKING',card.title);
    swarm.sharedWorkspace.updateHuntCard(cardId,{status:'active',assignedTo:agentId,routeEvent:{agent:agentId,stage,source:route.source,probability:route.probability}});
    await new Promise(resolve=>setTimeout(resolve,15));
    swarm.sharedWorkspace.updateHuntCard(cardId,{status:'done',assignedTo:null,worker:agentId,workerResult:'fixture result'});
    swarm.sharedWorkspace.setAgentStatus(agentId,'IDLE');
    return {cardId,agentId,status:'done'};
  };
  const result=await swarm.runHuntBoard(hunt.id,{maxWaves:2});
  assert.equal(assignments.length,3);
  assert.equal(new Set(assignments.map(x=>x.agentId)).size,3);
  assert.equal(result.board.hunt.status,'completed');
});
