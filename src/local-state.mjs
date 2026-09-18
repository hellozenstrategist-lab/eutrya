import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { insist } from './util.mjs';

// Short synchronous transactions. Locks fail closed; operators inspect stale locks.
export function atomicJson(file, value) {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temp=file+'.'+randomUUID()+'.tmp';
  const fd=fs.openSync(temp,'wx',0o600);
  try {fs.writeFileSync(fd,JSON.stringify(value,null,2)+'\n');fs.fsyncSync(fd);} finally {fs.closeSync(fd);}
  try {fs.renameSync(temp,file);} catch(e){fs.rmSync(temp,{force:true});throw e;}
  try {const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}catch{}
}
export function readJson(file, fallback) {
  if(!fs.existsSync(file))return structuredClone(fallback);
  const st=fs.lstatSync(file);insist(st.isFile()&&!st.isSymbolicLink()&&st.size<20000000,'Invalid local state file');
  return JSON.parse(fs.readFileSync(file,'utf8'));
}
export class LocalState {
  constructor(file,initial={}){this.file=file;this.initial=initial;}
  read(){return readJson(this.file,this.initial);}
  transaction(fn){
    fs.mkdirSync(path.dirname(this.file),{recursive:true,mode:0o700});
    const lock=this.file+'.lock';let fd;
    try{fd=fs.openSync(lock,'wx',0o600);}catch(e){if(e.code==='EEXIST')throw new Error(`State busy or interrupted: inspect ${lock} before removing it`);throw e;}
    try {fs.writeFileSync(fd,JSON.stringify({pid:process.pid,host:os.hostname()}));const data=this.read();const result=fn(data);insist(!(result instanceof Promise),'State transaction must be synchronous');atomicJson(this.file,data);return result;}
    finally{fs.closeSync(fd);fs.unlinkSync(lock);}
  }
}
export function processLock(file) {
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  if(fs.existsSync(file)) {
    const old=readJson(file,null);insist(old?.host===os.hostname(),'Process lock is owned by another host');
    let alive=true;try{process.kill(old.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
    insist(!alive,`Another process already owns ${file}`);fs.unlinkSync(file);
  }
  fs.writeFileSync(file,JSON.stringify({pid:process.pid,host:os.hostname()}),{flag:'wx',mode:0o600});
  return ()=>{try{fs.unlinkSync(file);}catch{}};
}
