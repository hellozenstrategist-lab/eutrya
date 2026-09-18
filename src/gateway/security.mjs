import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { digest, insist } from '../util.mjs';
import { LocalState } from '../local-state.mjs';

export function normalizeMessage(value) {
  const m={id:String(value.id??''),platform:String(value.platform??''),userId:String(value.userId??''),chatId:String(value.chatId??''),threadId:String(value.threadId??''),
    text:value.text??'',direct:value.direct===true,mentioned:value.mentioned===true,isBot:value.isBot===true,unsupported:value.unsupported===true};
  for(const k of ['id','platform','userId','chatId'])insist(m[k].length>0&&m[k].length<=256&&!/[\u0000-\u001f\u007f]/.test(m[k]),`Invalid message ${k}`);
  insist(m.threadId.length<=256&&!/[\u0000-\u001f\u007f]/.test(m.threadId),'Invalid thread ID');
  insist(typeof m.text==='string'&&m.text.length<=8000&&!m.text.includes('\0'),'Message text must be at most 8000 characters');
  return m;
}
export const routeKey=m=>digest([m.platform,m.chatId,m.threadId||'',m.userId]).slice(0,32);
export const eventKey=m=>digest([m.platform,m.id]);
export function authorized(m,c) {
  if(!c?.enabled||m.isBot)return false;
  if(!Array.isArray(c.allowedUsers)||!c.allowedUsers.includes(m.userId))return false;
  if(c.allowedChats?.length&&!c.allowedChats.includes(m.chatId))return false;
  return m.direct||c.requireMention===false||m.mentioned||/^\/(help|whoami|status|usage|last|stop|approve|deny|continue|new|compact|steer|model|resolve|skills|memory)(?:\s|$)/.test(m.text);
}
export function constantEqual(a,b) {
  const x=Buffer.from(String(a??'')),y=Buffer.from(String(b??''));return x.length===y.length&&timingSafeEqual(x,y);
}
export function signature(secret,method,url,timestamp,raw) {
  return createHmac('sha256',secret).update(`${method}\n${url}\n${timestamp}\n`).update(raw).digest('hex');
}
export function verifySignature(secret,method,url,headers,raw,now=Date.now()) {
  if(!secret||secret.length<32)return false;
  const ts=headers['x-eutrya-timestamp'],sig=headers['x-eutrya-signature'];
  if(!/^\d{10}$/.test(String(ts))||Math.abs(now-Number(ts)*1000)>300000)return false;
  return constantEqual(signature(secret,method,url,ts,raw),sig);
}
export class Approvals {
  constructor({ttlMs=120000}={}){this.pending=new Map();this.ttlMs=ttlMs;}
  request(route,action,send,signal) {
    if(signal?.aborted)return Promise.resolve(false);
    const id=randomBytes(12).toString('hex');
    return new Promise(resolve=>{
      const settle=value=>{const p=this.pending.get(id);if(!p)return;clearTimeout(p.timer);signal?.removeEventListener('abort',p.abort);this.pending.delete(id);resolve(value);};
      const abort=()=>settle(false),timer=setTimeout(()=>settle(false),this.ttlMs);
      this.pending.set(id,{route,action,settle,timer,abort});signal?.addEventListener('abort',abort,{once:true});
      Promise.resolve().then(()=>send(`Approval required for ONE action (expires in ${Math.round(this.ttlMs/1000)} seconds):\n${JSON.stringify(action,null,2)}\n\n/approve ${id}\n/deny ${id}\nCommands and external tools are not OS-sandboxed.`)).catch(()=>settle(false));
    });
  }
  answer(route,id,yes){const p=this.pending.get(id);if(!p||p.route!==route)return false;p.settle(yes);return true;}
  cancel(route){for(const p of this.pending.values())if(p.route===route)p.settle(false);}
  close(){for(const p of this.pending.values())p.settle(false);}
}
export class DailyBudget {
  constructor(file,maxCalls){this.db=new LocalState(file,{date:'',calls:0});this.maxCalls=maxCalls;}
  reserve(now=new Date()){
    const date=now.toISOString().slice(0,10);
    this.db.transaction(s=>{if(s.date!==date){s.date=date;s.calls=0;}insist(s.calls<this.maxCalls,'Gateway daily provider-attempt cap reached (UTC day)');s.calls++;});
  }
}
