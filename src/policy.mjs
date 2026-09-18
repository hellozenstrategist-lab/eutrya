import { insist, finite, object } from './util.mjs';
import { MODES } from './schema.mjs';

export const RUBRIC_VERSION='eutrya-v1';
export function probabilities(raw, names) {
  object(raw,'probabilities');
  insist(Object.keys(raw).length===names.length && names.every(k=>Object.hasOwn(raw,k)), 'Distribution must include exactly the expected outcomes');
  const values=names.map(k=>finite(raw[k],`probability ${k}`,0,1));
  const sum=values.reduce((a,b)=>a+b,0);
  insist(Math.abs(sum-1)<=0.015,'Probabilities do not sum to one');
  return Object.fromEntries(names.map((k,i)=>[k,values[i]/sum]));
}
export function booleanAnswer(answer) {
  insist(answer?.type==='boolean','Expected a boolean evaluation');
  return finite(answer.probability,'boolean probability',0,1);
}
export function scoreAnswer(answer) {
  insist(answer?.type==='score','Expected a score evaluation');
  finite(answer.score,'score',0,3);
  const p=probabilities(answer.probabilities,['0','1','2','3']);
  const mean=Object.entries(p).reduce((sum,[k,v])=>sum+Number(k)*v,0);
  insist(Math.abs(answer.score-mean)<0.15,'Score disagrees with its probability distribution');
  return mean/3;
}
export function validateAttention(answers) {
  const route=answers?.mode;
  insist(route?.type==='choice' && MODES.includes(route.choice),'Invalid attention choice');
  const p=probabilities(route.probabilities,MODES);
  insist(p[route.choice]>=Math.max(...Object.values(p))-0.00001,'Chosen attention mode is not the most probable option');
  return {mode:route.choice,probability:p[route.choice],stagnation:booleanAnswer(answers.stagnation),raw:answers};
}
export function selectCandidate(proposal, answers, attention, permitted) {
  const ranked=proposal.candidates.map((candidate,i)=>{
    const progress=scoreAnswer(answers[`c${i}_progress`]);
    const information=scoreAnswer(answers[`c${i}_information`]);
    const grounding=booleanAnswer(answers[`c${i}_grounding`]);
    const repetition=booleanAnswer(answers[`c${i}_repetition`]);
    const completion=candidate.action.type==='finish' ? booleanAnswer(answers[`c${i}_completion`]) : null;
    const delegation=candidate.action.type==='delegate' && answers[`c${i}_delegation`] ? booleanAnswer(answers[`c${i}_delegation`]) : null;
    const informationWeight=['explore','observe','reconsider'].includes(attention.mode)?0.35:0.15;
    let value=(0.8-informationWeight)*progress+informationWeight*information+0.2*grounding-0.3*repetition;
    if(completion!==null && completion>=0.5) value += 0.5 * completion;
    const reasons=[];
    if(!permitted(candidate.action)) reasons.push('tool disabled');
    if(grounding<0.35) reasons.push('insufficient grounding');
    if(completion!==null && completion<0.35) reasons.push('completion not supported');
    if(delegation!==null && delegation<0.35) reasons.push('inappropriate delegation');
    return {candidate,progress,information,grounding,repetition,completion,delegation,value,eligible:reasons.length===0,reasons};
  });
  const eligible=ranked.filter(x=>x.eligible).sort((a,b)=>b.value-a.value || a.candidate.id.localeCompare(b.candidate.id));
  insist(eligible.length>0,'No eligible candidate; Jev or tool permissions rejected every proposal');
  return {selected:eligible[0].candidate,ranked};
}
