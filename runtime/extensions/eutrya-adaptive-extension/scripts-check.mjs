import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root=path.dirname(fileURLToPath(import.meta.url));
function walk(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.name==='node_modules'?[]:x.isDirectory()?walk(path.join(dir,x.name)):x.name.endsWith('.mjs')?[path.join(dir,x.name)]:[]);}
const files=walk(root);for(const file of files){const r=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});if(r.status)process.exit(r.status);}
console.log(`Syntax checked ${files.length} JavaScript modules.`);
