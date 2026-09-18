import fs from 'node:fs';
import path from 'node:path';
import { atomicJson,processLock,LocalState } from '../local-state.mjs';
import { NativeAdapters } from './adapters.mjs';
import { WebhookAdapter,WhatsAppAdapter } from './webhook.mjs';
import { GatewayRouter } from './router.mjs';
import { requireProviders } from '../bootstrap.mjs';
import { insist,redactor } from '../util.mjs';
export async function flushScheduled(router,config){
  const db=new LocalState(path.join(config.stateRoot,'scheduled-outbox.json'),{messages:[]});
  for(const item of db.read().messages.filter(m=>m.status==='queued')){
    const r=router.db.read().routes[item.route];let ok=false;
    // Re-authorize deliveries against today's allowlist, not the historical one.
    const pc=r?config.platforms[r.platform]:null;
    if(!r||!pc?.enabled||!pc.allowedUsers.includes(r.userId)||(pc.allowedChats.length&&!pc.allowedChats.includes(r.chatId))){db.transaction(s=>{const m=s.messages.find(m=>m.id===item.id);if(m)m.status='blocked';});continue;}
    db.transaction(s=>{const m=s.messages.find(m=>m.id===item.id);if(m?.status==='queued'){m.status='sending';ok=true;}});if(!ok)continue;
    try{await router.deliver({...r,id:item.id,text:'',direct:true},item.text);db.transaction(s=>{s.messages.find(m=>m.id===item.id).status='sent';});}
    catch{db.transaction(s=>{s.messages.find(m=>m.id===item.id).status='delivery_unknown';});}
  }
}
export async function startGateway(config,agentConfig,{demo=false,signal,log=console.log}={}){
  if(!demo)requireProviders(agentConfig);const redact=redactor();
  fs.mkdirSync(config.stateRoot,{recursive:true,mode:0o700});const unlock=processLock(path.join(config.stateRoot,'gateway.pid'));
  const all={...NativeAdapters,webhook:WebhookAdapter,whatsapp:WhatsAppAdapter};const adapters={};const status={pid:process.pid,startedAt:new Date().toISOString(),mode:demo?'OFFLINE FIXTURES':'live',platforms:{},heartbeat:null};
  const controller=new AbortController();const sig=signal?AbortSignal.any([controller.signal,signal]):controller.signal;
  const event=(type,data={})=>log(redact({at:new Date().toISOString(),type,data}));let router,timer,flushing=null;
  try{
    const enabled=Object.entries(config.platforms).filter(([,p])=>p.enabled);insist(enabled.length,'No messaging platforms enabled. Run eutrya gateway setup.');
    for(const [name,p]of enabled)adapters[name]=new all[name](p);
    router=new GatewayRouter({config,agentConfig,adapters,demo,log:event});
    for(const [name,adapter]of Object.entries(adapters)){
      try{await adapter.start({receive:m=>router.accept(m),signal:sig,log:event,stateRoot:config.stateRoot});status.platforms[name]='started';event('gateway.adapter_started',{name});}
      catch(e){status.platforms[name]='failed';event('gateway.adapter_failed',{name,error:e.message});throw e;}
    }
    const scheduled=new LocalState(path.join(config.stateRoot,'scheduled-outbox.json'),{messages:[]});
    scheduled.transaction(s=>{for(const m of s.messages)if(m.status==='sending')m.status='delivery_unknown';});
    const heartbeat=()=>{status.heartbeat=new Date().toISOString();atomicJson(path.join(config.stateRoot,'status.json'),status);if(!flushing)flushing=flushScheduled(router,config).catch(()=>event('gateway.schedule_delivery_error')).finally(()=>{flushing=null;});};heartbeat();timer=setInterval(heartbeat,5000);
    router.drain();
    await new Promise(resolve=>{if(sig.aborted)resolve();else sig.addEventListener('abort',resolve,{once:true});});
  }finally{
    controller.abort();clearInterval(timer);await flushing;await router?.close();await Promise.allSettled(Object.values(adapters).map(a=>a.close()));
    status.stoppedAt=new Date().toISOString();atomicJson(path.join(config.stateRoot,'status.json'),status);unlock();
  }
}
