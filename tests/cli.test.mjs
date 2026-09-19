import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const script=fileURLToPath(new URL('../bin/eutrya.mjs',import.meta.url));
function setup(t) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eutrya-cli-test-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const args=['--cwd',root,'--session-root',path.join(root,'sessions'),'--config',path.join(root,'unused-config.json')];
  return {root,run:(...cmd)=>spawnSync(process.execPath,[script,...cmd,...args],{encoding:'utf8',timeout:8000,env:{...process.env,AI_GATEWAY_API_KEY:''}})};
}
test('CLI help documents the standalone loop and controls',t=>{
  const {run}=setup(t);const r=run('--help');assert.equal(r.status,0);assert.match(r.stdout,/standalone Jev-native/);assert.match(r.stdout,/steer/);
  assert.match(r.stdout,/thinking/);assert.match(r.stdout,/reload/);assert.match(r.stdout,/\/context/);assert.match(r.stdout,/\/autocompact/);assert.match(r.stdout,/\/yolo/);assert.match(r.stdout,/\/queue/);assert.match(r.stdout,/\/feed/);
});
test('offline CLI demo works with no installed SDK and no key',t=>{
  const {run}=setup(t);const r=run('demo','--json');assert.equal(r.status,0,r.stdout+r.stderr);
  const rows=r.stdout.trim().split('\n').map(JSON.parse),last=rows.at(-1);assert.equal(last.state,'VERIFIED');assert.equal(last.meter.calls,24);
  assert.ok(rows.some(x=>x.type==='jev.control'&&x.data.source==='mock'));
});
test('live run without credentials fails instead of silently running fixtures',t=>{
  const {run}=setup(t);const r=run('run','Hello','--model','example/model');assert.equal(r.status,1);assert.match(r.stdout,/AI_GATEWAY_API_KEY/);assert.ok(!r.stdout.includes('VERIFIED'));
});
test('doctor does not make paid requests by default',t=>{
  const {run}=setup(t);const r=run('doctor');assert.equal(r.status,0);assert.match(r.stdout,/'?NOT RUN'?/);assert.match(r.stdout,/gatewayKeyPresent.*false/);
});
test('CLI session listing and trace inspection work after a demo',t=>{
  const {run}=setup(t);let r=run('demo','--json');assert.equal(r.status,0);const result=JSON.parse(r.stdout.trim().split('\n').at(-1));
  r=run('sessions');assert.match(r.stdout,new RegExp(result.session));r=run('trace',result.session);assert.equal(r.status,0);assert.match(r.stdout,/Verified \d+ trace records/);
});
test('benchmark results label fixtures and do not claim model performance',t=>{
  const {run}=setup(t);const r=run('bench','--seeds','1,2,3');assert.equal(r.status,0,r.stdout+r.stderr);const result=JSON.parse(r.stdout);assert.match(result.mode,/NOT MODEL PERFORMANCE/);assert.equal(result.comparison,false);assert.ok(result.rows.every(x=>x.status==='VERIFIED'));
});
