import { StateStore } from './store.mjs';
import { Learning } from './learning.mjs';
import { DecisionStabilizer } from './selector.mjs';
import { ProviderCalls } from './calls.mjs';
import { FastReplies } from './router.mjs';
import { ResidentActivation } from './actors.mjs';
import { mergeConfig } from './config.mjs';
import { assert, audit, clone, owner } from './core.mjs';

export function createAdaptive({directory,scope,config={},jev,streamText=null,swarm={},allowMocks=false,onEvent=()=>{},onCorrection=()=>{}}) {
  const store=new StateStore({directory,scope,config});
  let calls;
  try{calls=new ProviderCalls({store,jev,onEvent,allowMocks});}catch(e){store.close();throw e;}
  const learning=new Learning(store),decisions=new DecisionStabilizer(store);
  const replies=new FastReplies({store,calls,streamText,onEvent});
  const actors=new ResidentActivation({store,calls,host:swarm,onEvent});
  function invalidate(){replies.invalidate();}
  const controls={
    correct(actor,input){const result=learning.correct(actor,input);invalidate();onCorrection({record:clone(result),preferences:learning.status().preferences});return result;},
    forget(actor,feedbackId){learning.forget(actor,feedbackId);invalidate();},
    configure(actor,patch){owner(scope,actor);const next=mergeConfig(store.read().config,patch);const activationChange=Object.keys(patch).some(k=>['agents','templates','activation'].includes(k));store.update(s=>{s.config=next;s.policyEpoch++;s.controlEpoch++;if(activationChange)s.activationEpoch++;s.lastChoices={};audit(s,'config.changed',{sections:Object.keys(patch)});});invalidate();if(activationChange)actors.cancelAll('Owner changed agent activation rules');return clone(next);},
    freeze:(actor,value)=>learning.freeze(actor,value),
    resetLearning(actor){learning.reset(actor);invalidate();},
    undoOutcome(actor,observationId){learning.undoOutcome(actor,observationId);invalidate();},
    reconcile:(actor,jobId,note)=>actors.reconcile(actor,jobId,note)
  };
  return {
    version:'0.1.0',replies,actors,decisions,controls,
    // Wire this ONLY to actual test/checker results, not a model's success assertion.
    recordOutcome:input=>learning.recordOutcome(input),
    status:()=>{const s=store.read();return {version:'0.1.0',scope:clone(scope),config:s.config,learning:learning.status(),meter:s.meter,actors:actors.status(),audit:s.audit};},
    async close(){replies.invalidate();await actors.close();store.close();}
  };
}
export { stableSelect } from './selector.mjs';
export { parseCorrection } from './learning.mjs';
export { createChatStreamer } from './chat-stream.mjs';
export { validateConfig, DEFAULT_CONFIG } from './config.mjs';
