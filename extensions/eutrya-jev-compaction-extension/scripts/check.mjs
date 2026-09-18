import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const root=new URL('../',import.meta.url).pathname;let count=0;
function walk(p){for(const e of fs.readdirSync(p,{withFileTypes:true})){if(e.name==='node_modules')continue;const f=path.join(p,e.name);if(e.isDirectory())walk(f);else if(f.endsWith('.mjs')){const r=spawnSync(process.execPath,['--check',f],{encoding:'utf8'});if(r.status!==0){process.stderr.write(r.stderr);process.exit(1);}count++;}}}
walk(root);console.log(`${count} JavaScript modules passed syntax checks.`);
