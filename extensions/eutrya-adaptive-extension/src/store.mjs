import { mkdirSync, openSync, closeSync, writeFileSync, readFileSync, renameSync, unlinkSync, fsyncSync, existsSync, lstatSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { assert, audit, clone, hash, plain, text, uid } from './core.mjs';
import { validateConfig } from './config.mjs';

export class StateStore {
  #state; #closed=false; #lock; #lockToken;
  constructor({directory,scope,config={}}) {
    plain(scope,'scope');
    assert(Object.keys(scope).sort().join(',') === 'conversationId,userId,workspaceId','Scope must identify exactly userId, workspaceId, conversationId');
    for(const [k,v] of Object.entries(scope)) text(v,k,1024);
    this.scope=clone(scope);
    const root=path.resolve(text(directory,'directory',4096));
    mkdirSync(root,{recursive:true,mode:0o700});
    assert(!lstatSync(root).isSymbolicLink(),'State root cannot be a symlink');
    this.directory=path.join(root,hash(scope).slice(0,32));
    mkdirSync(this.directory,{mode:0o700,recursive:true});
    assert(!lstatSync(this.directory).isSymbolicLink(),'State directory cannot be a symlink'); chmodSync(this.directory,0o700);
    this.file=path.join(this.directory,'adaptive.json'); this.#lock=path.join(this.directory,'owner.lock');
    this.#lockToken=uid('lock');
    let fd;
    try { fd=openSync(this.#lock,'wx',0o600); writeFileSync(fd,JSON.stringify({pid:process.pid,token:this.#lockToken,at:new Date().toISOString()})); fsyncSync(fd); }
    catch(e) { throw new Error(`Adaptive state is locked or unavailable: ${e.code}. Do not remove another active owner's lock.`); }
    finally { if(fd!==undefined)closeSync(fd); }
    try {
      if(existsSync(this.file)) {
        assert(!lstatSync(this.file).isSymbolicLink(),'State file cannot be a symlink');
        assert(lstatSync(this.file).size<=8_000_000,'State snapshot too large');
        const envelope=JSON.parse(readFileSync(this.file,'utf8'));
        assert(envelope.digest===hash(envelope.state),'State checksum mismatch; manual recovery required');
        this.#state=envelope.state;
        assert(this.#state.schema===1 && hash(this.#state.scope)===hash(scope),'Incompatible or wrong-scope state');
        validateConfig(this.#state.config);
        let recovered=false;
        for(const job of Object.values(this.#state.jobs)) if(['EVALUATING','RUNNING'].includes(job.status)) {job.status='NEEDS_REVIEW';recovered=true;}
        if(recovered) {audit(this.#state,'recovery.required');this.#state.revision++;}
      } else {
        this.#state={schema:1,scope:clone(scope),revision:0,policyEpoch:0,controlEpoch:0,activationEpoch:0,config:validateConfig(config),preferences:{verbosity:'brief',answerFirst:true,notes:[]},feedback:[],outcomes:[],decisions:[],lastChoices:{},jobs:{},roots:{},audit:[],nextAudit:1,frozen:false,meter:{calls:0,jevCalls:0,textCalls:0,inputTokens:0,outputTokens:0,knownCostUsd:0,unpricedCalls:0}};
      }
      this.#write(this.#state);
    } catch(e) { this.close();throw e; }
  }
  #write(next) {
    const raw=JSON.stringify({digest:hash(next),state:next}); assert(Buffer.byteLength(raw)<=8_000_000,'State snapshot limit reached; archive before continuing');
    const temporary=path.join(this.directory,`.adaptive-${uid('write')}.tmp`);
    let fd;
    try { fd=openSync(temporary,'wx',0o600); writeFileSync(fd,raw); fsyncSync(fd); closeSync(fd); fd=undefined; renameSync(temporary,this.file); const d=openSync(this.directory,'r'); try {fsyncSync(d);}finally{closeSync(d);} }
    catch(e) {if(fd!==undefined)closeSync(fd);try{unlinkSync(temporary);}catch{}throw e;}
  }
  read() { assert(!this.#closed,'Store closed');return clone(this.#state); }
  update(fn) {
    assert(!this.#closed,'Store closed'); const next=clone(this.#state);const value=fn(next);
    assert(!value?.then,'State transactions must be synchronous'); next.revision++;
    this.#write(next);this.#state=next;return clone(value);
  }
  close() {
    if(this.#closed)return;this.#closed=true;
    try {if(JSON.parse(readFileSync(this.#lock,'utf8')).token===this.#lockToken)unlinkSync(this.#lock);}catch{}
  }
}
