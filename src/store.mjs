import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { digest, uid, insist, redactor } from './util.mjs';

const SAFE_ID = /^[a-zA-Z0-9_-]{1,80}$/;
export function workspaceBucket(root, workspace) { return path.join(root,digest(fs.realpathSync(workspace)).slice(0,16)); }
export function newState(workspace, id = uid(), environment = null) {
  return {
    schemaVersion:1,id,workspace:fs.realpathSync(workspace),createdAt:new Date().toISOString(),
    revision:0,status:'IDLE',task:'',directives:[],previousTasks:[],summary:'',hypotheses:[],unknowns:[],
    lastMode:null,observations:[],notebook:[],nextObservation:1,totalSteps:0,
    pending:null,environment,answer:null,reason:null,
    meter:{calls:0,jevCalls:0,cortexCalls:0,inputTokens:0,outputTokens:0,knownCostUsd:0,unpricedCalls:0,usageMissingCalls:0}
  };
}
export class Store {
  constructor(root, workspace, {id = uid(), existing = false, environment = null, redact = redactor()} = {}) {
    insist(SAFE_ID.test(id),'Invalid session ID');
    this.redact=redact; this.workspace=fs.realpathSync(workspace);
    this.dir=path.join(workspaceBucket(root,this.workspace),id);
    if (existing) insist(fs.existsSync(path.join(this.dir,'state.json')),'Session not found in this workspace');
    fs.mkdirSync(this.dir,{recursive:true,mode:0o700});
    this.file=path.join(this.dir,'state.json'); this.trace=path.join(this.dir,'events.jsonl'); this.lockFile=path.join(this.dir,'lock');
    this.lock();
    try {
      this.state=existing ? this.read() : newState(this.workspace,id,environment);
      insist(this.state.workspace===this.workspace,'Session workspace mismatch');
      insist(this.state.schemaVersion===1,'Unsupported session version');
      const rows=this.readEvents(); this.seq=rows.at(-1)?.seq??0; this.head=rows.at(-1)?.hash??'ROOT';
      if (!existing) { insist(!fs.existsSync(this.file),'Session already exists'); this.save(); this.event('session.created',{id,workspace:this.workspace}); }
    } catch(e) { this.close(); throw e; }
  }
  lock() {
    if (fs.existsSync(this.lockFile)) {
      let lock;
      try { lock=JSON.parse(fs.readFileSync(this.lockFile,'utf8')); } catch { throw new Error('Unreadable session lock; inspect it before manually removing it'); }
      insist(lock.host===os.hostname(),'Session lock belongs to another host; refusing concurrent access');
      let alive=true;
      try { process.kill(lock.pid,0); } catch(e) { if(e.code==='ESRCH') alive=false; }
      insist(!alive,'Session is already open in another process');
      fs.unlinkSync(this.lockFile);
    }
    fs.writeFileSync(this.lockFile,JSON.stringify({pid:process.pid,host:os.hostname()}),{flag:'wx',mode:0o600});
    this.ownsLock=true;
  }
  read() {
    const envelope=JSON.parse(fs.readFileSync(this.file,'utf8'));
    insist(envelope.checksum===digest(envelope.state),'Session checksum mismatch; refusing to resume');
    return envelope.state;
  }
  save() {
    const s=this.redact(this.state);
    const temp=path.join(this.dir,`.state-${uid()}.tmp`);
    const fd=fs.openSync(temp,'wx',0o600);
    try { fs.writeFileSync(fd,JSON.stringify({checksum:digest(s),state:s},null,2)+'\n'); fs.fsyncSync(fd); }
    finally { fs.closeSync(fd); }
    fs.renameSync(temp,this.file);
    // Best-effort directory durability. This is not an external-side-effect transaction.
    try { const d=fs.openSync(this.dir,'r'); try { fs.fsyncSync(d); } finally { fs.closeSync(d); } } catch {}
  }
  event(type,data={}) {
    const row={seq:++this.seq,at:new Date().toISOString(),type,data:this.redact(data),prev:this.head};
    row.hash=digest(row); this.head=row.hash;
    const fd=fs.openSync(this.trace,'a',0o600);
    try { fs.writeFileSync(fd,JSON.stringify(row)+'\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    return row;
  }
  readEvents() {
    if(!fs.existsSync(this.trace)) return [];
    const raw=fs.readFileSync(this.trace,'utf8');
    insist(raw==='' || raw.endsWith('\n'),'Incomplete trace record; inspect the trace before resuming');
    let prev='ROOT',seq=0;
    return raw.split('\n').filter(Boolean).map(line=>{
      const r=JSON.parse(line); const {hash,...body}=r;
      insist(r.prev===prev && r.seq===++seq && hash===digest(body),'Trace integrity check failed'); prev=hash; return r;
    });
  }
  recall(id) {
    const row=this.readEvents().find(x=>x.type==='observation' && x.data.id===id);
    insist(row,`Observation ${id} not found`); return row.data;
  }
  close() {
    if(this.ownsLock) { try { fs.unlinkSync(this.lockFile); } catch {} this.ownsLock=false; }
  }
}
export function listSessions(root,workspace) {
  const folder=workspaceBucket(root,workspace);
  if(!fs.existsSync(folder)) return [];
  return fs.readdirSync(folder).filter(id=>SAFE_ID.test(id)).flatMap(id=>{
    try {
      const file=path.join(folder,id,'state.json'); const e=JSON.parse(fs.readFileSync(file,'utf8'));
      if(e.checksum!==digest(e.state)) return [];
      return [{id,task:e.state.task,status:e.state.status,createdAt:e.state.createdAt,steps:e.state.totalSteps}];
    } catch { return []; }
  }).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
}
