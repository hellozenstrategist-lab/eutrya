import { clip, insist } from './util.mjs';

export function packetOf(state,maxChars=48000) {
  const recent=state.observations.slice(-12).map(o=>({id:o.id,action:o.action.type,arguments:o.action.type==='write'?{path:o.action.path}:o.action,result:clip(o.result,5000)}));
  const packet={taskContext:state.taskContext??null,task:state.task,directives:state.directives.slice(-12),previousTasks:state.previousTasks.slice(-4),
    modelSummary:{text:state.summary,hypotheses:state.hypotheses,unknowns:state.unknowns,trust:'model-generated; not observed facts'},
    observations:recent,notebook:state.notebook.slice(-8),availableObservationIds:state.observations.map(o=>o.id),
    totalSteps:state.totalSteps,remainingCalls:null,
    note:'Full observation content is available with recall. Only observations are tool evidence. Summaries and notebook entries are unverified model interpretations.'};
  while(JSON.stringify(packet).length>maxChars && packet.observations.length>1)packet.observations.shift();
  if(JSON.stringify(packet).length>maxChars && packet.observations.length)packet.observations[0].result=clip(packet.observations[0].result,1200);
  insist(JSON.stringify(packet).length<=maxChars,'State packet exceeds configured input limit');
  return packet;
}
export function compactState(state,keep=12) {
  // Deterministic compaction, no extra model request, no promotion of summaries into facts.
  state.observations=state.observations.slice(-keep);
  state.notebook=state.notebook.slice(-8);state.previousTasks=state.previousTasks.slice(-8);
  state.revision++;
}
