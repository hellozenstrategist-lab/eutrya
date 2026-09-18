import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig } from '../src/config.mjs';
import { NativeSwarm } from '../src/swarm/swarm.mjs';

function rig(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'eutrya-pause-'));
  const config=loadConfig(undefined,{sessionRoot:path.join(dir,'state'),mainModel:'mock/text'});
  const swarm=new NativeSwarm({config,workspace:dir,demo:true});
  t.after(()=>{swarm.close();fs.rmSync(dir,{recursive:true,force:true})});
  const hunt=swarm.sharedWorkspace.createHunt({title:'Local fixture',pageUrl:'https://example.invalid',rules:'Fixture only'});
  const card=swarm.sharedWorkspace.createHuntCard({huntId:hunt.id,title:'Review fixture',objective:'Inspect supplied notes'});
  return {swarm,hunt,card};
}
test('pause during an in-flight routing decision prevents the resulting assignment',async t=>{
  const {swarm,hunt,card}=rig(t);let executed=false;
  swarm.routeHuntCard=async()=>{swarm.sharedWorkspace.updateHunt(hunt.id,{status:'paused'});return {agentId:'auditor',source:'mock',probability:1}};
  swarm.executeHuntCard=async()=>{executed=true;throw new Error('Must not execute after pause')};
  const result=await swarm.runHuntBoard(hunt.id);
  assert.equal(executed,false);assert.equal(result.routed,0);assert.equal(card.status,'ready');assert.equal(hunt.status,'paused');
});
test('a paused partial worker result cannot advance a card into review or done',async t=>{
  const {swarm,hunt,card}=rig(t);
  const runtime={state:{status:'PAUSED',summary:'Partial notes',answer:null,reason:'Stopped'},startTask(){},async run(){}};
  swarm.getRuntime=()=>runtime;
  const result=await swarm.executeHuntCard(card.id,'auditor','ready',{source:'mock',probability:1});
  assert.equal(result.status,'blocked');assert.equal(card.status,'blocked');assert.equal(card.workerResult,null);assert.equal(hunt.status,'active');
});
