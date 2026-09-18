#!/usr/bin/env node
// Local bridge smoke client. No credentials in command-line arguments.
import { randomUUID } from 'node:crypto';
import { signature } from '../src/gateway/security.mjs';
import { safeServiceUrl,jsonRequest } from '../src/http.mjs';
const [command='outbox',text='Hello from the bridge',user='local-owner']=process.argv.slice(2);
const secret=process.env.EUTRYA_WEBHOOK_SECRET;
try{
  if(!secret||secret.length<32)throw new Error('Set EUTRYA_WEBHOOK_SECRET to a high-entropy value of at least 32 characters');
  if(!['send','outbox'].includes(command))throw new Error('Usage: node examples/webhook-client.mjs send "TEXT" USER_ID | outbox');
  const base=safeServiceUrl(process.env.EUTRYA_WEBHOOK_URL??'http://127.0.0.1:8787',{local:true});
  const route=command==='send'?'/v1/messages':'/v1/outbox',method=command==='send'?'POST':'GET';
  const raw=command==='send'?JSON.stringify({id:randomUUID(),userId:user,chatId:'console',threadId:'',text,direct:true}):'';
  const timestamp=String(Math.floor(Date.now()/1000));
  const headers={'Content-Type':'application/json','X-Eutrya-Timestamp':timestamp,'X-Eutrya-Signature':signature(secret,method,new URL(base+route).pathname,timestamp,raw)};
  console.log(JSON.stringify(await jsonRequest(base+route,{method,headers,...(raw?{body:raw}:{})}),null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
