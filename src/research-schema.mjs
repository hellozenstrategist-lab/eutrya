import { insist, object, string, integer } from './util.mjs';

const ID=/^[A-Za-z][A-Za-z0-9_-]{0,31}$/;
function parseJson(raw,label){
  if(typeof raw!=='string')return raw;const t=raw.trim().replace(/^\`\`\`(?:json)?\s*([\s\S]*?)\s*\`\`\`$/i,'$1');
  try{return JSON.parse(t);}catch{throw new Error(`${label} did not return valid JSON`);}
}
export function validateResearchPlan(raw){
  const p=parseJson(raw,'Research strategist');object(p,'research plan');
  for(const k of Object.keys(p))if(!['status','summary','objective','invariants','hypotheses','questions','seeds','microSteps','answer'].includes(k))delete p[k];
  for(const k of ['status','summary','objective','invariants','hypotheses','questions','seeds','microSteps','answer'])insist(Object.hasOwn(p,k),`research plan.${k} is required`);
  insist(['continue','complete'].includes(p.status),'research plan.status must be continue or complete');string(p.summary,'research summary',2400);string(p.objective,'research objective',1200);integer(p.microSteps,'microSteps',1,12);insist(typeof p.answer==='string'&&p.answer.length<=16000,'research answer must be a string at most 16000 characters');
  insist(Array.isArray(p.seeds)&&p.seeds.length<=12&&p.seeds.every(x=>typeof x==='string'&&x.length>=1&&x.length<=120),'Invalid research seeds');
  insist(Array.isArray(p.questions)&&p.questions.length<=8,'Invalid research questions');
  p.questions=p.questions.map((q,i)=>{object(q,`question ${i}`);for(const k of Object.keys(q))if(!['id','text','seeds'].includes(k))delete q[k];insist(ID.test(q.id),'Invalid question id');string(q.text,'question text',800);insist(Array.isArray(q.seeds)&&q.seeds.length<=8&&q.seeds.every(x=>typeof x==='string'&&x.length<=120),'Invalid question seeds');return q;});
  insist(Array.isArray(p.invariants)&&p.invariants.length<=12,'Invalid invariants');
  p.invariants=p.invariants.map((v,i)=>{object(v,`invariant ${i}`);for(const k of Object.keys(v))if(!['id','statement','priority'].includes(k))delete v[k];insist(ID.test(v.id),'Invalid invariant id');string(v.statement,'invariant statement',900);insist(['high','medium','low'].includes(v.priority),'Invalid invariant priority');return v;});
  insist(Array.isArray(p.hypotheses)&&p.hypotheses.length<=16,'Invalid hypotheses');
  p.hypotheses=p.hypotheses.map((h,i)=>{object(h,`hypothesis ${i}`);for(const k of Object.keys(h))if(!['id','claim','status','question'].includes(k))delete h[k];insist(ID.test(h.id),'Invalid hypothesis id');string(h.claim,'hypothesis claim',1000);insist(['open','supported','weakened','closed'].includes(h.status),'Invalid hypothesis status');string(h.question,'hypothesis question',800);return h;});
  if(p.status==='complete')insist(p.answer.trim().length>0,'Complete research plan requires an answer');
  return structuredClone(p);
}
export function validateResearchDecision(raw,candidates,probabilities){
  const ids=candidates.map(c=>c.id);const next=raw?.next;insist(next?.type==='choice'&&ids.includes(next.choice),'Invalid Jev research choice');const dist=probabilities(next.probabilities,ids);insist(dist[next.choice]>=Math.max(...Object.values(dist))-0.00001,'Jev research choice is not the most probable option');
  const bool=a=>{insist(a?.type==='boolean'&&typeof a.probability==='number'&&a.probability>=0&&a.probability<=1,'Invalid Jev research boolean');return a.probability;};
  return {selected:next.choice,probability:dist[next.choice],escalate:bool(raw.escalate),stagnation:bool(raw.stagnation),raw};
}
