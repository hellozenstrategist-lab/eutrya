import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {assert,canonical,hash,scopeKey} from './util.mjs';

function checkedDir(dir) {
  const resolved=path.resolve(dir);
  let current=path.parse(resolved).root;
  for(const part of resolved.slice(current.length).split(path.sep).filter(Boolean)) {
    current=path.join(current,part);
    if(!fs.existsSync(current))fs.mkdirSync(current,{mode:0o700});
    const stat=fs.lstatSync(current);
    assert(stat.isDirectory()&&!stat.isSymbolicLink(),'ARCHIVE_PATH','Archive directories must not contain symlinks');
  }
  return resolved;
}
function readSafe(file) {
  const stat=fs.lstatSync(file);
  assert(stat.isFile()&&!stat.isSymbolicLink()&&stat.nlink===1,'ARCHIVE_PATH','Archive entry must be a regular private file');
  assert((stat.mode&0o077)===0,'ARCHIVE_PERMISSIONS','Archive entry permissions are not private');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
function atomic(dir,name,body) {
  const temp=path.join(dir,`.${randomUUID()}.tmp`),target=path.join(dir,name);
  const fd=fs.openSync(temp,'wx',0o600);
  try {fs.writeFileSync(fd,canonical(body)+'\n');fs.fsyncSync(fd);}
  catch(e){try{fs.unlinkSync(temp);}catch{}throw e;}finally{fs.closeSync(fd);}
  try {
    // link is exclusive: an existing content-addressed snapshot is never replaced.
    fs.linkSync(temp,target);
  } catch(e) {if(e.code!=='EEXIST')throw e;}
  finally {fs.unlinkSync(temp);}
  const d=fs.openSync(dir,'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}
  return target;
}
export class FileArchive {
  constructor({root,scope}) {
    assert(typeof root==='string'&&path.isAbsolute(root),'ARCHIVE_PATH','Use an absolute, host-controlled archive root');
    this.key=scopeKey(scope);this.dir=checkedDir(path.join(root,this.key));
    assert((fs.statSync(this.dir).mode&0o077)===0,'ARCHIVE_PERMISSIONS','Scope archive directory must have mode 0700');
  }
  write(snapshot) {
    const payload={format:1,scope:this.key,snapshot},id=hash(payload);
    const target=atomic(this.dir,`${id}.json`,{checksum:id,payload});
    const entry=readSafe(target);
    assert(entry.checksum===id && hash(entry.payload)===id && entry.payload.scope===this.key,'ARCHIVE_INTEGRITY','Archive collision or corruption');
    return id;
  }
  read(id) {
    assert(typeof id==='string'&&/^[a-f0-9]{64}$/.test(id),'ARCHIVE_ID','Invalid archive ID');
    const e=readSafe(path.join(this.dir,`${id}.json`));
    assert(e.checksum===id&&hash(e.payload)===id&&e.payload.scope===this.key,'ARCHIVE_INTEGRITY','Archive checksum/scope mismatch');
    return e.payload.snapshot;
  }
  report(id,report) {
    this.read(id);
    const envelope={archiveId:id,scope:this.key,report};
    atomic(this.dir,`${id}.${hash(envelope)}.report.json`,envelope);
  }
  list() {
    return fs.readdirSync(this.dir).filter(n=>/^[a-f0-9]{64}\.json$/.test(n)).map(n=>n.slice(0,-5)).sort();
  }
}
