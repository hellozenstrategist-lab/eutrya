import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { Writable } from 'node:stream';
import { DEFAULTS,validateConfig } from './config.mjs';
import { profileConfigPath,saveSecret } from './environment.mjs';
import { atomicJson,readJson,LocalState } from './local-state.mjs';
import { Knowledge } from './knowledge.mjs';
import { providerSettings,textModelReady } from './providers/gateway.mjs';
import { gatewayDefaults,loadGateway,validateGateway,PLATFORMS } from './gateway/config.mjs';
import { startGateway } from './gateway/service.mjs';
import { Jobs,startScheduler,runJob,runTeam } from './scheduler.mjs';
import { McpTools } from './mcp.mjs';
import { Store,listSessions } from './store.mjs';
import { insist,redactor,clip } from './util.mjs';

export const MANAGEMENT=new Set(['setup','providers','profiles','gateway','memory','skills','jobs','team','mcp','export','usage']);
export function userPaths(configFile){return {env:path.join(path.dirname(configFile),'.env'),gateway:path.join(path.dirname(configFile),'gateway.json'),mcp:path.join(path.dirname(configFile),'mcp.json')};}
export async function promptValue(label,{secret=false,fallback=''}={}){
  insist(process.stdin.isTTY,'Interactive setup needs a terminal; use flags for non-interactive setup');
  let muted=false;const output=new Writable({write(chunk,encoding,done){if(!muted)process.stdout.write(chunk,encoding);done();}});
  const rl=readline.createInterface({input:process.stdin,output,terminal:true});
  process.stdout.write(label+(fallback?' ['+fallback+']':'')+': ');
  try{muted=secret;const value=await rl.question('');if(secret)process.stdout.write('\n');return value.trim()||fallback;}finally{rl.close();}
}
async function storeCredentials(keys,file,print){
  for(const key of keys){if(process.env[key]){print(`${key}: already provided by the environment`);continue;}
    const value=await promptValue(`${key} (hidden; blank skips)`,{secret:true});if(value){saveSecret(file,key,value);process.env[key]=value;print(`${key}: saved in the private profile environment file`);}}
}
export async function setup({config,configFile,values,print}){
  insist(!fs.existsSync(configFile),`Config already exists: ${configFile}. Edit it explicitly or choose --profile NAME; setup never overwrites it.`);
  let provider=values.provider??config.mainProvider,model=values.model??config.mainModel;
  if(process.stdin.isTTY){provider=await promptValue('Main model provider (vercel/chatgpt/openrouter/compatible/ollama)',{fallback:provider});model=await promptValue('Exact text-model ID (use eutrya models --provider NAME to discover)',{fallback:model});}
  insist(['vercel','chatgpt','openrouter','compatible','ollama'].includes(provider),'Unsupported text provider');
  insist(model&&!model.startsWith('typesafe-ai/'),'Set --model to a text-model ID, not Jev');
  if(['vercel','openrouter'].includes(provider))insist(model.includes('/'),'Use provider/model as printed by the model catalog');
  let base=values['base-url']??config.mainBaseUrl;
  if(provider==='compatible'&&!base&&process.stdin.isTTY)base=await promptValue('OpenAI-compatible API base URL (including /v1)');
  const c=validateConfig({...config,mainProvider:provider,mainModel:model,mainBaseUrl:base});providerSettings(c);
  atomicJson(configFile,c);print(`Created ${configFile}`);
  if(process.stdin.isTTY){const keys=['AI_GATEWAY_API_KEY'];const key=providerSettings(c).keyEnv;if(key&&!keys.includes(key))keys.push(key);await storeCredentials(keys,userPaths(configFile).env,print);}
  print(`Main AI: ${provider} / ${model}\nJev: Vercel evaluation API / ${c.jevModel}\nRun eutrya doctor, then eutrya doctor --live to make one paid evaluator check.`);
}
const TOKEN_KEYS={telegram:['TELEGRAM_BOT_TOKEN'],discord:['DISCORD_BOT_TOKEN'],slack:['SLACK_APP_TOKEN','SLACK_BOT_TOKEN'],matrix:['MATRIX_ACCESS_TOKEN'],signal:['SIGNAL_API_TOKEN'],whatsapp:['WHATSAPP_ACCESS_TOKEN','WHATSAPP_APP_SECRET','WHATSAPP_VERIFY_TOKEN'],webhook:['EUTRYA_WEBHOOK_SECRET']};
const ADAPTER_FIELDS={matrix:{homeserver:'https://matrix.example.org'},signal:{baseUrl:'http://127.0.0.1:8080',number:'+15555550123'},whatsapp:{port:8788,phoneNumberId:'REPLACE_WITH_PHONE_NUMBER_ID',graphVersion:'SET_SUPPORTED_GRAPH_VERSION'},webhook:{port:8787}};
async function gatewaySetup(ctx,file){
  const {config,values,print}=ctx;let platform=values.platform??'';let users=values.user??'';
  if(process.stdin.isTTY){platform=await promptValue('Messaging platform ('+PLATFORMS.join('/')+')',{fallback:platform||'telegram'});users=await promptValue('Allowed sender IDs (comma-separated; no wildcard)',{fallback:users});}
  insist(PLATFORMS.includes(platform),'Use --platform '+PLATFORMS.join('|'));insist(users,'Set --user to explicit sender IDs; public access is not enabled');
  const g=fs.existsSync(file)?loadGateway(file,config.dataRoot):gatewayDefaults(config.dataRoot);
  g.platforms[platform]={...g.platforms[platform],...ADAPTER_FIELDS[platform],enabled:true,allowedUsers:users.split(',').map(x=>x.trim()).filter(Boolean),allowedChats:(values.chats??'').split(',').map(x=>x.trim()).filter(Boolean)};
  for(const [flag,key]of [['homeserver','homeserver'],['bridge-url','baseUrl'],['number','number'],['phone-id','phoneNumberId'],['graph-version','graphVersion']])if(values[flag])g.platforms[platform][key]=values[flag];
  if(values.port)g.platforms[platform].port=Number(values.port);
  if(values['allow-exec'])g.allowExec=true;
  validateGateway(g);atomicJson(file,g);print(`Saved ${file}. Review adapter-specific values before starting.`);
  if(process.stdin.isTTY)await storeCredentials(TOKEN_KEYS[platform],userPaths(ctx.configFile).env,print);
  print('Only listed senders are accepted. Each sender/chat/thread gets isolated state. Remote writes and commands require individual approval.');
}
async function untilStopped(fn){const c=new AbortController(),stop=()=>c.abort();process.on('SIGINT',stop);process.on('SIGTERM',stop);try{return await fn(c.signal);}finally{process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}}
export async function management(ctx){
  const {command,positionals:args,values,config,configFile,cwd,print}=ctx;const sub=args[1]??'list',paths=userPaths(configFile);
  let knowledgeNamespace='local';
  if(values.route&&['memory','skills'].includes(command)){const gf=values['gateway-config']??paths.gateway,g=loadGateway(gf,config.dataRoot);insist(readJson(path.join(g.stateRoot,'router.json'),{routes:{}}).routes[values.route],'Unknown gateway route');knowledgeNamespace='gateway:'+values.route;}
  const knowledge=new Knowledge(config.dataRoot,knowledgeNamespace);
  const dump=x=>print(JSON.stringify(x,null,2)),gatewayFile=values['gateway-config']??paths.gateway;
  switch(command){
    case 'setup':await setup(ctx);return;
    case 'providers':dump({text:['vercel','chatgpt','openrouter','compatible','ollama'],evaluator:{provider:'vercel',model:config.jevModel,required:true},current:config.mainProvider,subscriptionAuthentication:{chatgpt:'Codex OAuth via codex login'},nousServices:false});return;
    case 'profiles':{
      const root=path.dirname(profileConfigPath());
      if(sub==='list'){print('default  '+profileConfigPath());const folder=path.join(root,'profiles');if(fs.existsSync(folder))for(const n of fs.readdirSync(folder))if(fs.existsSync(path.join(folder,n,'config.json')))print(n+'  '+profileConfigPath(n));return;}
      insist(sub==='create'&&args[2],'Use profiles create NAME --provider NAME --model ID');const file=profileConfigPath(args[2]);
      const c={...DEFAULTS,mainProvider:values.provider??config.mainProvider,dataRoot:path.join(DEFAULTS.dataRoot,'profiles',args[2]),sessionRoot:path.join(DEFAULTS.sessionRoot,'profiles',args[2])};await setup({...ctx,config:c,configFile:file});return;
    }
    case 'gateway':{
      if(sub==='setup'){await gatewaySetup(ctx,gatewayFile);return;}
      if(sub==='template'){insist(!fs.existsSync(gatewayFile),'Gateway file already exists');atomicJson(gatewayFile,gatewayDefaults(config.dataRoot));print('Created disabled gateway template: '+gatewayFile);return;}
      const g=loadGateway(gatewayFile,config.dataRoot);
      if(sub==='start'){insist(!values.mcp,'MCP is available only in explicitly approved local CLI sessions in this release');await untilStopped(signal=>startGateway(g,config,{demo:Boolean(values.demo),signal,log:dump}));return;}
      if(sub==='status'){const status=readJson(path.join(g.stateRoot,'status.json'),null);dump({record:status,heartbeatAgeSeconds:status?.heartbeat?Math.floor((Date.now()-Date.parse(status.heartbeat))/1000):null,note:'A saved status/heartbeat is not proof a provider is reachable.'});return;}
      if(sub==='routes'){dump(readJson(path.join(g.stateRoot,'router.json'),{routes:{}}).routes);return;}
      if(sub==='outbox'){dump(readJson(path.join(g.stateRoot,'scheduled-outbox.json'),{messages:[]}));return;}
      throw new Error('Use gateway setup|template|start|status|routes|outbox');
    }
    case 'memory':if(sub==='path'){print(knowledge.root);return;}if(sub==='add'){dump(knowledge.remember(args.slice(2).join(' '),{approved:true}));return;}if(sub==='forget'){dump({removed:knowledge.forget(args[2])});return;}insist(sub==='list'||sub==='search','Use memory path|list|search QUERY|add TEXT|forget ID');dump(knowledge.memories(args.slice(2).join(' ')));return;
    case 'skills':{
      if(sub==='path'){print(knowledge.root);return;}
      if(sub==='list'){dump(knowledge.listSkills());return;}
      if(sub==='show'){print(knowledge.readSkill(args[2]).content);return;}
      if(sub==='install'){insist(args[2]&&args[3],'Use skills install NAME PATH_TO_SKILL.md');dump(knowledge.importSkill(args[2],path.resolve(args[3])));return;}
      if(sub==='approve'){dump(knowledge.approveSkill(args[2]));return;}
      if(sub==='drafts'){const root=path.join(knowledge.root,'drafts');dump(fs.existsSync(root)?fs.readdirSync(root):[]);return;}
      throw new Error('Use skills path|list|show NAME|install NAME FILE|drafts|approve NAME');
    }
    case 'jobs':{
      const jobs=new Jobs(path.join(config.dataRoot,'scheduler'));
      if(sub==='list'){dump(jobs.list());return;}
      if(sub==='add'){
        let delivery=null;if(values.route){const g=loadGateway(gatewayFile,config.dataRoot),r=readJson(path.join(g.stateRoot,'router.json'),{routes:{}}).routes[values.route];insist(r,'Unknown gateway route; use gateway routes');delivery={route:values.route,stateRoot:g.stateRoot};}
        dump(jobs.add({task:values.task??args.slice(2).join(' '),workspace:cwd,cron:values.cron??null,at:values.at??null,timezone:values.timezone??'UTC',name:values.name??'Scheduled task',allowWrite:Boolean(values['allow-write']),maxCalls:Math.min(config.maxCalls,60),maxSteps:Math.min(config.maxSteps,12),delivery}));return;
      }
      if(sub==='enable'||sub==='disable'){jobs.set(args[2],sub==='enable'?'enabled':'disabled');print('Job updated');return;}
      if(sub==='remove'){jobs.remove(args[2]);print('Job removed');return;}
      if(sub==='start'){await untilStopped(signal=>startScheduler(jobs,config,{demo:Boolean(values.demo),signal,log:dump}));return;}
      // Explicit manual run still uses the same Jev loop; it does not alter its schedule.
      if(sub==='run'){const job=jobs.list().find(j=>j.id===args[2]);insist(job,'Job not found');insist(!['running','needs_review'].includes(job.status),'Inspect/reconcile the previous run first');const {requireProviders}=await import('./bootstrap.mjs');if(!values.demo)requireProviders(config);dump(await untilStopped(signal=>runJob(job,config,{demo:Boolean(values.demo),signal})));return;}
      throw new Error('Use jobs add|list|enable|disable|remove|run|start');
    }
    case 'team':{insist(sub==='run'&&args[2],'Use team run TASKS.json [--parallel 2]');const tasks=readJson(path.resolve(args[2]));dump(await untilStopped(signal=>runTeam(tasks,config,{parallel:Number(values.parallel??2),demo:Boolean(values.demo),signal})));return;}
    case 'mcp':{
      if(sub==='init'){insist(!fs.existsSync(paths.mcp),'MCP config exists');atomicJson(paths.mcp,{servers:{example:{enabled:false,trusted:false,transport:'stdio',command:'REPLACE_WITH_SERVER_EXECUTABLE',args:[],allowedTools:[],passEnv:[]}}});print('Created '+paths.mcp+'. Review the server executable, then set trusted/enabled and exact allowedTools.');return;}
      const spec=readJson(paths.mcp,{servers:{}});
      if(sub==='list'||!values.live){dump(spec);print('No external server was started. Use mcp check --live after reviewing the config.');return;}
      insist(sub==='check','Use mcp init|list|check --live');const tools=new McpTools(spec.servers);try{await tools.connect();dump(tools.catalog());}finally{await tools.close();}return;
    }
    case 'export':{
      let id=args[1];if(id==='latest')id=listSessions(config.sessionRoot,cwd)[0]?.id;insist(id,'Use export SESSION_ID --output FILE.json');insist(values.output,'Choose --output FILE.json (contains task and observation text)');
      const store=new Store(config.sessionRoot,cwd,{id,existing:true});try{const out=path.resolve(values.output);insist(!fs.existsSync(out),'Export destination already exists');atomicJson(out,redactor()({version:1,state:store.state,events:store.readEvents()}));print('Exported '+out);}finally{store.close();}return;
    }
    case 'usage':{
      const rows=listSessions(config.sessionRoot,cwd);const sum={sessions:rows.length,providerAttempts:0,reportedCostUsd:0,unpricedAttempts:0,unavailableSessions:0};
      for(const row of rows){let store;try{store=new Store(config.sessionRoot,cwd,{id:row.id,existing:true});sum.providerAttempts+=store.state.meter.calls;sum.reportedCostUsd+=store.state.meter.knownCostUsd;sum.unpricedAttempts+=store.state.meter.unpricedCalls;}catch{sum.unavailableSessions++;}finally{store?.close();}}
      dump(sum);print('Known reported costs only; locked/unreadable sessions are excluded, not zero-cost. This workspace only.');return;
    }
  }
}
