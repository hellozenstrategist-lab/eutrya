import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { spawn, spawnSync } from 'node:child_process';
import { insist, throwIfAborted } from '../util.mjs';

function codexEnv() {
  return Object.fromEntries(['PATH','HOME','USER','LANG','LC_ALL','TMPDIR','CODEX_HOME']
    .filter(k=>process.env[k]).map(k=>[k,process.env[k]]));
}

export function codexLoginStatus() {
  const result=spawnSync('codex',['login','status'],{encoding:'utf8',env:codexEnv(),timeout:10000});
  return {loggedIn:result.status===0,status:result.status,summary:result.status===0?'ChatGPT subscription connected':'ChatGPT subscription not connected'};
}

export async function codexSubscriptionModels({signal}={}) {
  throwIfAborted(signal);
  insist(codexLoginStatus().loggedIn,'ChatGPT subscription is not connected. Run `codex login --device-auth` first.');
  return new Promise((resolve,reject)=>{
    const child=spawn('codex',['app-server','--listen','stdio://'],{env:codexEnv(),stdio:['pipe','pipe','pipe']});
    const rl=readline.createInterface({input:child.stdout});
    let settled=false,stderr='';
    const cleanup=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);rl.close();try{child.kill('SIGTERM');}catch{}};
    const finish=(err,value)=>{if(settled)return;settled=true;cleanup();err?reject(err):resolve(value);};
    const abort=()=>finish(new DOMException('Stopped by operator','AbortError'));
    signal?.addEventListener('abort',abort,{once:true});
    const timer=setTimeout(()=>finish(new Error('Timed out loading ChatGPT subscription models')),15000);
    child.stderr.on('data',d=>{stderr=(stderr+d.toString()).slice(-4000);});
    child.on('error',()=>finish(new Error('Codex CLI is unavailable')));
    child.on('close',code=>{if(!settled)finish(new Error(`Codex app-server exited before returning models (exit ${code})`));});
    rl.on('line',line=>{
      let msg;try{msg=JSON.parse(line);}catch{return;}
      if(msg.id===1&&msg.result) {
        child.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
        child.stdin.write(JSON.stringify({method:'model/list',id:2,params:{limit:100,includeHidden:false}})+'\n');
      }
      if(msg.id===2) {
        if(msg.error){finish(new Error(`Codex model catalog failed: ${msg.error.message??'unknown error'}`));return;}
        const rows=msg.result?.data;
        if(!Array.isArray(rows)){finish(new Error('Codex returned an invalid model catalog'));return;}
        finish(null,rows.filter(x=>typeof (x.model??x.id)==='string').map(x=>({
          id:x.model??x.id,
          name:x.displayName??x.model??x.id,
          type:'text',
          pricing:null,
          defaultReasoningEffort:x.defaultReasoningEffort??null,
          supportedReasoningEfforts:x.supportedReasoningEfforts??[]
        })));
      }
    });
    child.stdin.write(JSON.stringify({method:'initialize',id:1,params:{clientInfo:{name:'eutrya',title:'Eutrya',version:'0.4.1'}}})+'\n');
  });
}

export async function codexSubscriptionText({messages,model,signal,onToken=()=>{},timeoutMs=90000}) {
  throwIfAborted(signal);
  insist(codexLoginStatus().loggedIn,'ChatGPT subscription is not connected. Run `codex login --device-auth` first.');
  insist(typeof model==='string'&&model.length>0&&model.length<=200,'Invalid ChatGPT subscription model');
  insist(Array.isArray(messages)&&messages.length>0,'Messages are required');
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'eutrya-codex-'));
  const output=path.join(directory,'answer.txt');
  const prompt=messages.map(m=>`${String(m.role).toUpperCase()}:\n${m.content}`).join('\n\n')+
    '\n\nReturn only the requested final response. Do not inspect files, run commands, or use tools.';
  try {
    return await new Promise((resolve,reject)=>{
      const args=['exec','--model',model,'--sandbox','read-only','--ask-for-approval','never','--skip-git-repo-check','--ephemeral','--ignore-rules','--color','never','-C',directory,'--output-last-message',output,'-'];
      const child=spawn('codex',args,{env:codexEnv(),stdio:['pipe','ignore','pipe'],detached:process.platform!=='win32'});
      let stderr='',settled=false,killTimer;
      const kill=sig=>{try{if(process.platform!=='win32')process.kill(-child.pid,sig);else child.kill(sig);}catch{}};
      const cleanup=()=>{clearTimeout(timer);clearTimeout(killTimer);signal?.removeEventListener('abort',abort);};
      const finish=(err,value)=>{if(settled)return;settled=true;cleanup();err?reject(err):resolve(value);};
      const abort=()=>{kill('SIGTERM');killTimer=setTimeout(()=>kill('SIGKILL'),700);finish(new DOMException('Stopped by operator','AbortError'));};
      signal?.addEventListener('abort',abort,{once:true});
      const timer=setTimeout(()=>{kill('SIGTERM');killTimer=setTimeout(()=>kill('SIGKILL'),700);finish(new Error('ChatGPT subscription model timed out'));},timeoutMs);
      child.stderr.on('data',d=>{stderr=(stderr+d.toString()).slice(-8000);});
      child.on('error',()=>finish(new Error('Codex CLI could not start')));
      child.on('close',code=>{
        if(settled)return;
        if(code!==0){
          const auth=/not logged in|login|authentication/i.test(stderr);
          finish(new Error(auth?'ChatGPT subscription is not connected. Run `codex login --device-auth`.':`ChatGPT subscription model failed (Codex exit ${code})`));
          return;
        }
        if(!fs.existsSync(output)){finish(new Error('Codex returned no final response'));return;}
        const text=fs.readFileSync(output,'utf8').trim();
        if(!text){finish(new Error('Codex returned an empty response'));return;}
        try{onToken(text);}catch{}
        finish(null,{text,usage:{inputTokens:null,outputTokens:null,costUsd:null},model});
      });
      child.stdin.end(prompt);
    });
  } finally {
    fs.rmSync(directory,{recursive:true,force:true});
  }
}

export function createCodexSubscriptionStreamer({model,timeoutMs=90000}={}) {
  return ({messages,signal,onToken})=>codexSubscriptionText({messages,model,signal,onToken,timeoutMs});
}
