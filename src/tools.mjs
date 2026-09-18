import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { ACTION_HELP, validateAction } from './schema.mjs';
import { insist, textHash, uid, throwIfAborted, UncertainEffect, clip, htmlToText } from './util.mjs';
import { lookPuzzle, pressPuzzle, verifyPuzzle } from './puzzle.mjs';
import { codeSurface, codeSymbol, codeReferences, codeInspect, codeState, codeCompare } from './research-code.mjs';

const HIDDEN=new Set(['.git','.ssh','.aws','.azure','.config','.local','.eutrya','node_modules','.venv','venv','dist','coverage']);
function sensitive(part) {
  return part.startsWith('.env') || HIDDEN.has(part) || /^(?:id_rsa|id_ed25519|auth\.json|credentials(?:\.json)?|eutrya\.config\.json|\.npmrc|\.netrc)$/i.test(part) || /\.(pem|key|p12|pfx|keystore)$/i.test(part);
}
export function safePath(root,relative,{allowMissing=false}={}) {
  insist(typeof relative==='string' && relative.length>0 && !relative.includes('\0') && !path.isAbsolute(relative),'Use a relative workspace path');
  const parts=relative.split(/[\\/]/);
  insist(!parts.some(p=>p==='..' || sensitive(p)),'Outside-workspace, private, or excluded path');
  const full=path.resolve(root,relative);
  insist(full===root || full.startsWith(root+path.sep),'Path escapes workspace');
  let current=root;
  for(const p of parts.filter(p=>p && p!=='.')) {
    current=path.join(current,p);
    if(!fs.existsSync(current)) {
      try { insist(!fs.lstatSync(current).isSymbolicLink(),'Symlinks are not allowed'); } catch(e) { if(e.code!=='ENOENT')throw e; }
      insist(allowMissing,'Path does not exist'); continue;
    }
    const st=fs.lstatSync(current);
    insist(!st.isSymbolicLink(),'Symlinks are not allowed');
    insist(!st.isFile() || st.nlink===1,'Hard-linked files are not allowed');
  }
  return full;
}
function readText(file) {
  const st=fs.statSync(file); insist(st.isFile(),'Not a regular file'); insist(st.size<=1048576,'File exceeds 1 MiB; choose a smaller text file');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|fs.constants.O_NOFOLLOW);
  try {
    const data=fs.readFileSync(fd); insist(!data.includes(0),'Binary files are not supported'); return data.toString('utf8');
  } finally {fs.closeSync(fd);}
}
function expectedText(file,expected) {
  if(expected===null) {insist(!fs.existsSync(file),'Create-only write refused: file already exists'); return '';}
  const text=readText(file); insist(textHash(text)===expected,'File changed since it was read; reread and reevaluate'); return text;
}
function atomicWrite(file,content) {
  insist(fs.statSync(path.dirname(file)).isDirectory(),'Parent directory does not exist');
  const temp=path.join(path.dirname(file),`.eutrya-${uid()}.tmp`);
  const mode=fs.existsSync(file)?fs.statSync(file).mode&0o777:0o644;
  const fd=fs.openSync(temp,'wx',mode);
  try {fs.writeFileSync(fd,content);fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
  try {fs.renameSync(temp,file);} catch(e){try{fs.unlinkSync(temp);}catch{}throw e;}
}
export const isEffect = action => ['mkdir','write','edit','run','shell','remember','skill_draft','mcp','hunt_create','hunt_card','hunt_route'].includes(action.type);
export class Toolbox {
  constructor({workspace,store,config,approve=async()=>false,redact=x=>x,knowledge=null,mcp=null,readOnly=false,sharedWorkspace=null,swarm=null,agentId='admin',allowedTools=null}) {
    this.knowledge=knowledge;this.mcp=mcp;this.readOnly=readOnly;
    this.root=fs.realpathSync(workspace);this.store=store;this.config=config;this.approve=approve;this.redact=redact;
    this.sharedWorkspace=sharedWorkspace;this.swarm=swarm;this.agentId=agentId;this.allowedTools=allowedTools;
  }
  available() {
    if(this.store.state.environment) return ['look','press','note','recall','ask','finish'];
    let tools=['list','read','search','code_surface','code_symbol','code_references','code_inspect','code_state','code_compare','browser','note','recall','ask','finish',
      ...(!this.readOnly?['mkdir','write','edit']:[]),...(this.config.allowExec&&!this.readOnly?['run','shell']:[]),
      ...(this.knowledge?['memory_search','skill',...(!this.readOnly?['remember','skill_draft']:[])]:[]),
      ...(this.mcp&&!this.readOnly?['mcp']:[]),
      'delegate','send_message','publish_finding','record_decision','update_task','consult_swarm',
      ...(this.sharedWorkspace?['hunt_board']:[]),
      ...(this.sharedWorkspace&&this.swarm&&this.agentId==='admin'?['hunt_create','hunt_card','hunt_route']:[])];
    if (this.allowedTools && Array.isArray(this.allowedTools)) {
      tools = tools.filter(t => this.allowedTools.includes(t));
    }
    return tools;
  }
  permitted(action) {return this.available().includes(action.type);}
  inspect(action) {
    const a=validateAction(action); insist(this.permitted(a),'Tool disabled in this session');
    if(a.type==='mcp')this.mcp.inspect(a);
    if('path' in a) safePath(this.root,a.path,{allowMissing:['write','mkdir'].includes(a.type)});
    if(['write','edit'].includes(a.type)) {
      const file=safePath(this.root,a.path,{allowMissing:['write','mkdir'].includes(a.type)});
      const before=expectedText(file,a.expectedSha256);
      if(a.type==='edit') insist(before.split(a.oldText).length===2,'Edit must match exactly once');
      return {action:a,preview:clip(a.type==='write'?a.content:`REPLACE:\n${a.oldText}\nWITH:\n${a.newText}`,12000),beforeHash:a.expectedSha256};
    }
    return {action:a};
  }
  async permission(action,signal) {
    this.inspect(action);
    if(['mkdir','write','edit'].includes(action.type) && !this.config.autoWrite) return this.approve(action,signal);
    if(['run','shell','remember','skill_draft','mcp'].includes(action.type)) return this.approve(action,signal);
    return true;
  }
  async execute(state,candidate,ticket,gate,signal) {
    gate.consume(state,candidate,ticket); throwIfAborted(signal);
    const a=validateAction(candidate.action); this.inspect(a);
    const result=await this.#perform(a,signal);
    return this.redact(result);
  }
  async #perform(a,signal) {
    switch(a.type) {
      case 'list': {
        const file=safePath(this.root,a.path); insist(fs.statSync(file).isDirectory(),'Not a directory');
        const all=fs.readdirSync(file,{withFileTypes:true}).filter(d=>!sensitive(d.name)&&!d.isSymbolicLink());
        return {path:a.path,entries:all.slice(0,200).map(d=>({name:d.name,type:d.isDirectory()?'directory':'file'})),truncated:all.length>200};
      }
      case 'read': {
        const text=readText(safePath(this.root,a.path)),lines=text.split('\n');
        return {path:a.path,sha256:textHash(text),totalLines:lines.length,startLine:a.startLine,endLine:Math.min(a.endLine,lines.length),content:lines.slice(a.startLine-1,a.endLine).map((v,i)=>`${a.startLine+i}|${v}`).join('\n')};
      }
      case 'code_surface': return codeSurface(this.root,a.path);
      case 'code_symbol': return codeSymbol(this.root,a.path,a.query);
      case 'code_references': return codeReferences(this.root,a.path,a.symbol);
      case 'code_inspect': return codeInspect(this.root,a.path,a.symbol);
      case 'code_state': return codeState(this.root,a.path,a.symbol);
      case 'code_compare': return codeCompare(this.root,a.path,a.symbols);
      case 'search': {
        const start=safePath(this.root,a.path); const queue=[start],matches=[];let scanned=0,bytes=0,limited=false;
        while(queue.length && matches.length<60 && scanned<500 && bytes<2097152) {
          throwIfAborted(signal); const file=queue.shift(),stat=fs.lstatSync(file);
          if(stat.isSymbolicLink() || (stat.isFile() && stat.nlink>1))continue;
          if(stat.isDirectory()) {for(const d of fs.readdirSync(file,{withFileTypes:true}).slice(0,600))if(!sensitive(d.name)&&!d.isSymbolicLink())queue.push(path.join(file,d.name));continue;}
          if(!stat.isFile() || stat.size>262144)continue;
          scanned++;bytes+=stat.size;
          let text;try{text=readText(file);}catch{continue;}
          text.split('\n').forEach((line,i)=>{if(matches.length<60 && line.toLowerCase().includes(a.text.toLowerCase()))matches.push({path:path.relative(this.root,file),line:i+1,text:clip(line,400)});});
        }
        limited=queue.length>0;
        return {matches,filesScanned:scanned,truncated:limited};
      }
      case 'mkdir': {
        const folder=safePath(this.root,a.path,{allowMissing:true});
        insist(folder!==this.root,'Workspace root already exists');
        insist(fs.statSync(path.dirname(folder)).isDirectory(),'Parent directory does not exist');
        if(fs.existsSync(folder)){insist(fs.statSync(folder).isDirectory(),'Path exists and is not a directory');return {path:a.path,created:false};}
        fs.mkdirSync(folder,{mode:0o755});return {path:a.path,created:true};
      }
      case 'write':
      case 'edit': {
        const file=safePath(this.root,a.path,{allowMissing:['write','mkdir'].includes(a.type)});
        const before=expectedText(file,a.expectedSha256);
        let content=a.content;
        if(a.type==='edit') {insist(before.split(a.oldText).length===2,'Edit must match exactly once');content=before.replace(a.oldText,a.newText);}
        const backupId=uid(),backupDir=path.join(this.store.dir,'backups');fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
        fs.writeFileSync(path.join(backupDir,backupId+'.json'),JSON.stringify({path:a.path,existed:a.expectedSha256!==null,before}),{mode:0o600,flag:'wx'});
        atomicWrite(file,content);
        return {path:a.path,sha256:textHash(content),bytes:Buffer.byteLength(content),backupId};
      }
      case 'run': return this.#run(a,signal);
      case 'shell': return this.#shell(a,signal);
      case 'browser': return this.#browser(a,signal);
      case 'remember':return this.knowledge.remember(a.text,{source:'agent-proposal',approved:true});
      case 'memory_search':return {memories:this.knowledge.memories(a.query),trust:'user-approved assertions'};
      case 'skill':return this.knowledge.readSkill(a.name);
      case 'skill_draft':return this.knowledge.installSkill(a.name,a.content,{draft:true});
      case 'mcp':return this.mcp.call(a,signal);
      case 'note': return {hypothesis:a.text,verified:false};
      case 'recall': return this.store.recall(a.observationId);
      case 'ask': return {question:a.question};
      case 'finish': return {answer:a.answer,verification:this.store.state.environment?(verifyPuzzle(this.store.state.environment)?'VERIFIED':'FAILED'):'NOT_INDEPENDENTLY_VERIFIED'};
      case 'look': return lookPuzzle(this.store.state.environment);
      case 'press': return pressPuzzle(this.store.state.environment,a.switch);
      case 'delegate': {
        let taskId = null;
        if (this.sharedWorkspace) {
          const t = this.sharedWorkspace.createTask({
            title: a.task,
            assignedTo: a.to,
            createdBy: this.agentId
          });
          taskId = t.id;
        }
        if (this.swarm) {
          this.swarm.notifyDelegation({ from: this.agentId, to: a.to, task: a.task, taskId });
        }
        return { delegated: true, to: a.to, task: a.task, taskId };
      }
      case 'send_message': {
        if (this.sharedWorkspace) {
          this.sharedWorkspace.postMessage({ from: this.agentId, to: a.to, event: 'DIRECT_MESSAGE', content: a.message });
        }
        return { sent: true, to: a.to, message: a.message };
      }
      case 'publish_finding': {
        let finding = null;
        if (this.sharedWorkspace) {
          finding = this.sharedWorkspace.publishFinding({
            author: this.agentId,
            topic: a.topic,
            content: a.content,
            verified: false
          });
        }
        return { published: true, topic: a.topic, content: a.content, id: finding?.id };
      }
      case 'record_decision': {
        let dec = null;
        if (this.sharedWorkspace) {
          dec = this.sharedWorkspace.recordDecision({
            author: this.agentId,
            title: a.title,
            rationale: a.rationale
          });
        }
        return { recorded: true, title: a.title, rationale: a.rationale, id: dec?.id };
      }
      case 'update_task': {
        if (this.sharedWorkspace) {
          this.sharedWorkspace.updateTask(a.taskId, { status: a.status });
        }
        return { updated: true, taskId: a.taskId, status: a.status };
      }
      case 'consult_swarm': {
        const data = this.sharedWorkspace ? this.sharedWorkspace.summary() : { note: 'No shared workspace attached' };
        return { query: a.query, state: data };
      }
      case 'hunt_create': {
        insist(this.sharedWorkspace, 'No shared workspace attached');
        const hunt=this.sharedWorkspace.createHunt({
          title:a.title,pageUrl:a.pageUrl,rules:a.rules,scope:a.scope,exclusions:a.exclusions,testingRules:a.testingRules,createdBy:this.agentId
        });
        this.sharedWorkspace.save(this.swarm?.swarmDir ?? this.store.dir);
        return {created:true,hunt};
      }
      case 'hunt_card': {
        insist(this.sharedWorkspace, 'No shared workspace attached');
        const card=this.sharedWorkspace.createHuntCard({
          huntId:a.huntId,title:a.title,objective:a.objective,priority:a.priority,preferredRoles:a.preferredRoles,dependsOn:a.dependsOn,createdBy:this.agentId
        });
        this.sharedWorkspace.save(this.swarm?.swarmDir ?? this.store.dir);
        return {created:true,card};
      }
      case 'hunt_board': {
        insist(this.sharedWorkspace, 'No shared workspace attached');
        const board=this.sharedWorkspace.huntBoard(a.huntId);
        insist(board, `Hunt not found: ${a.huntId}`);
        return board;
      }
      case 'hunt_route': {
        insist(this.swarm, 'Hunt routing requires the native swarm');
        return await this.swarm.runHuntBoard(a.huntId,{source:'agent'});
      }
      default:throw new Error(`Unsupported action ${a.type}`);
    }
  }
  #run(a,signal) {
    insist(this.config.allowExec,'Local process execution is disabled');
    throwIfAborted(signal);
    return new Promise((resolve,reject)=>{
      const env=Object.fromEntries(['PATH','HOME','LANG','LC_ALL','TMPDIR'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
      const child=spawn(a.program,a.args,{cwd:this.root,env,shell:false,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='',truncated=false,terminated=false,killTimer;
      const collect=(kind,data)=>{
        const old=kind==='out'?stdout:stderr;const text=old+data.toString();
        if(text.length>16000)truncated=true;
        if(kind==='out')stdout=text.slice(0,16000);else stderr=text.slice(0,16000);
      };
      child.stdout.on('data',x=>collect('out',x));child.stderr.on('data',x=>collect('err',x));
      const kill=sig=>{try{if(process.platform!=='win32')process.kill(-child.pid,sig);else child.kill(sig);}catch{}};
      const stop=()=>{terminated=true;kill('SIGTERM');killTimer=setTimeout(()=>kill('SIGKILL'),700);};
      const timer=setTimeout(stop,30000);signal?.addEventListener('abort',stop,{once:true});
      const cleanup=()=>{clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',stop);};
      child.on('error',e=>{cleanup();reject(new UncertainEffect(`Process could not complete: ${e.code??e.name}; inspect before resuming`));});
      child.on('close',(code,sig)=>{
        cleanup();
        if(terminated) {reject(new UncertainEffect('Process interrupted or timed out; it may have made partial changes. Inspect the workspace and resolve the pending action before continuing.'));return;}
        resolve({program:a.program,args:a.args,exitCode:code,signal:sig,stdout,stderr,truncated,checked:'process exit only'});
      });
    });
  }
  #shell(a,signal) {
    insist(this.config.allowExec,'Shell execution is disabled; use --allow-exec or set allowExec in config to enable it');
    throwIfAborted(signal);
    return new Promise((resolve,reject)=>{
      const env=Object.fromEntries(['PATH','HOME','USER','SHELL','TERM','LANG','LC_ALL','TMPDIR'].filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
      const shellBin=process.platform==='win32'?(process.env.COMSPEC||'cmd.exe'):(process.env.SHELL||'/bin/bash');
      const shellArgs=process.platform==='win32'?['/d','/s','/c',a.command]:['-c',a.command];
      const child=spawn(shellBin,shellArgs,{cwd:this.root,env,shell:false,detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
      let stdout='',stderr='',truncated=false,terminated=false,killTimer;
      const collect=(kind,data)=>{
        const old=kind==='out'?stdout:stderr;const text=old+data.toString();
        if(text.length>16000)truncated=true;
        if(kind==='out')stdout=text.slice(0,16000);else stderr=text.slice(0,16000);
      };
      child.stdout.on('data',x=>collect('out',x));child.stderr.on('data',x=>collect('err',x));
      const kill=sig=>{try{if(process.platform!=='win32')process.kill(-child.pid,sig);else child.kill(sig);}catch{}};
      const stop=()=>{terminated=true;kill('SIGTERM');killTimer=setTimeout(()=>kill('SIGKILL'),700);};
      const timer=setTimeout(stop,30000);signal?.addEventListener('abort',stop,{once:true});
      const cleanup=()=>{clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',stop);};
      child.on('error',e=>{cleanup();reject(new UncertainEffect(`Shell command failed to start: ${e.code??e.name}; inspect before resuming`));});
      child.on('close',(code,sig)=>{
        cleanup();
        if(terminated) {reject(new UncertainEffect('Shell command interrupted or timed out; it may have made partial changes. Inspect the workspace and resolve the pending action before continuing.'));return;}
        resolve({command:a.command,exitCode:code,signal:sig,stdout:this.redact(stdout),stderr:this.redact(stderr),truncated,checked:'shell process exit only'});
      });
    });
  }
  async #browser(a,signal) {
    throwIfAborted(signal);
    const url=a.url;
    insist(/^https?:\/\//i.test(url),'Invalid URL protocol: must be http or https');
    let html='';
    const chromiumPath='/usr/bin/chromium';
    let usedRenderer='fetch';
    if(fs.existsSync(chromiumPath)) {
      try {
        html=await new Promise((resolve,reject)=>{
          const child=spawn(chromiumPath,['--headless=new','--disable-gpu','--no-sandbox','--dump-dom',url],{
            stdio:['ignore','pipe','pipe']
          });
          let dom='';
          child.stdout.on('data',d=>{dom+=d;if(dom.length>1000000)child.kill();});
          const timer=setTimeout(()=>{try{child.kill('SIGKILL');}catch{}reject(new Error('Browser navigation timed out'));},20000);
          signal?.addEventListener('abort',()=>{try{child.kill('SIGKILL');}catch{}reject(new Error('Browser navigation aborted'));},{once:true});
          child.on('error',reject);
          child.on('close',code=>{
            clearTimeout(timer);
            if(code===0&&dom.length>0){usedRenderer='chromium-headless';resolve(dom);}
            else reject(new Error(`Chromium exited with code ${code}`));
          });
        });
      } catch {
        html='';
      }
    }
    if(!html) {
      const res=await fetch(url,{
        headers:{'User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Eutrya/0.3.1'},
        signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)
      });
      insist(res.ok,`HTTP ${res.status} ${res.statusText}`);
      html=await res.text();
      usedRenderer='http-fetch';
    }
    const titleMatch=html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title=titleMatch?titleMatch[1].trim().replace(/\s+/g,' '):'';
    const links=[];
    const linkRegex=/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
    let m;
    while((m=linkRegex.exec(html))!==null&&links.length<30) {
      const href=m[1].trim();
      const text=m[2].replace(/<[^>]+>/g,'').trim().replace(/\s+/g,' ');
      if(href&&!href.startsWith('javascript:')&&!href.startsWith('#')) {
        try {
          const resolved=new URL(href,url).href;
          if(!links.some(l=>l.url===resolved))links.push({text:text||resolved,url:resolved});
        } catch {}
      }
    }
    const text=htmlToText(html);
    const truncated=text.length>16000;
    return {url,title,renderer:usedRenderer,content:clip(text,16000),links:links.slice(0,20),truncated};
  }
}
