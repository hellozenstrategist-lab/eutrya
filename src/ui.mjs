import readline from 'node:readline';
import { safeTerminal, clip } from './util.mjs';

export function renderEvent(event,write=console.log,{showThinking=false}={}) {
  const d=event.data;const out=text=>write(safeTerminal(text));
  const prefix=event.agent ? `[${event.agent}] ` : '';
  switch(event.type) {
    case 'jev.control':out(`  ${prefix}${d.source==='mock'?'MOCK':'Jev '}  ${d.mode}  · choice mass ${Math.round(d.probability*100)}%`);break;
    case 'research.plan':out(`  Strategy round ${d.round} · ${d.status} · ${clip(d.objective,100)} · ${d.microSteps} Jev micro-steps`);break;
    case 'research.decision':out(`  Jev research ${d.selected} · ${d.action.type} · ${Math.round(d.probability*100)}% · ${clip(d.summary,90)}`);break;
    case 'cortex.proposal':
      out(`  ${prefix}AI    ${d.proposal.candidates.length} candidate(s)${showThinking && d.proposal?.summary ? ' · '+d.proposal.summary : ''}`);
      break;
    case 'decision': {
      const winner=d.rankings.find(x=>x.candidateId===d.selected);
      out(`  ${prefix}Pick  ${d.selected} · policy value ${winner.value.toFixed(3)} · grounded ${winner.grounding.toFixed(2)}${d.source==='mock'?' [fixture]':''}`);break;
    }
    case 'observation': {
      const a=d.action;
      let targetDesc='';
      if(a.path) targetDesc=' '+a.path;
      else if(a.type==='press') targetDesc=' '+a.switch;
      else if(a.type==='shell') targetDesc=` "${clip(a.command,50)}"`;
      else if(a.type==='browser') targetDesc=` ${clip(a.url,60)}`;
      else if(a.type==='delegate') targetDesc=` → ${a.to}: "${clip(a.task,50)}"`;
      else if(a.type==='send_message') targetDesc=` → ${a.to}: "${clip(a.message,50)}"`;
      else if(a.type==='publish_finding') targetDesc=` → "${clip(a.topic,40)}"`;
      else if(a.type==='record_decision') targetDesc=` → "${clip(a.title,40)}"`;
      else if(a.type==='update_task') targetDesc=` → ${a.taskId} (${a.status})`;
      else if(a.type==='consult_swarm') targetDesc=` → "${a.query}"`;

      out(`  ${prefix}Tool  ${a.type}${targetDesc} → ${d.id}`);
      if(d.result?.denied)out('        denied by operator');
      if(d.result?.lamps)out(`        lamps: ${d.result.lamps.map(x=>x?'●':'○').join(' ')}`);
      if(d.result?.after)out(`        lamps: ${d.result.after.map(x=>x?'●':'○').join(' ')}`);
      if(a.type==='run'||a.type==='shell')out(`        exit ${d.result.exitCode}; ${clip(d.result.stdout??'',350)}`);
      if(a.type==='browser')out(`        "${clip(d.result?.title??'',60)}" (${d.result?.content?.length??0} chars)`);
      if(d.result?.delegated)out(`        delegated task ${d.result.taskId??''} to ${d.result.to}`);
      if(d.result?.published)out(`        published finding "${d.result.topic}" (${d.result.id})`);
      break;
    }
    case 'swarm.agent_status':out(`  Swarm [${d.agent}] ${d.status}${d.task ? ' - "'+clip(d.task,60)+'"' : ''}`);break;
    case 'swarm.event':out(`  Swarm [${d.from} → ${d.to}] ${d.type}`);break;
    case 'cycle.replanned':out('  Steer Restarting the decision cycle with your new direction.');break;
    case 'run.stopped':out(`  ${d.status}: ${d.reason}`);break;
    case 'verification.failed':out(`  Check ${d.reason}`);break;
    case 'input.required':out(`\n${d.question}`);break;
    case 'answer':out(`\n${prefix}${d.answer}\n\n[${d.status}]`);break;
    case 'provider.error':out(`  Provider error: ${d.error}`);break;
  }
}
export function swarmStatusText(matrix) {
  const lines=['\nE U T R Y A   N A T I V E   S W A R M'];
  lines.push(`Template: ${matrix.activeTemplate} | Primary: ${matrix.primaryAgent} | Direct Focus: @${matrix.activeFocus}\n`);
  lines.push('AGENTS:');
  for (const a of matrix.agents) {
    const focusMarker = a.id === matrix.activeFocus ? ' [FOCUSED]' : '';
    lines.push(`  ${a.name.padEnd(14)} ${a.status.padEnd(10)} [${a.role}]${focusMarker}`);
    if (a.currentTask) lines.push(`                 task: "${clip(a.currentTask, 70)}"`);
  }
  lines.push('\nACTIVE TASKS:');
  if (matrix.activeTasks.length === 0) {
    lines.push('  None');
  } else {
    for (const t of matrix.activeTasks) {
      lines.push(`  [${t.id}] ${t.title} (${t.status}, assigned: ${t.assignedTo})`);
    }
  }
  lines.push('\nBLOCKERS:');
  if (matrix.blockers.length === 0) {
    lines.push('  None');
  } else {
    for (const b of matrix.blockers) {
      lines.push(`  [${b.agent}] ${b.description}`);
    }
  }
  return lines.join('\n');
}
export function statusText(s) {
  const m=s.meter;
  return `Session ${s.id}\n${s.status} · ${s.totalSteps} executed/denied steps\n`+
    `${m.calls} reserved provider attempts (${m.jevCalls} evaluator, ${m.cortexCalls} text)\n`+
    `Reported tokens: ${m.inputTokens} input / ${m.outputTokens} output; missing on ${m.usageMissingCalls} attempts\n`+
    `Known reported API cost: $${m.knownCostUsd.toFixed(6)}; ${m.unpricedCalls} attempts unpriced (not zero-cost)\n`+
    `Attention: ${s.lastMode??'none'}${s.reason?'\n'+s.reason:''}${s.pending?'\nPENDING EFFECT: '+JSON.stringify(s.pending.candidate.action):''}`;
}
export class Terminal {
  constructor() {
    const commands=['/help','/status','/trace','/compact','/continue','/stop','/steer','/resolve','/model','/new','/memory','/remember','/skills','/usage','/swarm','/agents','/agent','/tasks','/findings','/template','/thinking','/reload','/quit'];
    this.rl=readline.createInterface({input:process.stdin,output:process.stdout,terminal:Boolean(process.stdin.isTTY),historySize:500,completer:line=>{const hits=commands.filter(c=>c.startsWith(line));return [hits.length?hits:commands,line];}});
    this.approval=null;this.onLine=()=>{};this.onInterrupt=()=>{};
    this.rl.on('line',line=>{
      const text=line.trim();
      if(this.approval && /^(y|yes|n|no)$/i.test(text)) {this.finishApproval(/^y/i.test(text));return;}
      Promise.resolve(this.onLine(text)).catch(e=>this.print(`Error: ${e.message}`));
    });
    this.rl.on('SIGINT',()=>this.onInterrupt());
    this.rl.on('close',()=>{this.finishApproval(false);this.onInterrupt();});
  }
  print(text=''){console.log(safeTerminal(text));}
  prompt(){if(!this.approval){this.rl.setPrompt('eutrya › ');this.rl.prompt();}}
  async approve(action,signal) {
    if(!process.stdin.isTTY)return false;
    if(signal?.aborted)return false;
    this.print(`\nAPPROVAL REQUIRED\n${JSON.stringify(action,null,2)}\n${['run','shell'].includes(action.type)?'This local process is not OS-sandboxed. Review the entire command and its possible effects.\n':''}Approve this one action? y / n`);
    return new Promise(resolve=>{
      const abort=()=>this.finishApproval(false);
      signal?.addEventListener('abort',abort,{once:true});
      this.approval={resolve,signal,abort};
    });
  }
  finishApproval(value) {if(this.approval){const a=this.approval;this.approval=null;a.signal?.removeEventListener('abort',a.abort);a.resolve(value);}}
  close(){this.finishApproval(false);this.rl.close();}
}
