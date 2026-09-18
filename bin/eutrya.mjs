#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { loadConfig, writeConfig, updateConfig, CONFIG_PATH, DEFAULTS } from '../src/config.mjs';
import { Store, listSessions, workspaceBucket } from '../src/store.mjs';
import { Eutrya } from '../src/runtime.mjs';
import { ResearchRunner } from '../src/research-runtime.mjs';
import { Toolbox } from '../src/tools.mjs';
import { GatewayCortex, availableModels, textModelReady, providerSettings } from '../src/providers/gateway.mjs';
import { GatewayJev } from '../src/providers/jev.mjs';
import { DemoCortex, MockJev } from '../src/providers/mock.mjs';
import { PUZZLE_TASK, makePuzzle } from '../src/puzzle.mjs';
import { Terminal, renderEvent, statusText, swarmStatusText, huntBoardText } from '../src/ui.mjs';
import { NativeSwarm } from '../src/swarm/swarm.mjs';
import { TEMPLATES } from '../src/swarm/profile.mjs';
import { deadline, redactor, safeTerminal, insist, clip, digest } from '../src/util.mjs';

import { loadEnvFile, profileConfigPath } from '../src/environment.mjs';
import { EchoFixtureCortex } from '../src/bootstrap.mjs';
import { Knowledge } from '../src/knowledge.mjs';
import { MANAGEMENT,management,userPaths,setup } from '../src/commands.mjs';
import { readJson } from '../src/local-state.mjs';
import { McpTools } from '../src/mcp.mjs';
import { handleAdaptiveCommand, capturePlainCorrection } from '../extensions/eutrya-adaptive-extension/src/commands.mjs';
import { parseContextBudget, parseAutoCompact } from '../src/interactive-settings.mjs';

const HELP=`EUTRYA 0.4.1 — standalone Jev-native terminal agent & native swarm

Usage:
  eutrya                                  Interactive swarm session (Admin orchestrator)
  eutrya setup --provider openrouter --model provider/model
  eutrya providers                        Show provider routes (no Nous services)
  eutrya profiles list|create NAME         Isolated configuration and memory
  eutrya gateway setup|start|status|routes  Messaging gateways
  eutrya memory list|add TEXT|forget ID    Approved persistent memory
  eutrya skills list|install NAME FILE     Reviewed local SKILL.md references
  eutrya mcp init|list|check --live         Explicitly trusted external tool servers
  eutrya jobs add|list|start                Timezone-aware local scheduler
  eutrya team run TASKS.json --parallel 2  Bounded, read-only parallel tasks
  eutrya usage                            This workspace's reported usage
  eutrya export latest --output FILE.json  Export an idle session and decision trace
  eutrya run "your task"                   One task, then exit
  eutrya research "objective"              Strategist + Jev local code-research lane
  eutrya swarm [status|agents|tasks]       Inspect the native swarm
  eutrya hunts                             List persistent hunt boards
  eutrya agents                           List swarm agent profiles
  eutrya tasks                            List shared workspace tasks
  eutrya demo [--seed 7]                   Offline switchboard wiring demo; NO real models
  eutrya puzzle --live                     Same puzzle with real Vercel models
  eutrya init --model provider/model       Create the user config (no credentials saved)
  eutrya models [filter]                   List current Gateway model IDs
  eutrya doctor [--live]                   Local checks; --live makes ONE paid Jev check
  eutrya sessions                         List this workspace's sessions
  eutrya trace SESSION_ID                  Verify and print a saved trace
  eutrya bench [--live] [--seeds 1,2,3]     Puzzle runs; offline fixtures unless --live

Options:
  --provider NAME         vercel | chatgpt | openrouter | compatible | ollama
  --profile NAME          Isolate config, memory, jobs and session storage
  --env-file FILE         Explicitly load supported keys (never shell-evaluate)
  --base-url URL          Compatible text endpoint base, including /v1
  --key-env NAME          Credential environment variable for compatible provider
  --no-json-mode          Omit response_format when a compatible server lacks it
  --mcp                   Load trusted servers in the profile's mcp.json
  --gateway-config FILE   Alternate messaging configuration
  --platform NAME --user IDS  Gateway setup; explicit comma-separated sender IDs
  --task TEXT --cron EXPR --timezone ZONE  Job creation (or --at ISO_WITH_OFFSET)
  --route ROUTE_ID        Deliver a scheduled result to an existing gateway route
  --cwd PATH              Workspace (default: current directory)
  --model provider/model  Text model; never set this to Jev
  --jev-model ID          Evaluation model (default: typesafe-ai/jev)
  --resume ID|latest      Resume a session in this workspace
  --config FILE          User config (default: ~/.config/eutrya/config.json)
  --session-root PATH    Local session storage (outside model tools)
  --max-steps N          Maximum steps per burst (default: 24)
  --max-calls N          Hard total provider-attempt cap per session (default: 150)
  --allow-write          Approve workspace writes/edits for this invocation
  --allow-exec           Offer local process tool; EVERY process still needs approval
  --no-compaction       Disable Jev auto-compaction and use the legacy bounded window
  --thinking             Show candidate thinking/summary in terminal (default: hidden)
  --no-thinking          Hide candidate thinking/summary in terminal
  --demo                  Explicitly use offline fixtures
  --json                  JSONL events; no terminal formatting
  --help

Jev always needs AI_GATEWAY_API_KEY and AI SDK 7 with experimental_evaluate.
OpenRouter text models additionally need OPENROUTER_API_KEY. No Nous login is used.
Chat commands: /help /status /trace /compact /continue /stop /steer TEXT
               /resolve NOTE /model ID /new /memory /skills /usage /swarm /agents
               /agent NAME /tasks /findings /hunt [ID|run ID|pause ID|resume ID] /template [NAME]
               /context [N|64k] /autocompact [on|off] /thinking [on|off] /reload /quit
`;

const CHAT_HELP=`Enter a task for Admin, or use @AgentName to speak directly to a specialist.
@AgentName TEXT         Direct task to a specific specialist agent (e.g. @Auditor, @Sentinel)
/swarm                  Display live swarm organization status and tasks
/agents                 List all swarm agents, specializations, and models
/agent NAME             Switch direct interactive focus to an agent
/tasks                  List shared workspace tasks and backlog
/findings               List shared organizational findings
/hunt [ID]              Show the current or selected Kanban hunt board
/hunt run [ID]          Let Jev route and run ready/review cards across idle agents
/hunt pause ID          Pause a hunt board
/hunt resume ID         Resume a paused hunt board
/template [NAME]        View or switch swarm template (default, engineering, startup, legal, research)
/feedback TEXT          Provide persistent behavioral guidance and style corrections
/adaptive [status|freeze|thaw]  Inspect or control experience-based policy adaptation
/status                 Show attention, session, request and usage counters
/trace                  Show recent mode and candidate-selection records
/compact                Run Jev relevance pruning; originals remain recallable
/context [N|64k]        Show or set maxPromptChars (4k..200k serialized characters)
/autocompact [on|off]   Show or toggle automatic Jev compaction
/continue               Continue a paused task with a fresh Jev decision cycle
/stop                   Cancel an in-flight model call or local process
/steer TEXT             Queue guidance; discard obsolete plans before execution
/resolve NOTE           Reconcile a pending effect AFTER inspecting the workspace
/model [provider/model] Show or change the text model for this session
/new                    Start a fresh session, retaining approved local memory
/memory                 Show approved persistent memory
/remember TEXT          Explicitly save a memory (operator command)
/skills                 Show installed local skills
/usage                  Report this session's usage
/thinking [on|off]      Toggle display of candidate thinking/summary (currently hidden)
/reload                 Save session and restart the harness with updated code
/quit                   Stop and exit; the session remains saved`;

const {values,positionals}=parseArgs({allowPositionals:true,options:{
  cwd:{type:'string'},model:{type:'string'},'jev-model':{type:'string'},resume:{type:'string'},
  config:{type:'string'},'session-root':{type:'string'},'max-steps':{type:'string'},'max-calls':{type:'string'},
  'allow-write':{type:'boolean'},'allow-exec':{type:'boolean'},demo:{type:'boolean'},live:{type:'boolean'},
  seed:{type:'string'},seeds:{type:'string'},json:{type:'boolean'},help:{type:'boolean'},
  provider:{type:'string'},profile:{type:'string'},'env-file':{type:'string'},'base-url':{type:'string'},'key-env':{type:'string'},
  'no-json-mode':{type:'boolean'},mcp:{type:'boolean'},'gateway-config':{type:'string'},
  platform:{type:'string'},user:{type:'string'},chats:{type:'string'},port:{type:'string'},homeserver:{type:'string'},
  'bridge-url':{type:'string'},number:{type:'string'},'phone-id':{type:'string'},'graph-version':{type:'string'},
  task:{type:'string'},cron:{type:'string'},at:{type:'string'},timezone:{type:'string'},name:{type:'string'},route:{type:'string'},
  parallel:{type:'string'},output:{type:'string'},'data-root':{type:'string'},
  thinking:{type:'boolean'},'no-thinking':{type:'boolean'},'no-compaction':{type:'boolean'}
}});
const profile=values.profile??'default';
const configFile=values.config??profileConfigPath(profile);
loadEnvFile(userPaths(configFile).env,{optional:true});
loadEnvFile(path.join(path.dirname(configFile),'env'),{optional:true});
if(values['env-file'])loadEnvFile(path.resolve(values['env-file']));
const redact=redactor();
const print=s=>console.log(safeTerminal(redactor()(String(s))));
let showThinking=Boolean(values.thinking && !values['no-thinking']);
const overrides={};
if(profile!=='default'&&!fs.existsSync(configFile)){
  overrides.dataRoot=path.join(DEFAULTS.dataRoot,'profiles',profile);
  overrides.sessionRoot=path.join(DEFAULTS.sessionRoot,'profiles',profile);
}
for(const [flag,key]of [['provider','mainProvider'],['base-url','mainBaseUrl'],['key-env','mainKeyEnv'],['data-root','dataRoot']])if(values[flag])overrides[key]=values[flag];
if(values['no-json-mode'])overrides.jsonMode=false;
for(const [flag,key] of [['model','mainModel'],['jev-model','jevModel'],['session-root','sessionRoot']])if(values[flag])overrides[key]=values[flag];
for(const [flag,key] of [['max-steps','maxSteps'],['max-calls','maxCalls']])if(values[flag])overrides[key]=Number(values[flag]);
if(values['allow-write'])overrides.autoWrite=true;
if(values['allow-exec'])overrides.allowExec=true;
if(values['no-compaction'])overrides.jevCompaction=false;
const config=loadConfig(configFile,overrides);
const cwd=fs.realpathSync(values.cwd??process.cwd());
const command=positionals[0]??'chat';

function emit(row) {if(values.json)console.log(JSON.stringify(row));else renderEvent(row,print,{showThinking});}
function engine(store,{demo=false,approve=async()=>false,quiet=false,mcp=null}={}) {
  const cortex=demo?(store.state.environment?new DemoCortex():new EchoFixtureCortex()):new GatewayCortex(config);
  const jev=demo?new MockJev():new GatewayJev(config);
  const knowledge=demo?null:new Knowledge(config.dataRoot);
  const toolbox=new Toolbox({workspace:store.workspace,store,config,approve,redact,knowledge,mcp});
  const compactionScope={profileId:profile,userId:'local-operator',sessionId:store.state.id,agentId:store.state.environment?'puzzle':'local'};
  return new Eutrya({store,cortex,jev,toolbox,config,onEvent:quiet?()=>{}:emit,redact,contextProvider:demo?null:()=>({...knowledge.context(store.workspace),...(mcp?{externalTools:mcp.catalog()}: {})}),compactionScope});
}

function requireLive() {
  insist(process.env.AI_GATEWAY_API_KEY,'Set AI_GATEWAY_API_KEY in your environment. No credentials are needed for eutrya demo.');
  textModelReady(config);
}

async function doctor() {
  const report={node:process.versions.node,nodeSupported:Number(process.versions.node.split('.')[0])>=22,
    gatewayKeyPresent:Boolean(process.env.AI_GATEWAY_API_KEY),mainModel:config.mainModel||'NOT CONFIGURED',jevModel:config.jevModel,
    sdkEvaluationAvailable:false,sdkVersion:null,liveTest:'NOT RUN',workspace:cwd,profile,mainProvider:config.mainProvider,mainKeyPresent:Boolean(process.env[providerSettings(config).keyEnv]),zeroDataRetentionRequested:config.jevZeroDataRetention||process.env.EUTRYA_ZDR==='1',optionalPackages:{},nousServices:false};
  try {
    const sdk=await import('ai');report.sdkEvaluationAvailable=typeof sdk.experimental_evaluate==='function';
    try {const url=import.meta.resolve('ai/package.json');report.sdkVersion=JSON.parse(fs.readFileSync(new URL(url),'utf8')).version;}catch{}
  }catch{}
  for(const name of ['discord.js','@slack/socket-mode','@modelcontextprotocol/sdk','ajv']){try{import.meta.resolve(name);report.optionalPackages[name]='resolvable (not a connection test)';}catch{report.optionalPackages[name]='not installed';}}
  if(values.live) {
    insist(report.gatewayKeyPresent && report.sdkEvaluationAvailable,'Live check requires a Gateway key and an installed evaluation-capable AI SDK 7');
    const jev=new GatewayJev(config);
    const result=await deadline(signal=>jev.evaluate({fixture:'The lamp is ON.'},{on:{type:'boolean',instructions:'Is the lamp on?'}},signal),config.timeoutMs);
    insist(result.data?.on?.type==='boolean' && typeof result.data.on.probability==='number','Unexpected live evaluation result');
    report.liveTest={result:result.data,usage:result.usage};
  }
  print(JSON.stringify(report,null,2));
  if(!report.sdkEvaluationAvailable)print('Install dependencies in the Eutrya package directory: npm install');
}

async function benchmark() {
  const seeds=(values.seeds??'1,2,3').split(',').map(Number);insist(seeds.length>=1&&seeds.length<=20,'Use 1..20 seeds');
  if(values.live)requireLive();
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'eutrya-bench-')),rows=[];
  for(const seed of seeds) {
    const store=new Store(path.join(root,'sessions'),cwd,{environment:makePuzzle(seed),redact});
    const runtime=engine(store,{demo:!values.live,quiet:true});const start=Date.now();
    try {runtime.startTask(PUZZLE_TASK);await runtime.run();rows.push({seed,status:runtime.state.status,steps:runtime.state.totalSteps,...runtime.state.meter,elapsedMs:Date.now()-start,trace:store.trace});}
    finally {store.close();}
  }
  print(JSON.stringify({mode:values.live?'LIVE PROVIDERS':'OFFLINE FIXTURES — NOT MODEL PERFORMANCE',comparison:false,rows},null,2));
  if(rows.some(x=>x.status!=='VERIFIED'))process.exitCode=1;
}

async function runResearch() {
  requireLive();
  const taskText=positionals.slice(1).join(' ').trim();insist(taskText,'Enter a research objective');
  const store=new Store(config.sessionRoot,cwd,{redact});
  try {
    store.state.engine={mode:'research',mainModel:config.mainModel,mainProvider:config.mainProvider,jevModel:config.jevModel};store.save();
    const cortex=new GatewayCortex(config),jev=new GatewayJev(config);
    const toolbox=new Toolbox({workspace:store.workspace,store,config,approve:async()=>false,redact,readOnly:true,allowedTools:['code_surface','code_symbol','code_references','code_inspect','code_state','code_compare']});
    const runner=new ResearchRunner({store,cortex,jev,toolbox,config,onEvent:emit,redact});
    if(!values.json)print(`\nE U T R Y A  ·  Jev Research Lane 0.4.1\nStrategist: ${config.mainProvider}/${config.mainModel}\nExecutor: ${config.jevModel}\nWorkspace: ${cwd}\nSession: ${store.state.id}\nRead-only semantic code tools only.\n`);
    runner.start(taskText);await runner.run();
    if(values.json)console.log(JSON.stringify({type:'research.result',status:runner.state.status,answer:runner.state.answer,reason:runner.state.reason,meter:runner.state.meter,session:runner.state.id,trace:store.trace}));
    else {print(`\n${statusText(runner.state)}\n`);if(runner.state.answer)print(runner.state.answer);}
    if(['ERROR','NEEDS_REVIEW'].includes(runner.state.status))process.exitCode=1;
  } finally {store.close();}
}

async function runAgent() {
  const explicitDemo=Boolean(values.demo || command==='demo');
  let id=values.resume;
  if(id==='latest') {id=listSessions(config.sessionRoot,cwd)[0]?.id;insist(id,'No sessions exist for this workspace');}
  const puzzle=command==='demo'||command==='puzzle'||(explicitDemo && command!=='chat' && command!=='run');
  if(command==='puzzle')insist(values.live||values.demo,'Use puzzle --live for real models, or demo for the offline fixture');

  let terminal=null,quitting=false;
  if(command==='chat' || (process.stdin.isTTY && !values.json)) terminal=new Terminal();

  if(puzzle) {
    let store=new Store(config.sessionRoot,cwd,{...(id?{id,existing:true}:{}),environment:!id?makePuzzle(Number(values.seed??1)):null,redact});
    let runtime=null,mcp=null;
    try {
      const demo=id?store.state.engine?.mode==='demo':explicitDemo;
      if(id&&explicitDemo)insist(demo,'Do not switch a live session into mock mode; create a separate demo');
      if(values.live)insist(!demo,'This is an offline fixture session; create a new session for live models');
      if(!store.state.engine)store.state.engine={mode:demo?'demo':'live',mainModel:config.mainModel,mainProvider:config.mainProvider,jevModel:config.jevModel};
      if(id&&!values.provider&&store.state.engine.mainProvider)config.mainProvider=store.state.engine.mainProvider;
      if(id&&!values.model&&store.state.engine.mainModel)config.mainModel=store.state.engine.mainModel;
      if(!demo)requireLive();
      store.save();
      if(values.mcp&&!demo){mcp=new McpTools(readJson(userPaths(configFile).mcp,{servers:{}}).servers);await mcp.connect();}
      runtime=engine(store,{demo,mcp,approve:terminal?(a,s)=>terminal.approve(a,s):async()=>false});
      if(!values.json)print(`\nE U T R Y A  ·  Jev-native CLI 0.4.1\n${demo?'OFFLINE FIXTURES — no real models and no paid calls':'LIVE · '+config.mainProvider+' text model '+config.mainModel+' + '+config.jevModel}\nWorkspace: ${cwd}\nSession: ${store.state.id}\nTrace: ${store.trace}\n`);
      const finish=()=>{if(terminal)terminal.prompt();};
      const launch=async()=>{
        if(runtime.busy){print('Already running. Use /steer or /stop.');return;}
        await runtime.run();
        if(!values.json)print(`\n${statusText(runtime.state)}\n`);
        else console.log(JSON.stringify({type:'result',state:runtime.state.status,answer:runtime.state.answer,meter:runtime.state.meter,session:runtime.state.id,trace:store.trace,reason:runtime.state.reason}));
        if(quitting){terminal?.close();return;}finish();
      };
      const onSignal=()=>{if(runtime.busy)runtime.stop();else {quitting=true;terminal?.close();}};
      if(terminal)terminal.onInterrupt=onSignal;
      process.on('SIGINT',onSignal);
      try {
        runtime.startTask(PUZZLE_TASK);
        await launch();
        if(['ERROR','NEEDS_REVIEW'].includes(runtime.state.status))process.exitCode=1;
      } finally {process.removeListener('SIGINT',onSignal);}
    } finally {terminal?.close();await mcp?.close();store.close();}
    return;
  }

  // Native Swarm Mode (Default for chat and tasks)
  if(!explicitDemo) requireLive();
  const swarm = new NativeSwarm({
    config,
    workspace: cwd,
    demo: explicitDemo,
    approve: terminal ? (a,s)=>terminal.approve(a,s) : async()=>false,
    onEvent: emit,
    redact
  });

  try {
    const interactive = command === 'chat';
    const agentList = swarm.listAgents().map(a => a.name).join(', ');
    if(!values.json) {
      print(`\nE U T R Y A  ·  Native Swarm [${swarm.profiles.size} active agents: ${agentList}]
LIVE · ${config.mainProvider} text model ${config.mainModel} + ${config.jevModel}
Workspace: ${cwd}
Primary: ${swarm.primaryAgent} (Use @AgentName to speak directly, e.g. @Auditor, @Sentinel)
Type / for available commands.
`);
    }

    const finish=()=>{
      if(quitting)return;
      if(terminal && !terminal.rl.closed) {
        const activeName = swarm.getAgent(swarm.activeAgentId)?.name ?? swarm.activeAgentId;
        terminal.rl.setPrompt(`eutrya [@${activeName}] › `);
        terminal.prompt();
      }
    };

    if(!interactive) {
      const taskText = positionals.slice(1).join(' ');
      insist(taskText, 'Enter a task to run');
      const res = await swarm.dispatch(taskText);
      if(values.json) console.log(JSON.stringify(res));
      return;
    }

    insist(process.stdin.isTTY,'Interactive mode needs a terminal. For scripts use eutrya run "task" --json.');

    let modelMenu = null;
    const providers = [
      {id:'vercel',name:'Vercel AI Gateway'},
      {id:'chatgpt',name:'ChatGPT subscription (Codex OAuth)'},
      {id:'openrouter',name:'OpenRouter'},
      {id:'ollama',name:'Ollama (local)'},
      {id:'compatible',name:'OpenAI-compatible endpoint'}
    ];
    const openProviderMenu = () => {
      const current=swarm.modelStatus().provider;
      modelMenu={stage:'provider',items:providers};
      print('\nE U T R Y A   M O D E L   P R O V I D E R');
      print(`Current provider: ${current}\n`);
      providers.forEach((p,i)=>print(`${i+1}. ${p.name}${p.id===current?'  [CURRENT]':''}`));
      print('\nChoose a provider number, or q to cancel.');
      terminal.rl.setPrompt('provider › ');
      terminal.rl.prompt();
    };
    const openModelMenu = async provider => {
      if(provider==='compatible'&&!config.mainBaseUrl)throw new Error('Configure --base-url before selecting the compatible provider');
      const catalog = await availableModels({
        provider,
        baseUrl: ['compatible','ollama'].includes(provider)?config.mainBaseUrl:'',
        env: process.env
      });
      const status=swarm.modelStatus();
      const current = status.provider===provider?status.defaultModel:null;
      const usable = catalog.filter(m =>
        !m.id.startsWith('typesafe-ai/') &&
        !/(embed|embedding|rerank|moderation|image|audio|speech|transcri|vision-only|video|veo|muse|sora|imagen|flux|stable-diffusion|whisper|tts)/i.test(`${m.id} ${m.type}`)
      );
      const preferred = ['deepseek/','anthropic/','openai/','google/','xai/','alibaba/','qwen/','mistral/','meta/'];
      const chosen=[];
      const add=model=>{if(model&&!chosen.some(x=>x.id===model.id))chosen.push(model);};
      add(usable.find(m=>m.id===current));
      for(const prefix of preferred) {
        usable.filter(m=>m.id.startsWith(prefix)).sort((a,b)=>b.id.localeCompare(a.id)).slice(0,4).forEach(add);
      }
      usable.sort((a,b)=>a.id.localeCompare(b.id)).forEach(add);
      const items=chosen.slice(0,30);
      insist(items.length>0,`No text models returned by ${provider}`);
      modelMenu={stage:'model',provider,items};
      print('\nE U T R Y A   M O D E L   S E L E C T O R');
      print(`Provider: ${providers.find(p=>p.id===provider)?.name??provider}`);
      print(`Current: ${current??'(different provider)'} | Jev stays: ${config.jevModel}\n`);
      items.forEach((m,i)=>print(`${String(i+1).padStart(2)}. ${m.id}${m.id===current?'  [CURRENT]':''}`));
      print('\nChoose a model number, b to go back, or q to cancel.');
      terminal.rl.setPrompt('model › ');
      terminal.rl.prompt();
    };

    await new Promise(resolve=>{
      terminal.rl.on('close',()=>{quitting=true;resolve();});
      terminal.onLine=async line=>{
        if(line==='/quit') {quitting=true;terminal.finishApproval(false);terminal.close();resolve();return;}
        if(modelMenu) {
          const choice=line.trim().toLowerCase();
          if(choice==='q'||choice==='quit'||choice==='/cancel') {
            modelMenu=null;print('Model selection cancelled.');finish();return;
          }
          if(choice==='b'||choice==='back') {
            openProviderMenu();return;
          }
          const index=Number(choice)-1;
          if(!Number.isInteger(index)||index<0||index>=modelMenu.items.length) {
            print(`Choose a number from 1 to ${modelMenu.items.length}, or q to cancel.`);
            terminal.rl.setPrompt(modelMenu.stage==='provider'?'provider › ':'model › ');terminal.rl.prompt();return;
          }
          if(modelMenu.stage==='provider') {
            const provider=modelMenu.items[index].id;
            try { await openModelMenu(provider); }
            catch(e) { print(`Could not load ${provider} models: ${e.message}`);openProviderMenu(); }
            return;
          }
          const provider=modelMenu.provider;
          const selected=modelMenu.items[index].id;
          try {
            textModelReady({...config,mainProvider:provider,mainModel:selected});
            await swarm.setProviderAndModel(provider,selected);
            modelMenu=null;
            print(`Provider set to ${provider}. Text model set to ${selected}. Jev remains ${config.jevModel}.`);
            finish();
          } catch(e) {
            print(`Model change failed: ${e.message}`);
            terminal.rl.setPrompt('model › ');terminal.rl.prompt();
          }
          return;
        }
        if(!line){terminal.prompt();return;}
        if(line==='/' || line==='/help'){print(CHAT_HELP);finish();return;}
        if(line==='/swarm'){print(swarmStatusText(swarm.statusMatrix()));finish();return;}
        if(line==='/agents'){
          print('\nSWARM AGENT PROFILES:');
          for(const a of swarm.listAgents()) {
            print(`  @${a.name.padEnd(12)} [${a.role}]`);
            print(`    Specialization: ${a.profession}`);
            print(`    Tools: ${a.tools.join(', ')}`);
            print(`    Model: ${a.model || config.mainModel} | Enabled: ${a.enabled}\n`);
          }
          finish();return;
        }
        if(line.startsWith('/agent ')){
          const sub=line.slice(7).trim();
          if(sub.startsWith('rename ')) {
            const parts=sub.slice(7).trim().split(/\s+/);
            const renamed=swarm.renameAgent(parts[0],parts[1]);
            print(`Renamed agent ${parts[0]} to ${renamed.name}`);
          } else if(sub.startsWith('remove ')) {
            swarm.removeAgent(sub.slice(7).trim());
            print(`Removed agent`);
          } else {
            const switched=swarm.focusAgent(sub);
            print(`Direct focus switched to @${switched.name} (${switched.role})`);
          }
          finish();return;
        }
        if(line==='/tasks'){
          print('\nSHARED WORKSPACE TASKS:');
          const tasks=swarm.sharedWorkspace.listTasks();
          if(!tasks.length)print('  None');
          else for(const t of tasks)print(`  [${t.id}] ${t.title} (${t.status}, assigned: @${t.assignedTo})`);
          finish();return;
        }
        if(line==='/findings'){
          print('\nSHARED WORKSPACE FINDINGS:');
          const findings=swarm.sharedWorkspace.listFindings();
          if(!findings.length)print('  None');
          else for(const f of findings)print(`  [${f.id}] ${f.topic} (by @${f.author}): ${f.content}`);
          finish();return;
        }
        if(line==='/hunt'||line==='/board'||line.startsWith('/hunt ')||line.startsWith('/board ')){
          const raw=(line.startsWith('/hunt')?line.slice(5):line.slice(6)).trim();
          const parts=raw.split(/\s+/).filter(Boolean);
          const action=parts[0]??'show';
          if(action==='run'){
            const huntId=parts[1]??swarm.sharedWorkspace.listHunts({status:'active'})[0]?.id;
            insist(huntId,'No active hunt board. Give Admin the authorized hunt page/rules first.');
            print(`Routing hunt ${huntId} with Jev across idle agents...\n`);
            const result=await swarm.runHuntBoard(huntId,{source:'operator'});
            print(huntBoardText(result.board));
          } else if(action==='pause'||action==='resume'){
            const huntId=parts[1];insist(huntId,`Usage: /hunt ${action} HUNT_ID`);
            swarm.sharedWorkspace.updateHunt(huntId,{status:action==='pause'?'paused':'active'});
            swarm.sharedWorkspace.save(swarm.swarmDir);
            print(huntBoardText(swarm.sharedWorkspace.huntBoard(huntId)));
          } else {
            const huntId=action==='show'?null:action;
            print(huntBoardText(swarm.sharedWorkspace.huntBoard(huntId)));
          }
          finish();return;
        }
        if(line==='/template'||line.startsWith('/template ')){
          const tmpl=line.slice(9).trim();
          if(!tmpl) {
            print(`Available Swarm Templates: ${Object.keys(TEMPLATES).join(', ')} (active: ${swarm.activeTemplate})`);
          } else {
            const agents=swarm.applyTemplate(tmpl);
            print(`Applied template "${tmpl}". Active agents: ${agents.map(a=>a.name).join(', ')}`);
          }
          finish();return;
        }
        if(line==='/compact'){
          const runtime=swarm.getRuntime(swarm.activeAgentId);
          try {
            const result=await runtime.compact();
            const s=result.stats;
            print(`Jev compaction: ${result.status}; ${s.before??'n/a'} → ${s.after} ${s.unit}; ${s.requests} evaluator request(s). Originals remain recallable.`);
          } catch(e) {print(`Compaction failed; original context retained: ${e.message}`);}
          finish();return;
        }
        if(line==='/context'||line.startsWith('/context ')){
          try {
            const raw=line.slice(8).trim();
            if(!raw) {
              print(`Context budget: ${config.maxPromptChars.toLocaleString()} serialized characters (valid range 4k..200k).`);
            } else {
              const maxPromptChars=parseContextBudget(raw);
              const persisted=updateConfig(configFile,{maxPromptChars});
              config.maxPromptChars=persisted.maxPromptChars;
              const live=await swarm.applyRuntimeSettings({maxPromptChars:persisted.maxPromptChars});
              print(`Context budget set to ${live.maxPromptChars.toLocaleString()} serialized characters. Applied to the next agent turn and saved to ${configFile}.`);
            }
          } catch(e) {print(`Context setting failed: ${e.message}`);}
          finish();return;
        }
        if(line==='/autocompact'||line.startsWith('/autocompact ')){
          try {
            const raw=line.slice(12).trim();
            if(!raw) {
              print(`Auto-compaction: ${config.jevCompaction?'on':'off'}.`);
            } else {
              const jevCompaction=parseAutoCompact(raw);
              const persisted=updateConfig(configFile,{jevCompaction});
              config.jevCompaction=persisted.jevCompaction;
              const live=await swarm.applyRuntimeSettings({jevCompaction:persisted.jevCompaction});
              print(`Auto-compaction: ${live.jevCompaction?'on':'off'}. Applied to the next agent turn and saved to ${configFile}.`);
            }
          } catch(e) {print(`Auto-compaction setting failed: ${e.message}`);}
          finish();return;
        }
        if(line==='/status'||line==='/usage'){
          const r=swarm.getRuntime(swarm.activeAgentId);
          print(statusText(r.state));
          finish();return;
        }
        if(line==='/memory'){
          const r=swarm.getRuntime(swarm.activeAgentId);
          print(JSON.stringify(r.toolbox.knowledge?.memories()??[],null,2));finish();return;
        }
        if(line.startsWith('/remember ')){
          const r=swarm.getRuntime(swarm.activeAgentId);
          insist(r.toolbox.knowledge,'Persistent memory is not enabled in this session');
          print(JSON.stringify(r.toolbox.knowledge.remember(line.slice(10),{approved:true})));finish();return;
        }
        if(line==='/skills'){
          const r=swarm.getRuntime(swarm.activeAgentId);
          print(JSON.stringify(r.toolbox.knowledge?.listSkills()??[],null,2));finish();return;
        }
        if(line==='/model') {
          openProviderMenu();return;
        }
        if(line.startsWith('/model ')) {
          const model=line.slice(7).trim();
          const provider=swarm.modelStatus().provider;
          textModelReady({...config,mainProvider:provider,mainModel:model});
          await swarm.setProviderAndModel(provider,model);
          print(`Provider remains ${provider}. Text model set to ${model}. Jev remains ${config.jevModel}.`);
          finish();return;
        }
        if(line==='/thinking'||line.startsWith('/thinking ')) {
          const arg=line.slice(9).trim().toLowerCase();
          if(arg==='on'||arg==='true'||arg==='yes')showThinking=true;
          else if(arg==='off'||arg==='false'||arg==='no')showThinking=false;
          else showThinking=!showThinking;
          print(`Thinking display: ${showThinking?'on (candidate summaries visible)':'off (candidate summaries hidden)'}`);
          finish();return;
        }
        if(line==='/reload') {
          print('Reloading harness with updated code while preserving swarm...');
          await swarm.close();
          terminal.close();
          const child=spawn(process.execPath,process.argv.slice(1),{stdio:'inherit',env:process.env});
          child.on('exit',(code,sig)=>{
            if(sig)process.kill(process.pid,sig);
            else process.exit(code??0);
          });
          resolve();return;
        }
        const principal = { kind: 'authenticated-user', id: 'operator' };
        if (swarm.adaptive) {
          try {
            const cmdRes = await handleAdaptiveCommand(swarm.adaptive, principal, line);
            if (cmdRes.handled) {
              print(typeof cmdRes.result === 'string' ? cmdRes.result : JSON.stringify(cmdRes.result, null, 2));
              finish();
              return;
            }
            const plainRes = capturePlainCorrection(swarm.adaptive, principal, line);
            if (plainRes.handled) {
              print(`Preference updated: "${line}"`);
              finish();
              return;
            }
          } catch (e) {
            print(`Adaptive error: ${e.message}`);
          }
        }

        if(line.startsWith('/')){print('Unknown command. Use /help.');finish();return;}

        try {
          await swarm.dispatch(line);
        } catch(e) {
          print(`Error: ${e.message}`);
        }
        if(quitting)resolve();else finish();
      };
      finish();
    });
  } finally {
    terminal?.close();
    await swarm.close();
  }
}

async function main() {
  if(values.help){print(HELP);return;}
  if(MANAGEMENT.has(command)){await management({command,positionals,values,config,configFile,cwd,print});return;}
  if(command==='chat'&&!fs.existsSync(configFile)&&!values.demo&&process.stdin.isTTY){await setup({config,configFile,values,print});Object.assign(config,loadConfig(configFile,overrides));}
  switch(command) {
    case 'init':await setup({config,configFile,values,print});return;
    case 'doctor':await doctor();return;
    case 'models':{
      const models=await deadline(s=>availableModels({signal:s,provider:config.mainProvider,baseUrl:config.mainBaseUrl,apiKey:config.overrideKey}),15000);
      const q=(positionals[1]??'').toLowerCase();
      for(const m of models.filter(m=>`${m.id} ${m.name}`.toLowerCase().includes(q)))print(`${m.id}  ${m.type}`);
      return;
    }
    case 'sessions':for(const s of listSessions(config.sessionRoot,cwd))print(`${s.id}  ${s.status.padEnd(12)}  ${clip(s.task,75)}`);return;
    case 'trace':{
      const id=positionals[1];insist(/^[a-zA-Z0-9_-]{1,80}$/.test(id),'Provide a valid session ID');
      const file=path.join(workspaceBucket(config.sessionRoot,cwd),id,'events.jsonl');
      let head='ROOT',seq=0;
      const text=fs.readFileSync(file,'utf8');insist(text.endsWith('\n'),'Trace is mid-write or incomplete; retry after the active step');
      for(const line of text.split('\n').filter(Boolean)){
        const row=JSON.parse(line);const {hash,...body}=row;insist(row.prev===head&&row.seq===++seq&&hash===digest(body),'Trace integrity check failed');head=hash;
        if(values.json)console.log(JSON.stringify(row));else if(['jev.control','decision','observation','answer','run.stopped'].includes(row.type))emit(row);
      }
      if(!values.json)print(`Verified ${seq} trace records.`);return;
    }
    case 'bench':await benchmark();return;
    case 'swarm':{
      const sub=positionals[1]??'status';
      const sw=new NativeSwarm({config,workspace:cwd,demo:Boolean(values.demo),onEvent:emit,redact});
      if(sub==='status') print(swarmStatusText(sw.statusMatrix()));
      else if(sub==='agents') {
        for(const a of sw.listAgents()) print(`@${a.name.padEnd(12)} [${a.role}] - ${a.profession}`);
      } else if(sub==='tasks') {
        const tasks=sw.sharedWorkspace.listTasks();
        if(!tasks.length) print('No tasks in shared workspace.');
        else for(const t of tasks) print(`[${t.id}] ${t.title} (${t.status}, assigned: @${t.assignedTo})`);
      } else if(sub==='templates') {
        print(`Available Swarm Templates:\n  ${Object.keys(TEMPLATES).join('\n  ')}`);
      } else {
        print(`Unknown swarm command: ${sub}. Use status, agents, tasks, or templates.`);
      }
      sw.close();return;
    }
    case 'agents':{
      const sw=new NativeSwarm({config,workspace:cwd,demo:Boolean(values.demo),onEvent:emit,redact});
      for(const a of sw.listAgents()) print(`@${a.name.padEnd(12)} [${a.role}] - ${a.profession}`);
      sw.close();return;
    }
    case 'tasks':{
      const sw=new NativeSwarm({config,workspace:cwd,demo:Boolean(values.demo),onEvent:emit,redact});
      const tasks=sw.sharedWorkspace.listTasks();
      if(!tasks.length) print('No tasks in shared workspace.');
      else for(const t of tasks) print(`[${t.id}] ${t.title} (${t.status}, assigned: @${t.assignedTo})`);
      sw.close();return;
    }
    case 'hunts':{
      const sw=new NativeSwarm({config,workspace:cwd,demo:Boolean(values.demo),onEvent:emit,redact});
      const hunts=sw.sharedWorkspace.listHunts();
      if(!hunts.length) print('No hunt boards yet.');
      else for(const h of hunts) print(`[${h.id}] ${h.title} (${h.status}) ${h.pageUrl}`);
      sw.close();return;
    }
    case 'research':await runResearch();return;
    case 'chat':case 'run':case 'demo':case 'puzzle':await runAgent();return;
    default:throw new Error(`Unknown command ${command}. Use --help.`);
  }
}
main().catch(e=>{print(`Eutrya: ${e.message}`);process.exitCode=1;});
