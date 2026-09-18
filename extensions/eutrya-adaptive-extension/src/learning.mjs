import { assert, audit, clone, hash, id, owner, text, uid, bounded } from './core.mjs';

export function parseCorrection(input) {
  const value=text(input,'correction',2000), lower=value.toLowerCase();
  const patch={};
  if(/\b(shorter|briefer|less verbose|too long|too much detail|be concise|stop overexplaining|keep it short)\b/.test(lower)) patch.verbosity='brief';
  if(/\b(more detail|more detailed|explain thoroughly|go deeper)\b/.test(lower)) patch.verbosity='detailed';
  if(/\b(normal length|normal detail|balanced length)\b/.test(lower)) patch.verbosity='normal';
  if(/\b(answer first|stop overthinking|too slow|taking too long|lead with the answer|just answer)\b/.test(lower)) patch.answerFirst=true;
  if(/\b(explain step by step|walk me through|steps first)\b/.test(lower)) patch.answerFirst=false;
  // A user correction is instruction data, never executable code or a permission change.
  return {text:value,patch};
}
export class Learning {
  constructor(store) {this.store=store;}
  correct(actor,{text:input,decisionId=null}) {
    owner(this.store.scope,actor);const parsed=parseCorrection(input); if(decisionId!==null)id(decisionId,'decision id');
    const record={id:uid('feedback'),at:new Date().toISOString(),...parsed,decisionId};
    this.store.update(s=>{
      if(decisionId)assert(s.decisions.some(x=>x.id===decisionId),'Unknown or expired decision to correct');
      s.feedback.push(record);s.feedback=s.feedback.slice(-64);this.#rebuildPreferences(s);
      s.policyEpoch++;s.controlEpoch++;s.lastChoices={};audit(s,'feedback.saved',{id:record.id,changed:Object.keys(record.patch)});
    }); return record;
  }
  #rebuildPreferences(s) {
    s.preferences={verbosity:'brief',answerFirst:true,notes:[]};
    for(const row of s.feedback)Object.assign(s.preferences,row.patch);
    s.preferences.notes=s.feedback.slice(-8).map(x=>({id:x.id,text:x.text}));
  }
  forget(actor,feedbackId) {
    owner(this.store.scope,actor);id(feedbackId);
    this.store.update(s=>{assert(s.feedback.some(x=>x.id===feedbackId),'Unknown feedback');s.feedback=s.feedback.filter(x=>x.id!==feedbackId);this.#rebuildPreferences(s);s.policyEpoch++;s.controlEpoch++;s.lastChoices={};audit(s,'feedback.forgotten',{id:feedbackId});});
  }
  recordOutcome({observationId,decisionId,passed,checker}) {
    id(observationId,'observation id');id(decisionId,'decision id');text(checker,'independent checker identifier',200);
    assert(typeof passed==='boolean','passed must be a boolean returned by a trusted independent checker');
    const input={observationId,decisionId,passed,checker};
    return this.store.update(s=>{
      const prior=s.outcomes.find(x=>x.observationId===observationId||x.decisionId===decisionId);
      if(prior) {assert(hash(input)===prior.inputHash,'Outcome already exists with different evidence');return {recorded:false,duplicate:true};}
      const decision=s.decisions.find(x=>x.id===decisionId);assert(decision,'Unknown or expired decision');
      if(s.frozen||!s.config.learning.enabled)return {recorded:false,frozen:true};
      s.outcomes.push({...input,inputHash:hash(input),key:decision.learningKey,strategy:decision.strategy,at:new Date().toISOString()});
      s.outcomes=s.outcomes.slice(-s.config.learning.maxRecords);s.policyEpoch++;
      audit(s,'learning.outcome',{observationId,decisionId,passed,checker});return {recorded:true};
    });
  }
  freeze(actor,value=true) {
    owner(this.store.scope,actor);assert(typeof value==='boolean','freeze requires boolean');
    this.store.update(s=>{s.frozen=value;audit(s,'learning.freeze',{value});});
  }
  reset(actor) {
    owner(this.store.scope,actor);this.store.update(s=>{s.outcomes=[];s.lastChoices={};s.policyEpoch++;audit(s,'learning.reset');});
  }
  undoOutcome(actor,observationId) {
    owner(this.store.scope,actor);id(observationId);
    this.store.update(s=>{assert(s.outcomes.some(x=>x.observationId===observationId),'Unknown outcome');s.outcomes=s.outcomes.filter(x=>x.observationId!==observationId);s.policyEpoch++;s.controlEpoch++;s.lastChoices={};audit(s,'learning.outcome.removed',{observationId});});
  }
  status() {const s=this.store.read();return {preferences:s.preferences,frozen:s.frozen,outcomes:s.outcomes.length,feedback:s.feedback.map(x=>({id:x.id,text:x.text})),policyEpoch:s.policyEpoch};}
}
export function learnedBias(state,key,strategy) {
  if(!state.config.stability.enabled||!state.config.learning.enabled)return {bias:0,samples:0};
  const samples=state.outcomes.filter(x=>x.key===key&&x.strategy===strategy),n=samples.length;
  if(n<state.config.stability.minSamples)return {bias:0,samples:n};
  const positive=samples.filter(x=>x.passed).length;
  const {prior,maxLearnedBias}=state.config.stability;
  return {samples:n,bias:bounded((2*positive-n)/(n+2*prior)*maxLearnedBias,-maxLearnedBias,maxLearnedBias)};
}
