import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULTS } from '../src/config.mjs';
import { Store } from '../src/store.mjs';
import { Toolbox } from '../src/tools.mjs';
import { Eutrya } from '../src/runtime.mjs';
import { ScriptedCortex, MockJev } from '../src/providers/mock.mjs';

export function proposal(actions) {
  return {summary:'A task-relevant fixture conclusion.',hypotheses:[],unknowns:[],candidates:actions.map((a,i)=>({id:String.fromCharCode(97+i),summary:'Candidate '+i,evidence:[],expected:'Observe the result.',action:a}))};
}
export function rig(t,{actions=null,proposals=null,cortex=null,jev=null,approve=async()=>true,config={},environment=null,events=null,compactionScope=null}={}) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eutrya-test-'));
  const workspace=path.join(root,'workspace');fs.mkdirSync(workspace);
  const settings={...DEFAULTS,maxSteps:1,retries:0,sessionRoot:path.join(root,'sessions'),...config};
  const store=new Store(settings.sessionRoot,workspace,{environment,redact:x=>x});
  const toolbox=new Toolbox({workspace,store,config:settings,approve});
  const model=cortex??new ScriptedCortex(proposals??[proposal(actions??[{type:'finish',answer:'Fixture answer.'}])]);
  const evaluator=jev??new MockJev();
  const runtime=new Eutrya({store,cortex:model,jev:evaluator,toolbox,config:settings,redact:x=>x,onEvent:r=>events?.push(r),compactionScope:compactionScope?{...compactionScope,sessionId:store.state.id}:null});
  runtime.startTask('Complete the local fixture task.');
  t.after(()=>{store.close();fs.rmSync(root,{recursive:true,force:true});});
  return {root,workspace,settings,store,toolbox,runtime,model,evaluator};
}
