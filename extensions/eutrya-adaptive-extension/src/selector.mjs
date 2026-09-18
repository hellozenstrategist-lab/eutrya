import { assert, audit, clone, hash, id, lexical, number, round, text, uid } from './core.mjs';
import { learnedBias } from './learning.mjs';

/** Deterministic for the SAME evaluated rows and policy snapshot. Never relaxes eligibility. */
export function stableSelect(rows,{state,learningKey,continuityKey}) {
  assert(Array.isArray(rows)&&rows.length>0&&rows.length<=64,'Expected 1..64 ranked candidates');
  text(learningKey,'learningKey',200);text(continuityKey,'continuityKey',200);
  const seen=new Set();
  const ranked=rows.map(row=>{
    id(row.id,'candidate id');assert(!seen.has(row.id),'Duplicate candidate id');seen.add(row.id);
    text(row.strategy,'candidate strategy',200);number(row.value,'candidate value',-100,100);
    assert(typeof row.eligible==='boolean','Explicit candidate eligibility is required');
    const digest=hash(row.action),learned=learnedBias(state,learningKey,row.strategy);
    return {...clone(row),actionHash:digest,bias:learned.bias,samples:learned.samples,score:round(row.value+learned.bias)};
  });
  const eligible=ranked.filter(x=>x.eligible).sort((a,b)=>b.score-a.score||lexical(a.actionHash,b.actionHash)||lexical(a.id,b.id));
  assert(eligible.length,'No eligible candidate; nothing was authorized');
  const best=eligible[0],previous=state.lastChoices[hash(continuityKey)]?.strategy;
  const incumbent=state.config.stability.enabled?eligible.find(x=>x.strategy===previous):null;
  const hysteresis=state.config.stability.enabled?state.config.stability.hysteresis:0;
  const selected=incumbent&&round(best.score-incumbent.score)<=hysteresis?incumbent:best;
  return {selected,ranked,reason:selected.id!==best.id?'retained-near-equal-strategy':'highest-score',inputHash:hash({rows:[...ranked].sort((a,b)=>lexical(a.id,b.id)),learningKey,continuityKey,previousStrategy:previous??null,policyEpoch:state.policyEpoch,config:state.config.stability})};
}
export class DecisionStabilizer {
  constructor(store) {this.store=store;}
  choose(rows,{learningKey,continuityKey}) {
    const s=this.store.read(),result=stableSelect(rows,{state:s,learningKey,continuityKey});
    const decision={id:uid('decision'),inputHash:result.inputHash,policyEpoch:s.policyEpoch,learningKey,strategy:result.selected.strategy,selected:result.selected.id,actionHash:result.selected.actionHash,reason:result.reason};
    this.store.update(next=>{
      assert(next.policyEpoch===s.policyEpoch,'Policy changed while selecting');
      next.lastChoices[hash(continuityKey)]={strategy:decision.strategy};
      if(Object.keys(next.lastChoices).length>128)delete next.lastChoices[Object.keys(next.lastChoices)[0]];
      next.decisions.push(decision);next.decisions=next.decisions.slice(-512);audit(next,'decision.selected',decision);
    });
    return {...result,decision};
  }
  /** Native v0.2's base selector has already applied tool, grounding and completion gates. */
  chooseNative(base,{learningKey,continuityKey}) {
    assert(Array.isArray(base?.ranked),'Expected native base selection');
    const result=this.choose(base.ranked.map(row=>({id:row.candidate.id,strategy:row.candidate.action.type,action:row.candidate.action,value:row.value,eligible:row.eligible})),{learningKey,continuityKey});
    const selected=base.ranked.find(row=>row.candidate.id===result.selected.id).candidate;
    return {...base,selected,adaptive:result};
  }
}
