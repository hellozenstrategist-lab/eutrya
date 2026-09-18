import path from 'node:path';
import { jsonRequest,safeServiceUrl,chunks,sleep } from '../http.mjs';
import { LocalState } from '../local-state.mjs';
import { insist,digest } from '../util.mjs';

export function telegramMessage(update,botName=''){
  const m=update.message;if(!m?.from)return null;let text=m.text??m.caption??'';
  const command=text.match(/^\/([a-z_]+)@([a-zA-Z0-9_]+)/);
  if(command&&botName&&command[2].toLowerCase()!==botName.toLowerCase())return null;
  if(command)text=text.replace(command[0],'/'+command[1]);
  const mentioned=Boolean(command&&botName||botName&&text.toLowerCase().includes('@'+botName.toLowerCase()));
  if(botName)text=text.replace(new RegExp('^@'+botName+'\\s*','i'),'');
  return {platform:'telegram',id:String(update.update_id),userId:String(m.from.id),chatId:String(m.chat.id),threadId:m.message_thread_id?String(m.message_thread_id):'',text,
    direct:m.chat.type==='private',mentioned,isBot:m.from.is_bot===true,unsupported:!text};
}
export class TelegramAdapter {
  constructor(config,{fetchImpl=fetch,env=process.env}={}){this.config=config;this.fetch=fetchImpl;this.token=env.TELEGRAM_BOT_TOKEN;this.name='telegram';}
  api(method,body,signal){insist(this.token,'TELEGRAM_BOT_TOKEN is missing');return jsonRequest(`https://api.telegram.org/bot${this.token}/${method}`,{fetchImpl:this.fetch,signal,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>{insist(r.ok===true,'Telegram rejected request');return r.result;});}
  async start({receive,log,signal,stateRoot}){
    const me=await this.api('getMe',{},signal);this.botName=me.username;
    const hook=await this.api('getWebhookInfo',{},signal);insist(!hook.url,'This Telegram bot already has a webhook; remove it explicitly before using polling');
    const cursor=new LocalState(path.join(stateRoot,'telegram-cursor.json'),{offset:null});
    if(cursor.read().offset===null){const old=await this.api('getUpdates',{offset:-1,limit:1,timeout:0},signal);cursor.transaction(s=>{s.offset=(old.at(-1)?.update_id??-1)+1;});}
    this.task=(async()=>{let failures=0;while(!signal.aborted){try{
      const rows=await this.api('getUpdates',{offset:cursor.read().offset,timeout:25,allowed_updates:['message']},signal);
      for(const u of rows){const m=telegramMessage(u,this.botName);if(m)await receive(m);cursor.transaction(s=>{s.offset=u.update_id+1;});}failures=0;
    }catch(e){if(signal.aborted)break;log('telegram.disconnected',{status:e.statusCode??null});await sleep(Math.min(30000,1000*2**Math.min(++failures,5)),signal).catch(()=>{});}}})();
  }
  async send(m,text){for(const part of chunks(text,1800))await this.api('sendMessage',{chat_id:m.chatId,text:part,...(m.threadId?{message_thread_id:Number(m.threadId)}:{}),link_preview_options:{is_disabled:true}});}
  async close(){await this.task;}
}
export function discordMessage(m,botId=''){
  if(!m.author)return null;
  const thread=m.channel?.isThread?.();let text=m.content??'';
  const mentioned=Boolean(botId&&(m.mentions?.users?.has(botId)||text.includes(`<@${botId}>`)||text.includes(`<@!${botId}>`)));
  if(botId)text=text.replace(new RegExp('^<@!?'+botId+'>\\s*'),'');
  return {platform:'discord',id:m.id,userId:m.author.id,chatId:thread?m.channel.parentId:m.channelId,threadId:thread?m.channelId:'',text,
    direct:m.channel?.isDMBased?.()===true,mentioned,isBot:m.author.bot===true||Boolean(m.webhookId)||m.system===true,unsupported:!text};
}
export class DiscordAdapter {
  constructor(config,{env=process.env,client=null,sdk=null}={}){this.config=config;this.token=env.DISCORD_BOT_TOKEN;this.client=client;this.sdk=sdk;this.name='discord';}
  async start({receive,log}){
    insist(this.token,'DISCORD_BOT_TOKEN is missing');
    const sdk=this.sdk??await import('discord.js').catch(()=>{throw new Error('Install optional dependency discord.js (npm install)');});
    this.client??=new sdk.Client({intents:[sdk.GatewayIntentBits.Guilds,sdk.GatewayIntentBits.GuildMessages,sdk.GatewayIntentBits.DirectMessages,sdk.GatewayIntentBits.MessageContent],partials:[sdk.Partials.Channel],allowedMentions:{parse:[]}});
    this.client.on('error',()=>log('discord.error',{}));
    this.client.on('shardDisconnect',()=>log('discord.disconnected',{}));
    this.client.on('messageCreate',m=>{const event=discordMessage(m,this.client.user?.id);if(event)Promise.resolve(receive(event)).catch(()=>log('discord.receive_failed',{}));});
    await this.client.login(this.token);
  }
  async send(m,text){const channel=await this.client.channels.fetch(m.threadId||m.chatId);insist(channel?.isTextBased?.(),'Discord destination is not text-based');for(const part of chunks(text,900))await channel.send({content:part,allowedMentions:{parse:[],repliedUser:false},flags:4});}
  async close(){await this.client?.destroy();}
}
export function slackMessage(event,body={},botId=''){
  if(!['message','app_mention'].includes(event.type)||!event.user||event.subtype)return null;
  let text=event.text??'';const mentioned=Boolean(botId&&text.includes(`<@${botId}>`));if(botId)text=text.replace(new RegExp('^<@'+botId+'>\\s*'),'');
  return {platform:'slack',id:`${event.channel}:${event.ts}`,userId:event.user,chatId:event.channel,threadId:event.thread_ts??'',text,
    direct:event.channel_type==='im'||event.channel?.startsWith('D'),mentioned,isBot:Boolean(event.bot_id)||event.user===botId,unsupported:!text};
}
export class SlackAdapter {
  constructor(config,{env=process.env,fetchImpl=fetch,client=null}={}){this.config=config;this.botToken=env.SLACK_BOT_TOKEN;this.appToken=env.SLACK_APP_TOKEN;this.fetch=fetchImpl;this.client=client;this.name='slack';}
  async api(method,body){const r=await jsonRequest('https://slack.com/api/'+method,{fetchImpl:this.fetch,method:'POST',headers:{Authorization:`Bearer ${this.botToken}`,'Content-Type':'application/json'},body:JSON.stringify(body)});insist(r.ok===true,'Slack rejected request');return r;}
  async start({receive,log}){
    insist(this.botToken&&this.appToken,'Set SLACK_BOT_TOKEN and SLACK_APP_TOKEN');const me=await this.api('auth.test',{});this.botId=me.user_id;
    if(!this.client){const {SocketModeClient}=await import('@slack/socket-mode').catch(()=>{throw new Error('Install optional dependency @slack/socket-mode (npm install)');});
      // Avoid SDK logs inadvertently including credentials or message contents.
      const noop=()=>{};this.client=new SocketModeClient({appToken:this.appToken,logger:{debug:noop,info:noop,warn:noop,error:()=>log('slack.socket_error',{}),getLevel:()=> 'error',setLevel:noop,setName:noop}});}
    const listener=async({event,body,ack})=>{try{const m=slackMessage(event,body,this.botId);if(m)await receive(m);await ack();}catch{log('slack.receive_failed',{});}};
    this.client.on('message',listener);this.client.on('app_mention',listener);this.client.on('error',()=>log('slack.error',{}));await this.client.start();
  }
  async send(m,text){for(const part of chunks(text,2500))await this.api('chat.postMessage',{channel:m.chatId,...(m.threadId?{thread_ts:m.threadId}:{}),text:part,mrkdwn:false,parse:'none',unfurl_links:false,unfurl_media:false,blocks:[{type:'section',text:{type:'plain_text',text:part}}]});}
  async close(){await this.client?.disconnect();}
}
export function matrixMessage(event,roomId,userId){
  if(event.type!=='m.room.message'||event.content?.msgtype!=='m.text'||event.content?.['m.relates_to']?.rel_type==='m.replace')return null;
  const c=event.content;return {platform:'matrix',id:event.event_id,userId:event.sender,chatId:roomId,threadId:c['m.relates_to']?.rel_type==='m.thread'?c['m.relates_to'].event_id:'',text:c.body??'',direct:false,
    mentioned:c['m.mentions']?.user_ids?.includes(userId)||c.body?.includes(userId),isBot:event.sender===userId};
}
export class MatrixAdapter {
  constructor(config,{env=process.env,fetchImpl=fetch}={}){this.config=config;this.fetch=fetchImpl;this.token=env.MATRIX_ACCESS_TOKEN;this.base=safeServiceUrl(config.homeserver,{local:true});this.name='matrix';}
  api(endpoint,init={}){return jsonRequest(this.base+'/_matrix/client/v3'+endpoint,{fetchImpl:this.fetch,headers:{Authorization:`Bearer ${this.token}`,'Content-Type':'application/json'},...init});}
  async start({receive,log,signal,stateRoot}){
    insist(this.token,'MATRIX_ACCESS_TOKEN is missing');const me=await this.api('/account/whoami',{signal});this.userId=me.user_id;
    this.cursor=new LocalState(path.join(stateRoot,'matrix-cursor.json'),{since:null,encrypted:[]});
    this.task=(async()=>{while(!signal.aborted){try{
      const old=this.cursor.read(),params=new URLSearchParams({timeout:old.since?'25000':'0',filter:JSON.stringify({room:{timeline:{limit:old.since?50:0}}})});if(old.since)params.set('since',old.since);
      const data=await this.api('/sync?'+params,{signal,maxBytes:3000000});
      const encrypted=new Set(old.encrypted);
      for(const [room,v] of Object.entries(data.rooms?.join??{})){
        const events=[...(v.state?.events??[]),...(v.timeline?.events??[])];
        if(events.some(e=>['m.room.encryption','m.room.encrypted'].includes(e.type)))encrypted.add(room);
        if(old.since&&!encrypted.has(room))for(const e of v.timeline?.events??[]){const m=matrixMessage(e,room,this.userId);if(m)await receive(m);}
      }
      insist(typeof data.next_batch==='string','Matrix omitted sync cursor');this.cursor.transaction(s=>{s.since=data.next_batch;s.encrypted=[...encrypted];});
    }catch(e){if(signal.aborted)break;log('matrix.disconnected',{status:e.statusCode??null});await sleep(3000,signal).catch(()=>{});}}})();
  }
  async send(m,text){
    insist(!this.cursor?.read().encrypted.includes(m.chatId),'Encrypted Matrix rooms are unsupported; refusing plaintext delivery');
    try {await this.api(`/rooms/${encodeURIComponent(m.chatId)}/state/m.room.encryption`);throw new Error('Encrypted Matrix rooms are unsupported; refusing plaintext delivery');}
    catch(e){if(e.statusCode!==404)throw e;}
    for(const [i,part]of chunks(text,3000).entries())await this.api(`/rooms/${encodeURIComponent(m.chatId)}/send/m.room.message/${encodeURIComponent(m.deliveryId+'-'+i)}`,{method:'PUT',body:JSON.stringify({msgtype:'m.text',body:part,...(m.threadId?{'m.relates_to':{rel_type:'m.thread',event_id:m.threadId}}:{})})});
  }
  async close(){await this.task;}
}
export function signalMessage(row){
  const e=row.envelope??row,d=e.dataMessage;if(!d?.message||d.groupInfo)return null;const sender=e.sourceNumber??e.source;
  return {platform:'signal',id:`${sender}:${d.timestamp??e.timestamp}`,userId:sender,chatId:sender,threadId:'',text:d.message,direct:true,isBot:false};
}
export class SignalAdapter {
  constructor(config,{env=process.env,fetchImpl=fetch}={}){this.config=config;this.fetch=fetchImpl;this.base=safeServiceUrl(config.baseUrl,{local:true});this.token=env.SIGNAL_API_TOKEN;this.name='signal';}
  api(endpoint,init={}){return jsonRequest(this.base+endpoint,{fetchImpl:this.fetch,headers:{'Content-Type':'application/json',...(this.token?{Authorization:`Bearer ${this.token}`}:{})},...init});}
  async start({receive,log,signal}){
    insist(/^\+[0-9]{7,16}$/.test(this.config.number??''),'Set signal.number to the linked account in E.164 format');
    this.task=(async()=>{while(!signal.aborted){try{const rows=await this.api('/v1/receive/'+encodeURIComponent(this.config.number)+'?timeout=10',{signal});insist(Array.isArray(rows),'Signal adapter requires signal-cli-rest-api normal/native polling mode');for(const row of rows){const m=signalMessage(row);if(m)await receive(m);}}catch(e){if(signal.aborted)break;log('signal.disconnected',{status:e.statusCode??null});}await sleep(2000,signal).catch(()=>{});}})();
  }
  async send(m,text){for(const part of chunks(text,3000))await this.api('/v2/send',{method:'POST',body:JSON.stringify({number:this.config.number,recipients:[m.chatId],message:part})});}
  async close(){await this.task;}
}
export const NativeAdapters={telegram:TelegramAdapter,discord:DiscordAdapter,slack:SlackAdapter,matrix:MatrixAdapter,signal:SignalAdapter};
