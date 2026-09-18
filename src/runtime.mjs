import { DecisionGate } from './gate.mjs';
import { packetOf, compactState } from './memory.mjs';
import { validateProposal } from './schema.mjs';
import { validateAttention, selectCandidate, RUBRIC_VERSION } from './policy.mjs';
import { isEffect } from './tools.mjs';
import { BudgetError, Replan, UncertainEffect, TimeoutError, deadline, digest, uid, clip, insist, throwIfAborted, redactor } from './util.mjs';
import { cortexMessages } from './providers/gateway.mjs';
import { attentionQuestions, candidateQuestions } from './providers/jev.mjs';
import { installNativeCompaction } from '../extensions/eutrya-jev-compaction-extension/integration/native-v02.mjs';

export class Eutrya {
  constructor({store,cortex,jev,toolbox,config,onEvent=()=>{},redact=redactor(),contextProvider=null,budgetPool=null,profile=null,sharedWorkspace=null,swarm=null,adaptive=null,compactionScope=null}) {
    this.store=store;this.cortex=cortex;this.jev=jev;this.toolbox=toolbox;this.config=config;this.onEvent=onEvent;this.redact=redact;
    this.contextProvider=contextProvider;this.budgetPool=budgetPool;
    this.profile=profile;this.sharedWorkspace=sharedWorkspace;this.swarm=swarm;
    this.adaptive=adaptive;
    this.compactionSeamVersion=1;this.compaction=null;
    this.gate=new DecisionGate();this.busy=false;this.steering=[];this.abortController=null;
    insist(['jev','mock'].includes(jev.source),'Unknown evaluator source; no implicit fallback allowed');
    if(config.jevCompaction!==false&&compactionScope) {
      installNativeCompaction(this,{scope:compactionScope,allowMock:jev.source==='mock',options:{autoTriggerRatio:0.72,targetRatio:0.55}});
    }
  }
  get state() {return this.store.state;}
  emit(type,data={}) {
    const row=this.store.event(type,this.redact(data));
    try {this.onEvent(row);}catch{} // A display failure must not corrupt the controller.
    return row;
  }
  startTask(task) {
    insist(!this.busy,'Agent is already running; steer it instead');
    insist(!this.state.pending,'Resolve the pending action before starting another task');
    insist(typeof task==='string' && task.trim().length>0 && task.length<=8000,'Task must contain 1..8000 characters');
    if(this.state.task)this.state.previousTasks.push({
      task:clip(this.state.task,1200),
      status:this.state.status,
      answer:clip(this.state.answer??'',1600)
    });
    // Durable state keeps a bounded recent history. Full answers/events remain in
    // the append-only trace/shared chat; active packets project a smaller handoff.
    this.state.previousTasks=this.state.previousTasks.slice(-24);
    Object.assign(this.state,{task:this.redact(task.trim()),status:'IDLE',answer:null,reason:null,summary:'',hypotheses:[],unknowns:[],directives:[],lastMode:null});
    this.state.revision++;
    this.store.save();this.emit('task.started',{task:this.state.task});
  }
  steer(message) {
    insist(typeof message==='string' && message.trim().length>0 && message.length<=2000,'Steering must contain 1..2000 characters');
    const text=this.redact(message.trim());this.steering.push(text);this.emit('operator.steer',{text});
    if(!this.busy) {this.applySteering();this.state.status='PAUSED';this.store.save();}
  }
  applySteering() {
    if(!this.steering.length)return;
    this.state.directives.push(...this.steering.splice(0));if(!this.compaction)this.state.directives=this.state.directives.slice(-12);
    this.state.revision++;this.gate.revokeAll();this.store.save();
  }
  stop() {this.abortController?.abort();this.emit('operator.stop');}
  boundary(signal) {throwIfAborted(signal);if(this.steering.length)throw new Replan('Operator changed direction');}
  compact() {
    insist(!this.busy,'Stop or wait for a decision boundary before compacting');
    if(this.compaction)return this.compaction.manual();
    compactState(this.state);this.gate.revokeAll();this.store.save();this.emit('memory.compacted',{retained:this.state.observations.length});
    return {status:'legacy_compacted',stats:{before:null,after:this.state.observations.length,unit:'observations',requests:0}};
  }
  resolve(note) {
    insist(!this.busy && this.state.pending,'No paused pending action to resolve');
    insist(typeof note==='string' && note.trim().length>=8 && note.length<=2000,'Describe what you inspected and the actual outcome');
    this.observe({type:'note',text:'Operator reconciliation'}, {operatorAssertion:this.redact(note),independentlyVerified:false,pending:this.state.pending});
    this.state.pending=null;this.state.status='PAUSED';this.state.reason=null;this.state.revision++;this.store.save();
    this.emit('action.reconciled',{note:this.redact(note)});
  }
  observe(action,result) {
    const s=this.state;
    const observation=this.redact({id:`o${s.nextObservation++}`,at:new Date().toISOString(),action,result});
    s.observations.push(observation);this.emit('observation',observation);
    if(!this.compaction&&s.observations.length>48)s.observations=s.observations.slice(-24);
    if(action.type==='note') {s.notebook.push({observationId:observation.id,text:action.text,verified:false});if(!this.compaction)s.notebook=s.notebook.slice(-8);}
    s.revision++;return observation;
  }
  async call(kind,input,fn,signal) {
    const inputChars=JSON.stringify(input).length;
    insist(inputChars<=this.config.maxPromptChars,`${kind} input exceeds maxPromptChars (${inputChars}); reduce task, context, or edit size`);
    for(let attempt=0;attempt<=this.config.retries;attempt++) {
      throwIfAborted(signal);
      const m=this.state.meter;
      if(m.calls>=this.config.maxCalls)throw new BudgetError('Hard provider request limit reached for this session');
      if(this.config.maxKnownCostUsd!==null && m.knownCostUsd>=this.config.maxKnownCostUsd)throw new BudgetError('Known reported cost threshold reached; unpriced requests may also have incurred cost');
      this.budgetPool?.reserve();
      const generationId=uid();
      m.calls++;if(kind.startsWith('jev.'))m.jevCalls++;else m.cortexCalls++;
      m.unpricedCalls++;m.usageMissingCalls++;
      this.store.save(); // Reserve the call before any network request. Counts survive failures and restarts.
      this.emit('provider.start',{generationId,kind,attempt:attempt+1,call:m.calls,inputChars,source:kind.startsWith('jev.')?this.jev.source:this.cortex.source});
      const started=Date.now();
      try {
        const result=await deadline(fn,this.config.timeoutMs,signal);
        const u=result.usage??{};
        if(typeof u.inputTokens==='number' && Number.isFinite(u.inputTokens) && u.inputTokens>=0)m.inputTokens+=u.inputTokens;
        if(typeof u.outputTokens==='number' && Number.isFinite(u.outputTokens) && u.outputTokens>=0)m.outputTokens+=u.outputTokens;
        if(typeof u.inputTokens==='number' && typeof u.outputTokens==='number')m.usageMissingCalls--;
        if(typeof u.costUsd==='number' && Number.isFinite(u.costUsd) && u.costUsd>=0) {m.knownCostUsd+=u.costUsd;m.unpricedCalls--;}
        this.store.save();
        this.emit('provider.end',{kind,elapsedMs:Date.now()-started,usage:u,model:result.model??null});
        return result.data;
      } catch(e) {
        this.emit('provider.error',{kind,elapsedMs:Date.now()-started,error:clip(this.redact(e.message),1000),code:e.statusCode??null});
        // Timeouts/cancellation can leave a remote request in flight: never retry them automatically.
        const retryable=!(e instanceof TimeoutError) && e.name!=='AbortError' && (e.statusCode===429 || e.statusCode>=500);
        if(!retryable || attempt===this.config.retries)throw e;
        await new Promise(resolve=>setTimeout(resolve,150*(attempt+1)));
      }
    }
    throw new Error('Unreachable provider retry state');
  }
  async run() {
    insist(!this.busy,'Session already running');
    insist(this.state.task,'Enter a task first');
    insist(!this.state.pending,'An action has an uncertain outcome. Inspect it, then use /resolve <what actually happened>. It will not be replayed.');
    this.busy=true;this.abortController=new AbortController();const signal=this.abortController.signal;
    this.state.status='RUNNING';this.state.reason=null;this.store.save();
    let completed=0;
    try {
      while(completed<this.config.maxSteps) {
        this.applySteering();this.boundary(signal);
        try {
          if(this.contextProvider)this.state.taskContext=this.redact(this.contextProvider());
          const packetLimit=Math.max(3000,this.config.maxPromptChars-14000);
          const packet=this.compaction ? await this.compaction.packet(signal,{limit:packetLimit}) : packetOf(this.state,packetLimit);
          this.boundary(signal);
          packet.remainingCalls=this.config.maxCalls-this.state.meter.calls;
          const controlRaw=await this.call('jev.control',{state:packet,questions:attentionQuestions()},s=>this.jev.control(packet,s),signal);
          this.boundary(signal);
          const attention=validateAttention(controlRaw);
          this.state.lastMode=attention.mode;
          this.emit('jev.control',{source:this.jev.source,...attention});
          const tools=this.toolbox.available();
          const swarmOpts={profile:this.profile,swarmSummary:this.sharedWorkspace?.summary(),adaptivePreferences:this.adaptive?.status().learning?.preferences};
          const cortexInput=cortexMessages(packet,attention,tools,swarmOpts);
          const rawProposal=await this.call('cortex.propose',cortexInput,s=>this.cortex.propose(packet,attention,tools,s,swarmOpts),signal);
          this.boundary(signal);
          const knownEvidence=new Set(Array.from({length:this.state.nextObservation-1},(_,i)=>`o${i+1}`));
          const proposal=validateProposal(rawProposal,knownEvidence);
          this.emit('cortex.proposal',{proposal});
          let rankProposal=proposal;
          if(JSON.stringify(proposal).length>10000) {
            rankProposal={
              ...proposal,
              candidates: proposal.candidates.map(c=>({
                ...c,
                action: (c.action.type==='write' && c.action.content?.length>1000)
                  ? {...c.action, content: clip(c.action.content,1000)}
                  : (c.action.type==='edit' && (c.action.oldText?.length>500 || c.action.newText?.length>1000))
                  ? {...c.action, oldText: clip(c.action.oldText,500), newText: clip(c.action.newText,1000)}
                  : c.action
              }))
            };
          }
          const questions=candidateQuestions(rankProposal);
          const nonPacketChars=JSON.stringify({state:{packet:{},attention:{mode:attention.mode},proposal:rankProposal},questions}).length;
          const allowedPacketChars=Math.max(3000,this.config.maxPromptChars-nonPacketChars-200);
          let rankPacket=packet;
          if(JSON.stringify(packet).length>allowedPacketChars) {
            rankPacket=this.compaction ? await this.compaction.packet(signal,{limit:allowedPacketChars}) : packetOf(this.state,allowedPacketChars);
            this.boundary(signal);
          }
          rankPacket.remainingCalls=this.config.maxCalls-this.state.meter.calls;
          const rankInput={state:{packet:rankPacket,attention:{mode:attention.mode},proposal:rankProposal},questions};
          const rawRanks=await this.call('jev.rank',rankInput,s=>this.jev.rank(rankPacket,attention,rankProposal,s),signal);
          this.boundary(signal);
          const baseSelection=selectCandidate(proposal,rawRanks,attention,a=>this.toolbox.permitted(a));
          const selection=this.adaptive
            ? this.adaptive.decisions.chooseNative(baseSelection, {
                learningKey: `workspace:${attention.mode}`,
                continuityKey: this.state.task || 'default-task'
              })
            : baseSelection;
          const candidate=selection.selected;
          this.toolbox.inspect(candidate.action); // Reject invalid paths/hashes before issuing permission.
          const decision={id:uid(),source:this.jev.source,rubricVersion:RUBRIC_VERSION,selected:candidate.id,attention:attention.mode,raw:rawRanks,
            rankings:selection.ranked.map(({candidate:c,...rest})=>({candidateId:c.id,...rest})),
            ...(selection.adaptive?.decision ? {adaptive:selection.adaptive.decision} : {})};
          const ticket=this.gate.issue(this.state,candidate,decision);
          this.emit('decision',{...decision,ticket});
          const allowed=await this.toolbox.permission(candidate.action,signal);
          this.boundary(signal);
          this.gate.assert(this.state,candidate,ticket);
          let result;
          if(!allowed) {
            this.gate.revokeAll();result={denied:true,reason:'Operator did not approve this action; no tool executed'};
          } else {
            const effect=isEffect(candidate.action);
            if(effect) {
              this.state.pending={candidate,decisionId:decision.id,startedAt:new Date().toISOString(),status:'execution-may-have-started'};
              this.store.save();this.emit('action.prepared',this.state.pending);
            }
            result=await this.toolbox.execute(this.state,candidate,ticket,this.gate,signal);
          }
          // Conclusions remain model-labelled. They never replace the independent observation record.
          this.state.summary=proposal.summary;this.state.hypotheses=proposal.hypotheses;this.state.unknowns=proposal.unknowns;
          this.observe(candidate.action,result);this.state.totalSteps++;completed++;
          // Record the result durably BEFORE clearing an external-effect journal entry.
          this.store.save();
          if(this.state.pending) {
            const pending=this.state.pending;
            try {this.state.pending=null;this.store.save();}
            catch(e) {this.state.pending=pending;throw new UncertainEffect('Could not finalize the effect journal: '+e.message);}
          }
          this.emit('step.completed',{step:this.state.totalSteps,action:candidate.action.type});
          if(candidate.action.type==='finish' && allowed) {
            if(result.verification==='FAILED') {
              this.emit('verification.failed',{reason:'The independent switchboard checker rejected completion'});
            } else {
              this.state.answer=result.answer;this.state.status=result.verification==='VERIFIED'?'VERIFIED':'ANSWERED';
              this.store.save();this.emit('answer',{answer:result.answer,status:this.state.status});return this.state;
            }
          }
          if(candidate.action.type==='ask' && allowed) {this.state.status='NEEDS_INPUT';this.state.reason=result.question;this.store.save();this.emit('input.required',{question:result.question});return this.state;}
          const last=this.state.observations.slice(-3);
          if(last.length===3 && last.every(o=>digest({action:o.action,result:o.result})===digest({action:last[0].action,result:last[0].result}))) {
            this.state.status='PAUSED';this.state.reason='Three identical action/result pairs: stopped an unproductive loop';this.store.save();return this.state;
          }
          const recentReads=this.state.observations.slice(-6).filter(o=>o.action?.type==='read');
          const pathCounts={};
          for(const r of recentReads) pathCounts[r.action.path]=(pathCounts[r.action.path]||0)+1;
          if(Object.values(pathCounts).some(c=>c>=3)) {
            this.state.status='PAUSED';this.state.reason='Repeatedly reading the same file without progress: stopped unproductive loop';this.store.save();return this.state;
          }
        } catch(e) {
          if(e instanceof Replan) {this.gate.revokeAll();this.emit('cycle.replanned',{reason:e.message});continue;}
          throw e;
        }
      }
      this.state.status='PAUSED';this.state.reason=`Reached the ${this.config.maxSteps}-step burst limit; /continue explicitly allows another burst within the same request budget`;
    } catch(e) {
      if(this.state.pending || e instanceof UncertainEffect) this.state.status='NEEDS_REVIEW';
      else if(e.name==='AbortError' || e instanceof BudgetError) this.state.status='PAUSED';
      else this.state.status='ERROR';
      this.state.reason=this.redact(e.message);this.emit('run.stopped',{status:this.state.status,reason:this.state.reason});
    } finally {
      this.gate.revokeAll();this.applySteering();this.busy=false;this.abortController=null;this.store.save();
    }
    return this.state;
  }
}
