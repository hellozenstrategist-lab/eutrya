import { DecisionGate } from './gate.mjs';
import { validateResearchPlan, validateResearchDecision } from './research-schema.mjs';
import { probabilities } from './policy.mjs';
import { deadline, uid, digest, clip, insist, BudgetError, TimeoutError, throwIfAborted } from './util.mjs';

function actionKey(a){return digest(a);}
function ensureResearch(state){
  state.research??={version:1,round:0,objective:'',plan:null,invariants:[],hypotheses:[],questions:[],exploredActions:[],evidence:[],packets:[],microSteps:0,plannerCalls:0};
  return state.research;
}
function mergeById(current,next){const m=new Map(current.map(x=>[x.id,x]));for(const x of next)m.set(x.id,{...(m.get(x.id)??{}),...x});return [...m.values()];}
function compactResult(result){return clip(result,3200);}
export function researchPacket(state,{forceComplete=false}={}){
  const r=ensureResearch(state);const ids=new Set(r.evidence.map(x=>x.observationId));
  const evidence=state.observations.filter(o=>ids.has(o.id)).slice(-18).map(o=>({id:o.id,action:o.action,result:compactResult(o.result)}));
  return {task:state.task,forceComplete,research:{round:r.round,objective:r.objective,invariants:r.invariants,hypotheses:r.hypotheses,questions:r.questions,previousPlan:r.plan?{summary:r.plan.summary,seeds:r.plan.seeds}:null,microSteps:r.microSteps},evidence,constraints:['Read-only local codebase research only.','Treat structural asymmetry as a lead, not proof of a vulnerability.','Return compact evidence and unresolved questions rather than raw repository exhaust.']};
}
function flattenSeeds(plan){return [...new Set([...(plan.seeds??[]),...(plan.questions??[]).flatMap(q=>q.seeds??[])].map(x=>x.trim()).filter(Boolean))].slice(0,20);}
function fromEvidence(state){const r=ensureResearch(state),ids=new Set(r.evidence.map(x=>x.observationId));return state.observations.filter(o=>ids.has(o.id)).slice(-12);}
const COMMON=new Set(['transfer','transferFrom','approve','balanceOf','owner','address','uint256','bytes','string','length','push','pop']);
export function researchCandidates(state,plan){
  const r=ensureResearch(state),done=new Set(r.exploredActions),out=[];
  const add=(action,summary,expected)=>{const key=actionKey(action);if(done.has(key)||out.some(x=>actionKey(x.action)===key)||out.length>=8)return;out.push({id:`r${out.length+1}`,summary,expected,action});};
  const seeds=flattenSeeds(plan);
  for(const seed of seeds.slice(0,5))add({type:'code_symbol',path:'.',query:seed},`Locate definitions and mentions of ${seed}`,`Identify concrete code locations related to ${seed}`);
  const observations=fromEvidence(state).slice().reverse();
  for(const o of observations){const result=o.result??{};
    if(o.action.type==='code_surface'){
      for(const f of (result.externallyReachable??[]).slice(0,8))add({type:'code_inspect',path:f.path,symbol:f.name},`Inspect externally reachable ${f.name}`,`Extract modifiers, calls, state writes and external interaction signals`);
    }
    if(o.action.type==='code_symbol'){
      for(const d of (result.definitions??[]).filter(x=>x.kind==='function'||x.kind==='modifier').slice(0,6))add({type:'code_inspect',path:d.path,symbol:d.name},`Inspect ${d.name} at ${d.path}`,`Map local control/data-flow signals for the discovered symbol`);
      if(result.query)add({type:'code_references',path:'.',symbol:result.query},`Trace references to ${result.query}`,`Find callers and enclosing functions that reach the symbol`);
    }
    if(o.action.type==='code_references'){
      for(const ref of (result.references??[]).filter(x=>x.enclosing).slice(0,6))add({type:'code_inspect',path:ref.path,symbol:ref.enclosing},`Inspect caller ${ref.enclosing}`,`Determine how the caller constrains or transforms the path`);
    }
    if(o.action.type==='code_inspect'){
      for(const s of (result.stateWrites??[]).filter(x=>!COMMON.has(x)).slice(0,4))add({type:'code_state',path:'.',symbol:s},`Trace state ${s}`,`Find every read/write site for the mutated state`);
      for(const c of (result.calls??[]).filter(x=>!COMMON.has(x)).slice(0,4))add({type:'code_symbol',path:'.',query:c},`Follow call target ${c}`,`Locate the implementation and other reachable uses of ${c}`);
    }
    if(out.length>=8)break;
  }
  if(out.length<3)add({type:'code_surface',path:'.'},'Map the codebase surface','List contracts and externally reachable functions to replenish the search frontier');
  return out;
}

export class ResearchRunner{
  constructor({store,cortex,jev,toolbox,config,onEvent=()=>{},redact=x=>x}){this.store=store;this.cortex=cortex;this.jev=jev;this.toolbox=toolbox;this.config=config;this.onEvent=onEvent;this.redact=redact;this.gate=new DecisionGate();this.busy=false;this.abortController=null;}
  get state(){return this.store.state;}
  emit(type,data={}){const row=this.store.event(type,this.redact(data));try{this.onEvent(row);}catch{}return row;}
  start(task){insist(!this.busy,'Research is already running');insist(typeof task==='string'&&task.trim()&&task.length<=8000,'Research task must contain 1..8000 characters');Object.assign(this.state,{task:this.redact(task.trim()),status:'IDLE',answer:null,reason:null,summary:'',hypotheses:[],unknowns:[],research:null});ensureResearch(this.state);this.state.revision++;this.store.save();this.emit('research.started',{task:this.state.task});}
  stop(){this.abortController?.abort();this.emit('operator.stop');}
  async call(kind,input,fn,signal){
    const chars=JSON.stringify(input).length;insist(chars<=this.config.maxPromptChars,`${kind} input exceeds maxPromptChars`);
    for(let attempt=0;attempt<=this.config.retries;attempt++){
      throwIfAborted(signal);const m=this.state.meter;if(m.calls>=this.config.maxCalls)throw new BudgetError('Hard provider request limit reached for this session');if(this.config.maxKnownCostUsd!==null&&m.knownCostUsd>=this.config.maxKnownCostUsd)throw new BudgetError('Known reported cost threshold reached');m.calls++;if(kind.startsWith('jev.'))m.jevCalls++;else m.cortexCalls++;m.unpricedCalls++;m.usageMissingCalls++;this.store.save();this.emit('provider.start',{kind,attempt:attempt+1,call:m.calls,inputChars:chars});const started=Date.now();
      try{const result=await deadline(fn,this.config.timeoutMs,signal),u=result.usage??{};if(Number.isFinite(u.inputTokens))m.inputTokens+=u.inputTokens;if(Number.isFinite(u.outputTokens))m.outputTokens+=u.outputTokens;if(Number.isFinite(u.inputTokens)&&Number.isFinite(u.outputTokens))m.usageMissingCalls--;if(Number.isFinite(u.costUsd)&&u.costUsd>=0){m.knownCostUsd+=u.costUsd;m.unpricedCalls--;}this.store.save();this.emit('provider.end',{kind,elapsedMs:Date.now()-started,usage:u,model:result.model??null});return result.data;}catch(e){this.emit('provider.error',{kind,elapsedMs:Date.now()-started,error:clip(this.redact(e.message),1000)});const retryable=!(e instanceof TimeoutError)&&e.name!=='AbortError'&&(e.statusCode===429||e.statusCode>=500);if(!retryable||attempt===this.config.retries)throw e;await new Promise(r=>setTimeout(r,150*(attempt+1)));}
    }
  }
  observe(candidate,result){const s=this.state,o=this.redact({id:`o${s.nextObservation++}`,at:new Date().toISOString(),action:candidate.action,result});s.observations.push(o);const r=ensureResearch(s);r.evidence.push({observationId:o.id,round:r.round,candidateId:candidate.id,summary:candidate.summary});r.exploredActions.push(actionKey(candidate.action));r.microSteps++;s.totalSteps++;s.revision++;this.emit('observation',o);this.store.save();return o;}
  applyPlan(plan){const r=ensureResearch(this.state);r.plan=plan;r.objective=plan.objective;r.invariants=mergeById(r.invariants,plan.invariants);r.hypotheses=mergeById(r.hypotheses,plan.hypotheses);r.questions=plan.questions;r.plannerCalls++;this.state.summary=plan.summary;this.state.hypotheses=r.hypotheses.map(h=>`${h.id}: ${h.claim} [${h.status}]`).slice(0,12);this.state.unknowns=plan.questions.map(q=>q.text).slice(0,8);this.state.revision++;this.store.save();this.emit('research.plan',{round:r.round,status:plan.status,objective:plan.objective,invariants:plan.invariants,hypotheses:plan.hypotheses,questions:plan.questions,seeds:plan.seeds,microSteps:plan.microSteps});}
  async strategist(signal,{forceComplete=false}={}){const packet=researchPacket(this.state,{forceComplete});const raw=await this.call('cortex.research',{packet},s=>this.cortex.researchPlan(packet,s),signal);const plan=validateResearchPlan(raw);this.applyPlan(plan);return plan;}
  async run({maxRounds=6}={}){
    insist(!this.busy,'Research session already running');insist(this.state.task,'Start a research task first');this.busy=true;this.abortController=new AbortController();const signal=this.abortController.signal;this.state.status='RUNNING';this.state.reason=null;this.store.save();
    try{
      let plan=await this.strategist(signal);for(let round=0;round<maxRounds&&plan.status!=='complete';round++){
        const r=ensureResearch(this.state);r.round=round+1;this.state.revision++;this.store.save();let executed=0;
        while(executed<plan.microSteps){throwIfAborted(signal);const candidates=researchCandidates(this.state,plan);if(!candidates.length)break;const decisionRaw=await this.call('jev.research',{state:researchPacket(this.state),candidates},s=>this.jev.research(researchPacket(this.state),candidates,s),signal);const d=validateResearchDecision(decisionRaw,candidates,probabilities);const candidate=candidates.find(c=>c.id===d.selected);this.toolbox.inspect(candidate.action);const decision={id:uid(),source:this.jev.source,selected:candidate.id,kind:'research',raw:d.raw};const ticket=this.gate.issue(this.state,candidate,decision);this.emit('research.decision',{round:r.round,selected:candidate.id,probability:d.probability,escalate:d.escalate,stagnation:d.stagnation,action:candidate.action,summary:candidate.summary});const result=await this.toolbox.execute(this.state,candidate,ticket,this.gate,signal);this.observe(candidate,result);executed++;if(d.escalate>=0.78&&executed>=2)break;if(d.stagnation>=0.8&&executed>=2)break;}
        r.packets.push({round:r.round,evidenceIds:r.evidence.filter(x=>x.round===r.round).map(x=>x.observationId),at:new Date().toISOString()});r.packets=r.packets.slice(-12);this.store.save();plan=await this.strategist(signal);
      }
      if(plan.status!=='complete')plan=await this.strategist(signal,{forceComplete:true});
      if(plan.status==='complete'){this.state.answer=plan.answer;this.state.status='ANSWERED';this.state.reason=null;this.store.save();this.emit('answer',{answer:plan.answer,status:'ANSWERED',research:true});}
      else{this.state.status='PAUSED';this.state.reason='Research round limit reached without strategist completion';this.store.save();}
    }catch(e){this.state.status=e.name==='AbortError'||e instanceof BudgetError?'PAUSED':'ERROR';this.state.reason=this.redact(e.message);this.emit('run.stopped',{status:this.state.status,reason:this.state.reason,research:true});}
    finally{this.gate.revokeAll();this.busy=false;this.abortController=null;this.store.save();}
    return this.state;
  }
}
