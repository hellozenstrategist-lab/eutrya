import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const host=process.argv[2]??process.env.EUTRYA_NATIVE_ROOT;
if(!host){console.error('Usage: npm run verify:native -- /absolute/path/to/UNMODIFIED/eutrya-v0.2.0\nThis copies the checkout into a temporary directory; it never modifies the supplied checkout.');process.exit(2);}
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'eutrya-compaction-native-'));let failed=false;
try {
  fs.cpSync(path.resolve(host),temp,{recursive:true,filter:p=>!p.split(path.sep).some(x=>x==='node_modules'||x==='.git'||x==='.env')});
  for(const args of [['apply','--check',path.join(root,'patches/native-v02-hooks.patch')],['apply',path.join(root,'patches/native-v02-hooks.patch')]]){
    const r=spawnSync('git',args,{cwd:temp,encoding:'utf8'});if(r.status!==0)throw new Error('Reference seam patch did not apply. Do not force it onto a newer swarm checkout.\n'+r.stderr);
  }
  const runs=[
    {label:'ORIGINAL NATIVE REGRESSION SUITE (extension disabled)',cwd:temp,args:['--test',...fs.readdirSync(path.join(temp,'tests')).filter(f=>f.endsWith('.test.mjs')).map(f=>path.join(temp,'tests',f))]},
    {label:'ACTUAL NATIVE + COMPACTION INTEGRATION (mock inference)',cwd:root,args:['--test',path.join(root,'integration-tests/native.test.mjs')]}
  ];
  for(const run of runs){console.log(`\n=== ${run.label} ===`);const r=spawnSync(process.execPath,run.args,{cwd:run.cwd,env:{...process.env,EUTRYA_NATIVE_ROOT:temp},encoding:'utf8',maxBuffer:16*1024*1024});process.stdout.write(r.stdout??'');process.stderr.write(r.stderr??'');if(r.status!==0)failed=true;}
} catch(e) {failed=true;console.error(e.message);}
finally{fs.rmSync(temp,{recursive:true,force:true});}
if(failed)process.exit(1);
