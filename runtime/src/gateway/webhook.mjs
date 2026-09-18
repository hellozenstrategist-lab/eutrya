import http from 'node:http';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { LocalState } from '../local-state.mjs';
import { insist } from '../util.mjs';
import { constantEqual,verifySignature,signature } from './security.mjs';
import { jsonRequest,chunks,safeServiceUrl } from '../http.mjs';

async function readBody(req,max=262144){let n=0;const a=[];for await(const chunk of req){n+=chunk.length;if(n>max){const e=new Error('Request too large');e.statusCode=413;throw e;}a.push(chunk);}return Buffer.concat(a);}
function response(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));}
export function whatsappMessages(body,phoneId){
  const out=[];
  for(const entry of body.entry??[])for(const c of entry.changes??[]){const v=c.value;if(c.field!=='messages'||v?.metadata?.phone_number_id!==phoneId)continue;
    for(const m of v.messages??[])if(m.type==='text'&&m.text?.body)out.push({platform:'whatsapp',id:m.id,userId:m.from,chatId:m.from,threadId:'',text:m.text.body,direct:true});}
  return out;
}
export class WebhookAdapter {
  constructor(config,{env=process.env,fetchImpl=fetch}={}){this.config=config;this.env=env;this.fetch=fetchImpl;this.name='webhook';}
  async start({receive,log,signal,stateRoot}){
    this.secret=this.env.EUTRYA_WEBHOOK_SECRET;insist(this.secret?.length>=32,'EUTRYA_WEBHOOK_SECRET must have at least 32 characters');
    this.outbox=new LocalState(path.join(stateRoot,'bridge-outbox.json'),{messages:[]});
    this.server=http.createServer(async(req,res)=>{try{
      const raw=await readBody(req);if(!verifySignature(this.secret,req.method,req.url,req.headers,raw)){response(res,401,{error:'Authentication required'});return;}
      if(req.method==='POST'&&req.url==='/v1/messages'){
        const body=JSON.parse(raw);const result=await receive({...body,platform:'webhook'});response(res,result.accepted?202:result.busy?429:200,result);return;
      }
      if(req.method==='GET'&&req.url==='/v1/outbox'){response(res,200,this.outbox.read());return;}
      response(res,404,{error:'Not found'});
    }catch(e){log('webhook.request_rejected',{status:e.statusCode??400});if(!res.headersSent)response(res,e.statusCode??400,{error:'Invalid or unavailable request'});}});
    this.server.requestTimeout=15000;this.server.headersTimeout=10000;
    await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(this.config.port??8787,'127.0.0.1',resolve);});
  }
  async send(m,text){
    const item={id:m.deliveryId,chatId:m.chatId,userId:m.userId,threadId:m.threadId,text,at:new Date().toISOString()};
    this.outbox.transaction(s=>{s.messages.push(item);s.messages=s.messages.slice(-200);});
    // No user-controlled callback URLs. Optional callback is configured by the local operator only.
    if(this.config.deliveryUrl){const url=safeServiceUrl(this.config.deliveryUrl,{local:true}),u=new URL(url);const raw=JSON.stringify(item),timestamp=String(Math.floor(Date.now()/1000));
      await jsonRequest(url,{fetchImpl:this.fetch,method:'POST',headers:{'Content-Type':'application/json','X-Eutrya-Timestamp':timestamp,'X-Eutrya-Signature':signature(this.secret,'POST',u.pathname,timestamp,raw)},body:raw});}
  }
  async close(){if(this.server)await new Promise(r=>this.server.close(r));}
}
export class WhatsAppAdapter {
  constructor(config,{env=process.env,fetchImpl=fetch}={}){this.config=config;this.env=env;this.fetch=fetchImpl;this.name='whatsapp';}
  async start({receive,log}){
    this.token=this.env.WHATSAPP_ACCESS_TOKEN;this.secret=this.env.WHATSAPP_APP_SECRET;this.verifyToken=this.env.WHATSAPP_VERIFY_TOKEN;
    insist(this.token&&this.secret&&this.verifyToken,'Set WhatsApp access token, app secret, and verification token');
    insist(/^v[0-9]+\.[0-9]+$/.test(this.config.graphVersion??''),'Set whatsapp.graphVersion to the supported Graph API version selected in your Meta app');
    insist(/^[0-9]+$/.test(this.config.phoneNumberId??''),'Set whatsapp.phoneNumberId');
    this.server=http.createServer(async(req,res)=>{try{
      const u=new URL(req.url,'http://localhost');
      if(u.pathname!=='/whatsapp'){response(res,404,{error:'Not found'});return;}
      if(req.method==='GET'){
        if(u.searchParams.get('hub.mode')==='subscribe'&&constantEqual(u.searchParams.get('hub.verify_token'),this.verifyToken)){res.writeHead(200,{'Content-Type':'text/plain','Cache-Control':'no-store'});res.end(u.searchParams.get('hub.challenge')??'');return;}
        response(res,403,{error:'Verification failed'});return;
      }
      if(req.method!=='POST'){response(res,405,{error:'Method not allowed'});return;}
      const raw=await readBody(req);const expected='sha256='+createHmac('sha256',this.secret).update(raw).digest('hex');
      if(!constantEqual(expected,req.headers['x-hub-signature-256'])){response(res,401,{error:'Signature rejected'});return;}
      for(const m of whatsappMessages(JSON.parse(raw),this.config.phoneNumberId)){const result=await receive(m);if(result.busy){response(res,503,{error:'Queue full'});return;}}
      response(res,200,{ok:true});
    }catch(e){log('whatsapp.request_rejected',{});if(!res.headersSent)response(res,400,{error:'Invalid request'});}});
    this.server.requestTimeout=15000;this.server.headersTimeout=10000;
    await new Promise((resolve,reject)=>{this.server.once('error',reject);this.server.listen(this.config.port??8788,'127.0.0.1',resolve);});
  }
  async send(m,text){for(const part of chunks(text,1800))await jsonRequest(`https://graph.facebook.com/${this.config.graphVersion}/${this.config.phoneNumberId}/messages`,{fetchImpl:this.fetch,method:'POST',headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',recipient_type:'individual',to:m.chatId,type:'text',text:{preview_url:false,body:part}})});}
  async close(){if(this.server)await new Promise(r=>this.server.close(r));}
}
