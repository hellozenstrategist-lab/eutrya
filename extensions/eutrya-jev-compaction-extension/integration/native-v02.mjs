import path from 'node:path';
import {createCompactor,FileArchive,nativeJevAsker} from '../src/index.mjs';
import {assert,hash,clone,aborted,canonical} from '../src/util.mjs';

function clipString(value,max) {
  const text=String(value ?? '');
  return text.length<=max?text:text.slice(0,Math.max(0,max-16))+'…[bounded]';
}

export function projectPreviousTasks(previousTasks,{maxItems=4,maxChars=6400}={}) {
  const rows=Array.isArray(previousTasks)?previousTasks:[];
  const selected=[];
  let used=2;
  for(let i=rows.length-1;i>=0 && selected.length<maxItems;i--) {
    const row=rows[i]??{};
    const projected={
      task:clipString(row.task,700),
      status:String(row.status??'UNKNOWN'),
      answer:clipString(row.answer,900)
    };
    const chars=JSON.stringify(projected).length+(selected.length?1:0);
    if(selected.length && used+chars>maxChars) break;
    selected.unshift(projected);used+=chars;
  }
  return {
    recent:selected,
    total:rows.length,
    omitted:Math.max(0,rows.length-selected.length),
    note:'Deterministic recent-task handoff window. Older task turns remain in durable session/chat history and are not injected into every active prompt.'
  };
}

/** Packet builder replaces BOTH the old last-12 slice and blind result clipping. */
export function nativePacket(state,observations=state.observations) {
  const history=projectPreviousTasks(state.previousTasks);
  return {taskContext:state.taskContext??null,task:state.task,directives:state.directives,previousTasks:history.recent,previousTaskArchive:{total:history.total,omitted:history.omitted,note:history.note},
    modelSummary:{text:state.summary,hypotheses:state.hypotheses,unknowns:state.unknowns,trust:'model-generated; not observed facts'},
    observations:observations.map(o=>({id:o.id,action:o.action.type,arguments:o.action.type==='write'?{path:o.action.path}:o.action,result:o.result})),
    notebook:state.notebook,availableObservationIds:observations.map(o=>o.id),
    observationArchive:{count:state.nextObservation-1,idRange:state.nextObservation>1?`o1..o${state.nextObservation-1}`:null,
      recall:'Use the EXISTING recall action for any original observation ID, including pruned ones. Do not re-run side effects.'},
    totalSteps:state.totalSteps,remainingCalls:null,
    note:'Jev-selected active evidence. Results marked _eutryaCompaction are incomplete previews, not complete tool outputs. Full originals remain in the observation archive. Summaries, preferences and notebook entries are not independent evidence.'};
}
function protectedOf(s) {
  const {observations,availableObservationIds,observationArchive,remainingCalls,...context}=nativePacket(s,[]);
  return context;
}
export function nativeMessages(state) {
  const ms=[{role:'user',text:state.task,toolUses:[]}];
  for(const o of state.observations) {
    ms.push({role:'assistant',text:'',toolUses:[{tool_use_id:o.id,tool:o.action.type,input:o.action}]});
    ms.push({role:'tool',text:'',toolUses:[],toolResults:[{tool_use_id:o.id,text:canonical(o.result),
      isError:!!(o.result?.error||o.result?.denied||o.result?.verification==='FAILED')}]});
  }
  return ms;
}
export function projectNative(messages,originals,archiveId) {
  const byId=new Map(originals.map(o=>[o.id,o])),uses=new Set(messages.flatMap(m=>m.toolUses.map(t=>t.tool_use_id))),out=[];
  for(const m of messages)for(const r of m.toolResults??[]) {
    const o=byId.get(r.tool_use_id);assert(o&&uses.has(o.id),'PAIRING','Native result projection has an unknown or orphan ID');
    if(r.text===canonical(o.result))out.push(o);
    else out.push({...o,result:{_eutryaCompaction:true,originalObservationId:o.id,archiveId,preview:r.text,
      originalChars:JSON.stringify(o.result).length,recall:'Use recall with this observation ID for the original full evidence.'}});
  }
  return out;
}
function materialFingerprint(s) {
  // Meter changes from paid requests must survive; do NOT include/restore the meter.
  return hash({revision:s.revision,pending:s.pending,observations:s.observations,context:protectedOf(s)});
}

/** Attach ONLY after the explicit three host seams in patches/native-v02-hooks.patch. */
export function installNativeCompaction(runtime,{scope,archiveRoot=null,options={},allowMock=false}={}) {
  assert(runtime?.compactionSeamVersion===1,'HOST_SEAMS','Add the documented compaction seams before installing this extension');
  assert(!runtime.compaction,'HOST_SEAMS','A compaction extension is already attached');
  assert(scope?.sessionId===runtime.state.id,'SCOPE','Scope sessionId must match the host session');
  const archive=new FileArchive({root:archiveRoot??path.join(runtime.store.dir,'jev-compaction'),scope});
  const maxChars=runtime.config.maxPromptChars;
  const compactor=createCompactor({scope,archive,asker:nativeJevAsker(runtime),allowMock,
    options:{...options,maxRequestChars:Math.min(options.maxRequestChars??40000,maxChars-256)},
    onEvent:event=>runtime.emit(event.type,{source:event.source,...event})});
  let manualController=null;
  async function doCompact({force=false,signal,limit=null}={}) {
    assert(!runtime.state.pending,'PENDING','Resolve an uncertain action before compaction');
    aborted(signal);runtime.boundary(signal);
    const base=materialFingerprint(runtime.state),snapshot=clone(runtime.state.observations);
    const messages=nativeMessages(runtime.state),protectedContext=clone(protectedOf(runtime.state));
    // A shrinking projection uses a fixed-length placeholder until the archive ID exists.
    const measure=ms=>JSON.stringify(nativePacket(runtime.state,projectNative(ms,snapshot,'0'.repeat(64)))).length;
    const hardLimit=limit??Math.max(3000,maxChars-7000);
    assert(Number.isSafeInteger(hardLimit)&&hardLimit>=3000&&hardLimit<=maxChars,'BUDGET','Invalid native packet limit');
    const result=await compactor.compact({messages,goal:runtime.state.task,protectedContext,
      archiveExtra:{nativeObservations:snapshot},budget:{limit:hardLimit,measure,unit:'serialized packet characters'},force,signal});
    runtime.boundary(signal);
    assert(materialFingerprint(runtime.state)===base,'STALE','Task or context changed during compaction; no stale result applied');
    if(result.status==='compacted') {
      const s=runtime.state,previous=s.observations,revision=s.revision,meta=s.jevCompaction;
      s.observations=projectNative(result.messages,snapshot,result.archiveId);
      s.jevCompaction={format:1,archiveId:result.archiveId,source:result.source,stats:result.stats};s.revision++;
      runtime.gate.revokeAll();
      try{runtime.store.save();}
      catch(e){s.observations=previous;s.revision=revision;if(meta===undefined)delete s.jevCompaction;else s.jevCompaction=meta;throw e;}
    }
    return result;
  }
  const extension={
    compactor,archive,
    async packet(signal,{limit=Math.max(3000,maxChars-7000)}={}) {
      const result=await doCompact({signal,limit});
      const packet=nativePacket(runtime.state);
      // Check EXACT serialized packet characters here, not the upstream token heuristic.
      assert(JSON.stringify(packet).length<=limit,'CONTEXT_FULL',
        'Protected or Jev-retained context is still too large. No blind truncation/summarizer fallback ran. Use a larger reviewed context budget, smaller tool outputs, or a new task with explicit handoff.');
      return packet;
    },
    async manual() {
      assert(!runtime.busy,'BUSY','Stop or wait for the agent before manual compaction');
      runtime.busy=true;manualController=new AbortController();const previous=runtime.abortController;runtime.abortController=manualController;
      try{return await doCompact({force:true,signal:manualController.signal});}
      finally{runtime.busy=false;runtime.abortController=previous;manualController=null;runtime.applySteering();runtime.store.save();}
    },
    status:()=>compactor.status(),
    listArchives:()=>archive.list(),
    // Local authenticated operator control ONLY, never a model tool. Restore context, not budgets.
    restore(archiveId,{operatorApproved=false}={}) {
      assert(operatorApproved===true,'APPROVAL','Operator approval is required to restore active context');
      assert(!runtime.busy&&!runtime.state.pending,'BUSY','Restore only while idle and with no unresolved action');
      const snapshot=archive.read(archiveId),originals=snapshot.archiveExtra?.nativeObservations;
      assert(Array.isArray(originals),'ARCHIVE','Not a native compaction archive');
      const old=runtime.state.observations,revision=runtime.state.revision;
      const merged=new Map(originals.map(o=>[o.id,o]));
      // Keep observations produced after the snapshot. Only archived IDs are restored.
      for(const o of old)if(!merged.has(o.id))merged.set(o.id,o);
      runtime.state.observations=[...merged.values()].sort((a,b)=>Number(a.id.slice(1))-Number(b.id.slice(1)));
      runtime.state.revision++;runtime.gate.revokeAll();
      try{runtime.store.save();}catch(e){runtime.state.observations=old;runtime.state.revision=revision;throw e;}
      runtime.emit('compaction.restored',{archiveId,retained:runtime.state.observations.length});
      return {restored:true,retained:runtime.state.observations.length};
    },
    uninstall() {assert(!runtime.busy,'BUSY','Cannot detach compaction while busy');runtime.compaction=null;}
  };
  runtime.compaction=extension;return extension;
}
