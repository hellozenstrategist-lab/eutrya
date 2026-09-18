import fs from 'node:fs';
import path from 'node:path';
import { LocalState } from '../local-state.mjs';
import { Store } from '../store.mjs';
import { makeEngine } from '../bootstrap.mjs';
import { statusText } from '../ui.mjs';
import { redactor,uid,clip,insist,digest } from '../util.mjs';
import { Approvals,DailyBudget,normalizeMessage,routeKey,eventKey,authorized } from './security.mjs';

export const GATEWAY_HELP=`Eutrya · Jev-native messaging\n/help /whoami /status /usage /last\n/new /continue /compact /stop\n/steer TEXT /model MODEL_ID\n/approve ID /deny ID /resolve NOTE\n/memory /skills\nOrdinary messages are queued per sender and conversation. /steer redirects current work. No command disables Jev. Remote commands need individual approval when locally enabled.`;
const FAST=new Set(['help','whoami','status','usage','last','stop','steer','approve','deny','memory','skills']);
export class GatewayRouter {
  constructor({config,agentConfig,adapters,factory=makeEngine,demo=false,log=()=>{}}){
    this.config=config;this.agentConfig=agentConfig;this.adapters=adapters;this.factory=factory;this.demo=demo;this.log=log;this.redact=redactor();
    this.db=new LocalState(path.join(config.stateRoot,'router.json'),{inbox:[],receipts:[],routes:{},deliveries:[]});
    this.routes=new Map();this.active=new Map();this.controls=new Set();this.rate=new Map();this.approvals=new Approvals();this.closed=false;this.lastBusy=new Map();
    this.budget=new DailyBudget(path.join(config.stateRoot,'daily-budget.json'),config.maxProviderCallsPerDay);
    this.db.transaction(s=>{for(const item of s.inbox)if(item.status==='running'){item.status='needs_review';item.error='Gateway interrupted during this turn; inspect the session. It was not replayed.';}});
  }
  command(m){const match=m.text.match(/^\/([a-z_]+)(?:\s+([\s\S]*))?$/);return match?{name:match[1],arg:(match[2]??'').trim()}:null;}
  async accept(raw){
    if(this.closed)return {accepted:false,busy:true};
    let m;try{m=normalizeMessage(raw);}catch{this.log('gateway.invalid_message',{});return {accepted:false,invalid:true};}const platform=this.config.platforms[m.platform];
    if(!authorized(m,platform)){this.log('gateway.rejected',{platform:m.platform});return {accepted:false};}
    const key=routeKey(m),id=eventKey(m),cmd=this.command(m);
    if(this.db.read().receipts.includes(id))return {accepted:true,duplicate:true};
    const isFast=cmd&&FAST.has(cmd.name);
    if(!isFast){const rk=m.platform+':'+m.userId,now=Date.now(),previous=this.rate.get(rk);const r=previous&&now-previous.start<60000?previous:{start:now,count:0};if(r.count>=this.config.requestsPerMinute){this.notifyBusy(key,m);return {accepted:false,busy:true};}r.count++;this.rate.set(rk,r);}
    let full=false;
    this.db.transaction(s=>{
      if(s.receipts.includes(id))return;
      if(!isFast&&s.inbox.filter(x=>x.status==='queued').length>=this.config.maxQueue){full=true;return;}
      s.receipts.push(id);s.receipts=s.receipts.slice(-20000);
      if(!isFast){s.inbox.push({id,key,message:this.redact(m),status:'queued',at:new Date().toISOString()});s.inbox=s.inbox.filter(x=>!['done','error','cancelled'].includes(x.status)).concat(s.inbox.filter(x=>['done','error','cancelled'].includes(x.status)).slice(-200));}
    });
    if(full){this.notifyBusy(key,m);return {accepted:false,busy:true};}
    if(isFast){const operation=this.fast(key,m,cmd).catch(e=>this.deliver(m,'Command failed: '+clip(this.redact(e.message),500)).catch(()=>{}));this.controls.add(operation);operation.finally(()=>this.controls.delete(operation));}
    else this.drain();
    return {accepted:true,route:key};
  }
  notifyBusy(key,m){const now=Date.now();if(now-(this.lastBusy.get(key)??0)<60000)return;this.lastBusy.set(key,now);const p=this.deliver(m,'Eutrya is busy or this sender reached the message limit. This task was not queued. Retry later; /stop and /status remain available.').catch(()=>{});this.controls.add(p);p.finally(()=>this.controls.delete(p));}
  async deliver(message,text){
    const id=uid(),m={...message,deliveryId:id};const clean=this.redact(String(text)).slice(0,18000);
    this.db.transaction(s=>{s.deliveries.push({id,route:routeKey(m),status:'sending',at:new Date().toISOString(),text:clean});s.deliveries=s.deliveries.slice(-500);});
    try{const adapter=this.adapters[m.platform];insist(adapter,'Adapter not running');await adapter.send(m,clean);this.db.transaction(s=>{const row=s.deliveries.find(x=>x.id===id);if(row)row.status='sent';});}
    catch(e){this.db.transaction(s=>{const row=s.deliveries.find(x=>x.id===id);if(row)row.status='delivery_unknown';});this.log('gateway.delivery_unknown',{platform:m.platform,id});throw new Error('Message delivery failed or is uncertain; the task is not replayed. Use /last to retrieve its final answer.');}
  }
  open(key,m){
    if(this.routes.has(key)){const entry=this.routes.get(key);entry.used=Date.now();return entry;}
    if(this.routes.size>=this.config.maxRoutes){const idle=[...this.routes].filter(([k])=>!this.active.has(k)).sort((a,b)=>a[1].used-b[1].used)[0];insist(idle,'All route slots are busy');idle[1].store.close();this.routes.delete(idle[0]);}
    const old=this.db.read().routes[key];const workspace=path.join(this.config.workspaceRoot,key);fs.mkdirSync(workspace,{recursive:true,mode:0o700});
    const cfg={...this.agentConfig,allowExec:this.config.allowExec,autoWrite:false,sessionRoot:path.join(this.config.stateRoot,'sessions'),...(old?.mainModel?{mainModel:old.mainModel}:{})};
    const store=new Store(cfg.sessionRoot,workspace,{...(old?.sessionId?{id:old.sessionId,existing:true}:{})});
    try {
    if(store.state.engine){insist(store.state.engine.mode===(this.demo?'demo':'live'),'Gateway mode differs from the saved route. Use a separate profile for demo/live.');insist(!store.state.engine.mainProvider||store.state.engine.mainProvider===cfg.mainProvider,'Saved gateway route uses a different text provider; choose a separate profile.');}
    else{store.state.engine={mode:this.demo?'demo':'live',mainModel:cfg.mainModel,mainProvider:cfg.mainProvider};store.save();}
    const approve=(action,signal)=>this.approvals.request(key,action,text=>this.deliver(m,text),signal);
    const engine=this.factory({store,config:cfg,approve,namespace:'gateway:'+key,demo:this.demo,budgetPool:this.budget,onEvent:row=>{if(['provider.error','run.stopped'].includes(row.type))this.log(row.type,{route:key,...row.data});}});
    const entry={store,engine,config:cfg,used:Date.now()};this.routes.set(key,entry);
    this.db.transaction(s=>{s.routes[key]={sessionId:store.state.id,mainModel:cfg.mainModel,platform:m.platform,userId:m.userId,chatId:m.chatId,threadId:m.threadId,workspace};});
    return entry;
    } catch(e){store.close();this.routes.delete(key);throw e;}
  }
  async fast(key,m,cmd){
    const entry=this.routes.get(key)??(this.db.read().routes[key]?this.open(key,m):null),engine=entry?.engine;
    switch(cmd.name){
      case 'help':await this.deliver(m,GATEWAY_HELP);return;
      case 'whoami':await this.deliver(m,`Platform: ${m.platform}\nUser: ${m.userId}\nChat: ${m.chatId}\nThread: ${m.threadId||'(none)'}\nRoute: ${key}`);return;
      case 'status':case 'usage':await this.deliver(m,engine?statusText(engine.state):'No session started yet.');return;
      case 'last':await this.deliver(m,engine?.state.answer||'No completed answer in this session.');return;
      case 'stop':this.approvals.cancel(key);engine?.stop();this.db.transaction(s=>{for(const x of s.inbox)if(x.key===key&&x.status==='queued')x.status='cancelled';});await this.deliver(m,'Stop requested; queued turns cancelled. Completed effects are not undone.');return;
      case 'approve':case 'deny':{const matched=this.approvals.answer(key,cmd.arg,cmd.name==='approve');await this.deliver(m,matched?'Decision recorded.':'No matching approval for this sender and conversation, or it expired.');return;}
      case 'steer':insist(engine,'Start a task first');engine.steer(cmd.arg);this.approvals.cancel(key);await this.deliver(m,'Guidance recorded for the next decision boundary.');return;
      case 'memory':await this.deliver(m,engine?JSON.stringify(engine.toolbox.knowledge.memories(),null,2):'No memory for this route yet.');return;
      case 'skills':await this.deliver(m,engine?JSON.stringify(engine.toolbox.knowledge.listSkills(),null,2):'No installed skills for this route.');return;
    }
  }
  drain(){
    if(this.closed)return;
    while(this.active.size<this.config.maxConcurrent){
      const item=this.db.read().inbox.find(x=>x.status==='queued'&&!this.active.has(x.key));if(!item)break;
      this.db.transaction(s=>{const x=s.inbox.find(x=>x.id===item.id);if(x)x.status='running';});
      // Reserve the per-route slot before asynchronous work can re-enter the dispatcher.
      const work=Promise.resolve().then(()=>this.runItem(item)).catch(e=>this.log('gateway.turn_error',{route:item.key,error:this.redact(e.message)})).finally(()=>{this.active.delete(item.key);this.drain();});
      this.active.set(item.key,work);
    }
  }
  async runItem(item){
    const m=item.message,key=item.key;let status='done',error=null;
    try{
      if(m.unsupported){await this.deliver(m,'This Eutrya gateway currently processes text only. Send the request as text; attachments and voice were not read.');return;}
      let entry=this.open(key,m),engine=entry.engine;const cmd=this.command(m);
      if(cmd){
        if(cmd.name==='new'){
          insist(!engine.state.pending,'Resolve the uncertain action before starting a new session');entry.store.close();this.routes.delete(key);this.db.transaction(s=>{delete s.routes[key];});entry=this.open(key,m);await this.deliver(m,'New session created. Approved route memory is retained.');return;
        }
        if(cmd.name==='compact'){
          const r=await engine.compact(),s=r.stats;
          await this.deliver(m,`Jev compaction: ${r.status}; ${s.before??'n/a'} → ${s.after} ${s.unit}; ${s.requests} evaluator request(s). Originals and usage remain retained.`);return;
        }
        if(cmd.name==='model'){insist(cmd.arg&&cmd.arg.length<=200&&!/\s/.test(cmd.arg)&&!cmd.arg.startsWith('typesafe-ai/'),'Provide a text-model ID');entry.config.mainModel=cmd.arg;engine.state.engine.mainModel=cmd.arg;engine.state.revision++;entry.store.save();this.db.transaction(s=>{s.routes[key].mainModel=cmd.arg;});await this.deliver(m,'Text model set to '+cmd.arg+'. Jev remains mandatory.');return;}
        if(cmd.name==='resolve'){engine.resolve(cmd.arg);await this.deliver(m,'Reconciliation recorded. Use /continue after inspecting the outcome.');return;}
        if(cmd.name!=='continue'){await this.deliver(m,'Unknown command. '+GATEWAY_HELP);return;}
      }else if(engine.state.status==='NEEDS_INPUT')engine.steer(m.text);
      else engine.startTask(m.text);
      await engine.run();
      const s=engine.state;
      await this.deliver(m,s.status==='ANSWERED'||s.status==='VERIFIED'?s.answer:s.status==='NEEDS_INPUT'?s.reason:`[${s.status}] ${s.reason||'Run paused.'}\nUse /status or /continue.`);
    }catch(e){status='error';error=this.redact(e.message);await this.deliver(m,'Turn stopped: '+clip(error,800)).catch(()=>{});}
    finally{this.db.transaction(s=>{const x=s.inbox.find(x=>x.id===item.id);if(x){x.status=status;x.error=error;x.completedAt=new Date().toISOString();}});}
  }
  async idle(){while(this.active.size||this.controls.size)await Promise.allSettled([...this.active.values(),...this.controls]);}
  async close(){this.closed=true;this.approvals.close();for(const e of this.routes.values())e.engine.stop();await this.idle();for(const e of this.routes.values())e.store.close();this.routes.clear();}
}
