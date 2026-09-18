import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { insist } from './util.mjs';
import { randomUUID } from 'node:crypto';
export const SECRET_NAMES=Object.freeze([
  'AI_GATEWAY_API_KEY','OPENROUTER_API_KEY','EUTRYA_COMPATIBLE_API_KEY',
  'TELEGRAM_BOT_TOKEN','DISCORD_BOT_TOKEN','SLACK_BOT_TOKEN','SLACK_APP_TOKEN',
  'MATRIX_ACCESS_TOKEN','WHATSAPP_ACCESS_TOKEN','WHATSAPP_APP_SECRET','WHATSAPP_VERIFY_TOKEN',
  'EUTRYA_WEBHOOK_SECRET','SIGNAL_API_TOKEN','BRAVE_API_KEY'
]);
export function parseEnv(text) {
  const result={};
  for(const raw of text.split(/\r?\n/)) {
    const line=raw.trim();if(!line||line.startsWith('#'))continue;
    const match=line.match(/^(?:export\s+)?([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/);insist(match,'Invalid .env syntax (shell execution and interpolation are not supported)');
    let v=match[2].trim();
    if(v.startsWith('"')){try{v=JSON.parse(v);}catch{throw new Error('Double-quoted env values must be valid JSON strings');}}
    else if(v.startsWith("'")){insist(v.endsWith("'"),'Unclosed env quote');v=v.slice(1,-1);}
    else v=v.replace(/\s+#.*$/,'').trim();
    insist(typeof v==='string'&&!/[\r\n\0]/.test(v),'Invalid env value');
    if(SECRET_NAMES.includes(match[1]))result[match[1]]=v;
  }
  return result;
}
export function loadEnvFile(file,{env=process.env,optional=false}={}) {
  if(!fs.existsSync(file)){if(optional)return [];throw new Error(`Environment file not found: ${file}`);}
  const st=fs.lstatSync(file);insist(st.isFile()&&!st.isSymbolicLink()&&st.size<65536,'Use a regular, small .env file');
  const values=parseEnv(fs.readFileSync(file,'utf8'));const loaded=[];
  for(const [k,v] of Object.entries(values))if(!env[k]){env[k]=v;loaded.push(k);}
  return loaded;
}
export function saveSecret(file,key,value) {
  insist(SECRET_NAMES.includes(key),'Unsupported credential name; Nous credentials are not imported');
  insist(typeof value==='string'&&value.length>0&&value.length<8192&&!/[\r\n\0]/.test(value),'Invalid credential');
  const values=fs.existsSync(file)?parseEnv(fs.readFileSync(file,'utf8')):{};values[key]=value;
  fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
  const temp=file+'.'+randomUUID()+'.tmp';
  fs.writeFileSync(temp,Object.entries(values).map(([k,v])=>`${k}=${JSON.stringify(v)}`).join('\n')+'\n',{mode:0o600,flag:'wx'});
  fs.renameSync(temp,file);fs.chmodSync(file,0o600);
}
export function profileConfigPath(name='default') {
  insist(/^[a-zA-Z0-9_-]{1,40}$/.test(name),'Profile name must use letters, digits, underscores or hyphens');
  const base=process.env.EUTRYA_CONFIG_HOME||path.join(os.homedir(),'.config','eutrya');
  return name==='default'?path.join(base,'config.json'):path.join(base,'profiles',name,'config.json');
}
