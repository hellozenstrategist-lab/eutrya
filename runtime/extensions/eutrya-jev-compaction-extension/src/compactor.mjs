import {assert,clone,hash,scopeKey,aborted,timed} from './util.mjs';
import {resolveOptions} from './options.mjs';
import {collectToolCalls,fitState,batchCalls,questionsFor,probability,decideCall,applyDecisions,validateMessages} from './core.mjs';

/** An archive-backed pure context transformation. Never invokes a text model or tools. */
export function createCompactor({asker,archive,scope,options={},allowMock=false,onEvent=()=>{}}) {
  const o=resolveOptions(options),key=scopeKey(scope);
  assert(asker && typeof asker.ask==='function','ADAPTER','Provide a metered typed Jev asker');
  assert(asker.source==='jev'||(allowMock&&asker.source==='mock'),'SOURCE','Mock compaction must be explicitly enabled; no silent evaluator fallback');
  assert(archive&&typeof archive.write==='function'&&typeof archive.read==='function'&&typeof archive.report==='function','ARCHIVE','A durable archive is required');
  assert(archive.key===key,'SCOPE','Archive and controller scopes differ');
  let busy=false,lastAttempt=null,lastReport=null;
  const emit=(type,data)=>{try{onEvent({type,source:asker.source,...data});}catch{}};
  async function compact({messages,goal='',protectedContext={},pinnedCallIds=[],budget,force=false,signal,archiveExtra=null}) {
    assert(!busy,'BUSY','One compaction may run per controller at a time');
    assert(typeof goal==='string'&&goal.length<=100000,'GOAL','Invalid compaction goal');
    assert(budget&&Number.isFinite(budget.limit)&&budget.limit>0&&Number.isFinite(budget.reserve??0)&&(budget.reserve??0)>=0,'BUDGET','Positive context budget and nonnegative reserve required');
    const limit=budget.limit-(budget.reserve??0);assert(limit>0,'BUDGET','Reserved output/envelope consumes all context capacity');
    assert(typeof force==='boolean','OPTIONS','force must be boolean');
    assert(Array.isArray(pinnedCallIds)&&pinnedCallIds.every(x=>typeof x==='string'),'PIN','pinnedCallIds must be an array of tool IDs');
    const measure=budget.measure??(m=>JSON.stringify(m).length);
    const size=m=>{const n=measure(m);assert(typeof n==='number'&&Number.isFinite(n)&&n>=0,'MEASURE','Context measure must return a finite nonnegative number');return n;};
    aborted(signal);
    const calls=collectToolCalls(messages,o,pinnedCallIds),before=size(messages);
    const fingerprint=hash({scope:key,messages,goal,protectedContext,pinnedCallIds,options:o});
    const plain=(status,extra={})=>({messages,decisions:[],archiveId:null,fingerprint,status,source:asker.source,
      stats:{before,after:before,limit,target:Math.floor(limit*o.targetRatio),unit:budget.unit??'characters',requests:0,
        hardOverflow:before>limit,targetMet:before<=limit*o.targetRatio,...extra}});
    if(!force&&before<=limit*o.autoTriggerRatio)return plain('below_trigger');
    const candidates=calls.filter(c=>!c.pinned);
    if(!candidates.length)return plain('nothing_prunable');
    const currentIds=new Set(calls.map(c=>c.tool_use_id));
    const newCalls=lastAttempt?[...currentIds].filter(id=>!lastAttempt.ids.has(id)).length:Infinity;
    if(!force&&lastAttempt&&before<=limit&&lastAttempt.goalHash===hash({goal,protectedContext})&&
      (lastAttempt.fingerprint===fingerprint||(newCalls*2<o.minNewMessages&&before<=lastAttempt.after)))return plain('deferred');
    busy=true;const started=Date.now();let requests=0,archiveId;
    try {
      const snapshot=clone({messages,goal,protectedContext,archiveExtra});
      // Validate and fit EVERYTHING before dispatch; archive failure also precedes network.
      const fitted=fitState(snapshot.messages,calls,o,{goal,protectedContext:snapshot.protectedContext});
      const batches=batchCalls(candidates,fitted.state,o);
      archiveId=archive.write(snapshot);
      emit('compaction.started',{archiveId,before,candidates:candidates.length,batches:batches.length});
      const answers=new Map();
      await timed(async innerSignal=>{
        let next=0;
        const worker=async()=>{
          while(next<batches.length) {
            aborted(innerSignal);const batch=batches[next++];
            const questions=Object.assign({},...batch.map(questionsFor));requests++;
            const response=await asker.ask(clone(fitted.state),questions,innerSignal);
            aborted(innerSignal);
            // Reject partial answers: none of a partial pass can remove context.
            for(const c of batch)answers.set(c.id,{keepCall:probability(response.answers,`call_${c.id}`),keepResult:probability(response.answers,`result_${c.id}`)});
          }
        };
        await Promise.all(Array.from({length:Math.min(o.maxConcurrency,batches.length)},worker));
      },o.deadlineMs,signal);
      aborted(signal);
      const decisions=calls.map(c=>decideCall(c,answers.get(c.id)??{keepCall:1,keepResult:1},o));
      const pruned=applyDecisions(snapshot.messages,decisions,o,archiveId);
      validateMessages(pruned,o);
      // IDs prove original user text has not been summarized; this check works even without ids.
      const texts=ms=>ms.filter(m=>m.text!=='').map(m=>[m.role,m.text]);
      assert(hash(texts(pruned))===hash(texts(snapshot.messages)),'INVARIANT','Compaction changed conversation text');
      const originalResults=new Map(snapshot.messages.flatMap(m=>m.toolResults??[]).map(r=>[r.tool_use_id,r]));
      const afterDraft=size(pruned),reduction=before===0?0:(before-afterDraft)/before;
      const accept=afterDraft<before&&(reduction>=o.minReductionRatio||(before>limit&&afterDraft<=limit));
      const after=accept?afterDraft:before;
      const result={messages:accept?pruned:messages,decisions,archiveId,fingerprint,status:accept?'compacted':'held',source:asker.source,
        stats:{before,after,limit,target:Math.floor(limit*o.targetRatio),unit:budget.unit??'characters',requests,
          reductionRatio:before===0?0:(before-after)/before,hardOverflow:after>limit,targetMet:after<=limit*o.targetRatio,
          pinned:calls.filter(c=>c.pinned).length,candidates:candidates.length,
          kept:decisions.filter(d=>d.action==='keep').length,resultsPruned:accept?pruned.flatMap(m=>m.toolResults??[]).filter(r=>{const old=originalResults.get(r.tool_use_id);return old&&old.text!==r.text;}).length:0,
          pairsDropped:accept?decisions.filter(d=>d.action==='drop_call').length:0,stateTokensEstimated:fitted.tokens,stateStage:fitted.stage,elapsedMs:Date.now()-started}};
      // Reports contain identifiers, probabilities and metrics; no source text or credentials.
      archive.report(archiveId,{status:result.status,source:result.source,fingerprint,decisions,stats:result.stats});
      lastAttempt={fingerprint,goalHash:hash({goal,protectedContext}),ids:currentIds,after};const {messages:ignoredMessages,...report}=result;lastReport=report;
      emit('compaction.completed',{archiveId,status:result.status,stats:result.stats});return result;
    } catch(error) {
      emit('compaction.failed',{code:error.code??error.name,originalRetained:true,requests});
      throw error;
    } finally {busy=false;}
  }
  return {compact,options:o,source:asker.source,
    status:()=>({busy,lastReport:lastReport?{...lastReport}:null}),
    restore:archiveId=>archive.read(archiveId),
    listArchives:()=>archive.list?.()??[]};
}
