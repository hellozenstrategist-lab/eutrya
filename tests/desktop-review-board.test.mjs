import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedWorkspace } from '../src/swarm/workspace.mjs';
import { editReviewBoard, editToken, reviewBoardView } from '../desktop/review-board.mjs';

function rig() {
  const ws=new SharedWorkspace();let saves=0;ws.save=()=>{saves++};
  const swarm={sharedWorkspace:ws,profiles:new Map(['admin','auditor','operator','sentinel','analyst'].map(id=>[id,{}])),runtimes:new Map(),swarmDir:'unused',runHuntBoard(){throw new Error('Review API must never execute work')}};
  const run=(method,path,input)=>editReviewBoard(swarm,method,path,input);
  const create=()=>run('POST','/api/review/hunts',{title:'Test review board',pageUrl:'https://example.invalid/program',rules:'Local review only',scope:[],exclusions:[],testingRules:[]}).hunt;
  return {ws,swarm,run,create,saves:()=>saves};
}
function addCard(r,hunt,overrides={}) {
  return r.run('POST',`/api/review/hunts/${hunt.id}/cards`,{title:'Manual card',objective:'Review supplied documentation',priority:'medium',preferredRoles:['analyst'],dependsOn:[],expectedToken:editToken(r.ws.getHunt(hunt.id)),...overrides}).card;
}

test('desktop intake creates a paused board without fetching a page or dispatching',()=>{
  const r=rig(),h=r.create();assert.equal(h.status,'paused');assert.equal(r.saves(),1);
  assert.equal(r.ws.listHuntCards().length,0);assert.equal(h.createdBy,'desktop-operator');
});
test('manual cards start parked and cannot be promoted by dependency refresh',()=>{
  const r=rig(),h=r.create(),c=addCard(r,h);
  assert.equal(c.status,'parked');r.ws.refreshHuntReadiness(h.id);assert.equal(r.ws.getHuntCard(c.id).status,'parked');
});
test('a board must be paused before adding manual cards',()=>{
  const r=rig(),h=r.create();r.ws.updateHunt(h.id,{status:'active'});
  assert.throws(()=>addCard(r,h),e=>e.statusCode===409);
});
test('notes are separate from worker and reviewer results',()=>{
  const r=rig(),h=r.create(),c=addCard(r,h);
  r.run('PATCH',`/api/review/cards/${c.id}`,{expectedToken:c.editToken,note:'Human note'});
  const saved=r.ws.getHuntCard(c.id);assert.equal(saved.humanNotes,'Human note');assert.equal(saved.workerResult,null);assert.equal(saved.reviewResult,null);assert.equal(saved.status,'parked');
});
test('stale edits return a conflict and do not overwrite notes',()=>{
  const r=rig(),h=r.create(),c=addCard(r,h);
  r.run('PATCH',`/api/review/cards/${c.id}`,{expectedToken:c.editToken,note:'First note'});
  assert.throws(()=>r.run('PATCH',`/api/review/cards/${c.id}`,{expectedToken:c.editToken,note:'Stale note'}),e=>e.statusCode===409);
  assert.equal(r.ws.getHuntCard(c.id).humanNotes,'First note');
});
test('manual status changes cannot manufacture completion or execution stages',()=>{
  const r=rig(),h=r.create(),c=addCard(r,h);
  for(const status of ['ready','active','review','done'])assert.throws(()=>r.run('PATCH',`/api/review/cards/${c.id}`,{expectedToken:c.editToken,status,note:'Not proof'}));
  assert.equal(r.ws.getHuntCard(c.id).status,'parked');
});
test('a running card cannot be moved, and a blocker requires a reason',()=>{
  const r=rig(),h=r.create(),c=addCard(r,h);
  assert.throws(()=>r.run('PATCH',`/api/review/cards/${c.id}`,{expectedToken:c.editToken,status:'blocked'}));
  r.ws.updateHuntCard(c.id,{status:'active',assignedTo:'auditor'});
  assert.throws(()=>r.run('PATCH',`/api/review/cards/${c.id}`,{expectedToken:editToken(r.ws.getHuntCard(c.id)),status:'parked'}),e=>e.statusCode===409);
});
test('pausing stops only residents assigned to this board, resuming does not dispatch',()=>{
  const r=rig(),h=r.create(),c=addCard(r,h);let stopped=0,other=0;
  r.ws.updateHuntCard(c.id,{status:'active',assignedTo:'auditor'});
  r.swarm.runtimes.set('auditor',{busy:true,stop(){stopped++}});
  r.swarm.runtimes.set('analyst',{busy:true,stop(){other++}});
  r.run('PATCH',`/api/review/hunts/${h.id}/status`,{status:'paused',expectedToken:editToken(r.ws.getHunt(h.id))});
  assert.equal(stopped,1);assert.equal(other,0);
  const result=r.run('PATCH',`/api/review/hunts/${h.id}/status`,{status:'active',expectedToken:editToken(r.ws.getHunt(h.id))});
  assert.equal(result.executionStarted,false);
});
test('metadata validation rejects unknown fields, credentials in URLs and cross-board dependencies',()=>{
  const r=rig(),h=r.create(),other=r.create(),c=addCard(r,other);
  assert.throws(()=>addCard(r,h,{dependsOn:[c.id]}));
  assert.throws(()=>r.run('POST','/api/review/hunts',{title:'x',pageUrl:'https://user:password@example.invalid',rules:'x',scope:[],exclusions:[],testingRules:[]}));
  assert.throws(()=>r.run('POST','/api/review/hunts',{title:'x',pageUrl:'https://example.invalid',rules:'x',scope:[],exclusions:[],testingRules:[],run:true}));
  assert.equal(r.ws.listHunts().length,2);
});
test('board snapshots include edit tokens without persisting presentation fields',()=>{
  const r=rig(),h=r.create(),c=addCard(r,h),view=reviewBoardView(r.ws);
  assert.equal(view.cards[0].editToken,editToken(r.ws.getHuntCard(c.id)));
  assert.equal(r.ws.getHuntCard(c.id).editToken,undefined);
  assert.equal(r.ws.getHunt(h.id).editToken,undefined);
});
