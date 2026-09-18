import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const files=[];
const SKIP=new Set(['node_modules','target','.git']);
function walk(folder){
  if(!fs.existsSync(folder)) return;
  for(const e of fs.readdirSync(folder,{withFileTypes:true})){
    if(SKIP.has(e.name)) continue;
    const p=path.join(folder,e.name);
    if(e.isDirectory()) walk(p);
    else if(p.endsWith('.mjs') || p.endsWith('.js')) files.push(p);
  }
}
for(const d of ['src','bin','tests','desktop']) walk(d);
for(const f of files){
  const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});
  if(r.status!==0){console.error(r.stderr);process.exit(1);}
}
console.log(`Syntax checked ${files.length} JavaScript modules.`);
