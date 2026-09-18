import fs from 'node:fs';
import path from 'node:path';
import { LocalState,atomicJson,processLock } from './local-state.mjs';
import { Store } from './store.mjs';
import { makeEngine,requireProviders } from './bootstrap.mjs';
import { DailyBudget } from './gateway/security.mjs';
import { uid,insist,integer,redactor,BudgetError } from './util.mjs';

function cronField(text,lo,hi){
  const values=new Set();
  for(const item of text.split(',')){
    const match=item.match(/^(\*|\d+(?:-\d+)?)(?:\/(\d+))?$/);insist(match,'Unsupported cron syntax: use numeric lists, ranges, stars and steps');
    const step=Number(match[2]??1);insist(step>=1&&step<=hi+1,'Invalid cron step');
    const [a,b]=match[1]==='*'?[lo,hi]:match[1].includes('-')?match[1].split('-').map(Number):[Number(match[1]),match[2]?hi:Number(match[1])];
    insist(a>=lo&&b<=hi&&a<=b,'Cron value out of range');for(let i=a;i<=b;i+=step)values.add(i);
  }
  return {values,wildcard:text.startsWith('*')};
}
export function parseCron(text){
  insist(typeof text==='string'&&text.length<=160,'Invalid cron expression');const a=text.trim().split(/\s+/);insist(a.length===5,'Use five cron fields: minute hour day-of-month month weekday');
  return [cronField(a[0],0,59),cronField(a[1],0,23),cronField(a[2],1,31),cronField(a[3],1,12),cronField(a[4],0,7)];
}
export function validateTimezone(zone){new Intl.DateTimeFormat('en-US',{timeZone:zone}).format(new Date());return zone;}
export function cronMatches(cron,date,zone='UTC'){
  const fields=typeof cron==='string'?parseCron(cron):cron;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'numeric',day:'numeric',hour:'numeric',minute:'numeric',weekday:'short',hourCycle:'h23'}).formatToParts(date).map(p=>[p.type,p.value]));
  const dow=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(parts.weekday),day=fields[2].values.has(Number(parts.day)),week=fields[4].values.has(dow)||(dow===0&&fields[4].values.has(7));
  const dayMatches=fields[2].wildcard?week:fields[4].wildcard?day:day||week;
  return fields[0].values.has(Number(parts.minute))&&fields[1].values.has(Number(parts.hour))&&fields[3].values.has(Number(parts.month))&&dayMatches;
}
export class Jobs {
  constructor(root){this.root=root;this.db=new LocalState(path.join(root,'jobs.json'),{jobs:[]});}
  add({task,workspace,cron=null,at=null,timezone='UTC',name='Scheduled task',allowWrite=false,maxCalls=60,maxSteps=12,delivery=null}){
    insist(task&&task.length<=8000,'A job task must contain 1..8000 characters');insist(Boolean(cron)!==Boolean(at),'Choose exactly one of --cron or --at');
    if(cron)parseCron(cron);validateTimezone(timezone);
    if(at){insist(/(?:Z|[+-]\d{2}:\d{2})$/.test(at)&&Number.isFinite(Date.parse(at)),'Use an ISO timestamp with an explicit UTC offset or Z');insist(Date.parse(at)>Date.now(),'One-shot job time must be in the future');}
    integer(maxCalls,'maxCalls',1,10000);integer(maxSteps,'maxSteps',1,500);
    const j={id:uid(),name,task:redactor()(task),workspace:fs.realpathSync(workspace),cron,at,timezone,allowWrite,maxCalls,maxSteps,delivery,status:'enabled',lastSlot:null,createdAt:new Date().toISOString()};
    this.db.transaction(s=>{insist(s.jobs.length<100,'At most 100 jobs per profile');s.jobs.push(j);});return j;
  }
  list(){return this.db.read().jobs;}
  set(id,status){insist(['enabled','disabled'].includes(status),'Invalid job status');this.db.transaction(s=>{const j=s.jobs.find(j=>j.id===id);insist(j,'Job not found');j.status=status;});}
  remove(id){this.db.transaction(s=>{insist(s.jobs.some(j=>j.id===id),'Job not found');s.jobs=s.jobs.filter(j=>j.id!==id);});}
}
export class Scheduler {
  constructor(jobs,run,{now=()=>new Date(),log=()=>{},signal=null}={}){this.jobs=jobs;this.run=run;this.now=now;this.log=log;this.signal=signal;this.active=false;}
  recover(){this.jobs.db.transaction(s=>{for(const j of s.jobs)if(j.status==='running'){j.status='needs_review';j.lastError='Interrupted run not replayed. Inspect its session before explicitly enabling.';}});}
  async tick(date=this.now()){
    if(this.active)return;this.active=true;
    try{
      for(const job of this.jobs.list()){
        if(this.signal?.aborted)break;
        if(job.status!=='enabled')continue;const slot=date.toISOString().slice(0,16);
        const due=job.at?Date.parse(job.at)<=date.getTime():cronMatches(job.cron,date,job.timezone);
        if(!due||job.lastSlot===slot)continue;
        let claimed=false;
        this.jobs.db.transaction(s=>{const j=s.jobs.find(j=>j.id===job.id);if(j?.status==='enabled'){j.status='running';j.lastSlot=slot;j.lastStartedAt=date.toISOString();claimed=true;}});
        if(!claimed)continue;
        try{const result=await this.run(job);this.jobs.db.transaction(s=>{const j=s.jobs.find(j=>j.id===job.id);if(!j)return;j.lastResult=result;j.lastFinishedAt=this.now().toISOString();if(j.status==='running')j.status=result.status==='NEEDS_REVIEW'?'needs_review':job.at?'complete':'enabled';});}
        catch(e){this.jobs.db.transaction(s=>{const j=s.jobs.find(j=>j.id===job.id);if(j){j.lastError=redactor()(e.message);j.status='needs_review';}});this.log('job.needs_review',{id:job.id});}
      }
    }finally{this.active=false;}
  }
}
export async function runJob(job,config,{demo=false,signal,budgetPool=null,onEvent=()=>{}}={}){
  const cfg={...config,allowExec:false,autoWrite:job.allowWrite,maxCalls:job.maxCalls,maxSteps:job.maxSteps};
  const store=new Store(cfg.sessionRoot,job.workspace);const engine=makeEngine({store,config:cfg,demo,readOnly:!job.allowWrite,budgetPool,onEvent,namespace:'scheduled:'+job.id});
  const stop=()=>engine.stop();signal?.addEventListener('abort',stop,{once:true});
  try{
    engine.startTask(job.task);if(signal?.aborted)throw new Error('Scheduler stopping');await engine.run();
    const result={sessionId:store.state.id,status:store.state.status,answer:store.state.answer,reason:store.state.reason,meter:store.state.meter,workspace:job.workspace};
    atomicJson(path.join(config.dataRoot,'job-results',job.id,uid()+'.json'),result);
    if(job.delivery&&result.answer){const outbox=new LocalState(path.join(job.delivery.stateRoot,'scheduled-outbox.json'),{messages:[]});outbox.transaction(s=>{insist(s.messages.length<500,'Scheduled delivery queue is full');s.messages.push({id:uid(),route:job.delivery.route,text:result.answer,status:'queued',at:new Date().toISOString()});});}
    return result;
  }finally{signal?.removeEventListener('abort',stop);store.close();}
}
export async function startScheduler(jobs,config,{demo=false,signal,log=console.log}={}){
  if(!demo)requireProviders(config);const unlock=processLock(path.join(jobs.root,'scheduler.pid'));
  const budget=new DailyBudget(path.join(jobs.root,'daily-budget.json'),1000);
  const scheduler=new Scheduler(jobs,j=>runJob(j,config,{demo,signal,budgetPool:budget}),{log,signal});scheduler.recover();
  const interval=setInterval(()=>scheduler.tick().catch(e=>log('scheduler.error',{message:e.message})),15000);
  try{await scheduler.tick();await new Promise(resolve=>{if(signal?.aborted)resolve();else signal?.addEventListener('abort',resolve,{once:true});});clearInterval(interval);while(scheduler.active)await new Promise(r=>setTimeout(r,50));}
  finally{clearInterval(interval);unlock();}
}
export async function runTeam(tasks,config,{parallel=2,demo=false,log=()=>{},signal=null}={}){
  insist(Array.isArray(tasks)&&tasks.length>0&&tasks.length<=8,'Provide 1..8 explicit tasks');integer(parallel,'parallel',1,4);
  for(const t of tasks){insist(typeof t.task==='string'&&t.task.trim()&&t.task.length<=8000&&typeof t.workspace==='string','Every team task needs task and workspace');t.workspace=fs.realpathSync(t.workspace);}
  if(!demo)requireProviders(config);
  const batch=uid(),root=path.join(config.dataRoot,'teams',batch),meter=new LocalState(path.join(root,'budget.json'),{calls:0});
  const pool={reserve:()=>meter.transaction(s=>{if(s.calls>=config.maxCalls)throw new BudgetError('Shared team provider-attempt cap reached');s.calls++;})};
  const results=new Array(tasks.length);let next=0;
  async function worker(){while(next<tasks.length){const i=next++,t=tasks[i];insist(typeof t.task==='string'&&typeof t.workspace==='string','Every team task needs task and workspace');const job={...t,id:uid(),allowWrite:false,maxCalls:config.maxCalls,maxSteps:config.maxSteps};try{results[i]=await runJob(job,config,{demo,signal,budgetPool:pool,onEvent:e=>log(i,e)});}catch(e){results[i]={status:'ERROR',reason:redactor()(e.message),taskIndex:i};}}}
  await Promise.all(Array.from({length:Math.min(parallel,tasks.length)},worker));const report={id:batch,mode:demo?'OFFLINE FIXTURES':'live',requestCap:config.maxCalls,calls:meter.read().calls,results};atomicJson(path.join(root,'result.json'),report);return report;
}
