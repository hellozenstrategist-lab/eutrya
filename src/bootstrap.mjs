import { Eutrya } from './runtime.mjs';
import { Toolbox } from './tools.mjs';
import { Knowledge } from './knowledge.mjs';
import { GatewayCortex,textModelReady } from './providers/gateway.mjs';
import { GatewayJev } from './providers/jev.mjs';
import { MockJev } from './providers/mock.mjs';
import { redactor,insist } from './util.mjs';
export class EchoFixtureCortex {
  constructor(){this.source='mock';}
  async propose(packet){return {data:{summary:'Offline gateway plumbing fixture; no live inference.',hypotheses:[],unknowns:[],candidates:[{id:'reply',summary:'Return fixture receipt',evidence:[],expected:'A text response is delivered',action:{type:'finish',answer:'[OFFLINE FIXTURE — not real AI]\nReceived: '+packet.task}}]},usage:{inputTokens:0,outputTokens:0,costUsd:0},model:'echo-fixture'};}
}
export function requireProviders(config,env=process.env){insist(env.AI_GATEWAY_API_KEY,'AI_GATEWAY_API_KEY is required for Jev, even when the main model uses OpenRouter or Ollama');textModelReady(config,env);}
export function makeEngine({store,config,approve=async()=>false,onEvent=()=>{},namespace='local',demo=false,mcp=null,readOnly=false,budgetPool=null}){
  if(!store.state.engine){store.state.engine={mode:demo?'demo':'live',fixture:demo?'echo':null,mainModel:config.mainModel,mainProvider:config.mainProvider,jevModel:config.jevModel};store.save();}
  insist(store.state.engine.mode===(demo?'demo':'live'),'Saved session mode and selected engine differ');
  const redact=redactor();const knowledge=new Knowledge(config.dataRoot,namespace,{redact});
  const cortex=demo?new EchoFixtureCortex():new GatewayCortex(config),jev=demo?new MockJev():new GatewayJev(config);
  const toolbox=new Toolbox({workspace:store.workspace,store,config,approve,redact,knowledge,mcp,readOnly});
  const contextProvider=()=>({ ...knowledge.context(store.workspace),...(mcp?{externalTools:mcp.catalog()}: {}) });
  const compactionScope={profileId:namespace.split(':')[0]||'local',userId:namespace,sessionId:store.state.id,agentId:namespace};
  return new Eutrya({store,cortex,jev,toolbox,config,redact,onEvent,contextProvider,budgetPool,compactionScope});
}
