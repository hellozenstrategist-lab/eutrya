// Deterministic FIXTURES for offline wiring tests. Neither component calls nor simulates real Jev intelligence.
import { oneHotChoice } from './jev.mjs';
import { bits } from '../puzzle.mjs';

const usage={inputTokens:0,outputTokens:0,costUsd:0};
const wrap=data=>({data,usage,model:'offline-fixture'});
export const score=(n)=>({type:'score',score:n,probabilities:{'0':n===0?1:0,'1':n===1?1:0,'2':n===2?1:0,'3':n===3?1:0}});
const bool=p=>({type:'boolean',probability:p});
export function decodeObservation(o) {
  if(typeof o.result==='string') {try{return JSON.parse(o.result);}catch{return {};}}
  return o.result??{};
}
export function visiblePuzzle(packet) {
  let current=null;const known={};
  for(const o of packet.observations) {
    const r=decodeObservation(o);
    if(Array.isArray(r.lamps))current=bits(r.lamps);
    if(Array.isArray(r.before)&&Array.isArray(r.after)) {known[r.switch]=bits(r.before)^bits(r.after);current=bits(r.after);}
  }
  return {current,known};
}
export class DemoCortex {
  constructor(){this.source='mock';}
  async propose(packet,attention,tools) {
    const v=visiblePuzzle(packet);const evidence=packet.observations.slice(-4).map(o=>o.id);
    const make=(id,summary,action)=>({id,summary,evidence,expected:action.type==='press'?'Observe which lamps change':'Observe or report the actual board',action});
    let action;
    if(v.current===null) action={type:'look'};
    else if(v.current===15)action={type:'finish',answer:'All four lamps are lit. The independent switchboard checker can verify the result.'};
    else {
      const unknown=[0,1,2,3].find(i=>v.known[i]===undefined);
      if(unknown!==undefined)action={type:'press',switch:unknown};
      else {
        let subset=null;
        for(let mask=1;mask<16;mask++) {let target=v.current;for(let i=0;i<4;i++)if(mask&(1<<i))target^=v.known[i];if(target===15){subset=mask;break;}}
        if(subset===null)action={type:'look'};
        else action={type:'press',switch:[0,1,2,3].find(i=>subset&(1<<i))};
      }
    }
    const candidates=[make('next','Take the next evidence-supported step',action)];
    if(v.current!==null && action.type!=='finish')candidates.unshift(make('repeat','Look at the unchanged board again',{type:'look'}));
    return wrap({summary:`Offline fixture planner responding to attention=${attention.mode}; learned only from public observations.`,hypotheses:[],unknowns:v.current===null?['Switch effects']:[],candidates});
  }
}
export class MockJev {
  constructor({prefer=null}={}){this.source='mock';this.prefer=prefer;}
  async control(packet) {
    const v=visiblePuzzle(packet);const mode=v.current===15?'verify':v.current===null?'observe':Object.keys(v.known).length<4?'explore':'deepen';
    return wrap({mode:oneHotChoice(mode),stagnation:bool(0)});
  }
  async evaluate(state, questions, signal) {
    const answers = {};
    for (const [k, q] of Object.entries(questions)) {
      if (q.type === 'choice') {
        const choices = Object.keys(q.criteria);
        let pick = choices[0];
        if (k === 'route') {
          const t = state.task ? state.task.toLowerCase() : '';
          const isWork = /security|audit|vulnerability|exploit|triage|scope|severity|verify|reproduce|fuzz|code|bug|pipeline|build|impl|test|write|edit|threat model|architecture|research/i.test(t);
          pick = isWork ? 'work' : 'fast';
        } else if (state.task) {
          const t = state.task.toLowerCase();
          if (/verify|triage|false positive|duplicate|severity|scope review|independent review|evidence quality/i.test(t) && choices.includes('sentinel')) pick = 'sentinel';
          else if (/reproduce|execute|operator|run|command|shell|fuzz|harness|local validation|test environment|tooling|implementation/i.test(t) && choices.includes('operator')) pick = 'operator';
          else if (/audit|vulnerability|security review|code review|access control|authorization|smart contract|web3|invariant|asset flow|bug/i.test(t) && choices.includes('auditor')) pick = 'auditor';
          else if (/research|investigate|architecture|threat model|study|specification|hypothesis|strategy|synthesi|report/i.test(t) && choices.includes('analyst')) pick = 'analyst';
          else if (choices.includes('admin')) pick = 'admin';
        }
        answers[k] = oneHotChoice(pick, choices);
      } else if (q.type === 'boolean') {
        if (k === 'toolFree') {
          answers[k] = bool(0.95);
        } else {
          const isOrchestration = k === 'orchestration_needed' && state.task && /coordinate|workstream|cross-functional|team|project/i.test(state.task);
          answers[k] = bool(isOrchestration ? 0.9 : 0.1);
        }
      } else if (q.type === 'score') {
        answers[k] = score(2);
      }
    }
    return wrap(answers);
  }
  async research(packet,candidates) {
    const ids=candidates.map(c=>c.id),pick=ids[0];
    return wrap({next:oneHotChoice(pick,ids),escalate:bool(0.05),stagnation:bool(0.05)});
  }
  async rank(packet,attention,proposal) {
    const v=visiblePuzzle(packet);const answers={};
    proposal.candidates.forEach((c,i)=>{
      const redundant=c.action.type==='look'&&v.current!==null;
      const preferred=this.prefer?c.id===this.prefer:!redundant;
      answers[`c${i}_progress`]=score(preferred?3:0);
      answers[`c${i}_information`]=score(preferred?2:0);
      answers[`c${i}_grounding`]=bool(1);
      answers[`c${i}_repetition`]=bool(redundant?1:0);
      if(c.action.type==='finish')answers[`c${i}_completion`]=bool(1);
    });
    return wrap(answers);
  }
}
export class ScriptedCortex {
  constructor(proposals){this.source='mock';this.proposals=[...proposals];this.index=0;}
  async propose(){if(this.index>=this.proposals.length)throw new Error('Scripted fixture exhausted');return wrap(this.proposals[this.index++]);}
}
