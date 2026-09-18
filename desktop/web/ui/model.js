/* State helpers. Runtime data and presentation-only preferences stay separate. */
(() => {
  'use strict';
  const names=['dashboard','swarm','hunts','library','memory','tools','settings'];
  const initial=location.hash.slice(1);
  let preferences={density:'precise',motion:'system'};
  try { preferences={...preferences,...JSON.parse(localStorage.getItem('eutrya.studio.preferences')||'{}')}; } catch { /* Local storage can be unavailable in a restricted webview. */ }
  const state={page:names.includes(initial)?initial:'dashboard',data:null,connected:false,error:'',selectedAgent:'admin',selectedProfile:'admin',selectedTool:'Web Browser',selectedRecord:null,source:'all',agentQuery:'',memoryQuery:'',toolQuery:'',toolCategory:'all',libraryView:'grid',networkView:'graph',settingsTab:'all',profileTab:'configuration',configDraft:null,configDirty:false,profileDrafts:{},chatDraft:'',chatBusy:false,outbox:null,outboxAt:0,pending:new Set(),preferences,scroll:{},modal:null,seenApprovals:new Set(),toastTimer:null};
  const defaults=[
  {
    "id": "admin",
    "name": "Admin",
    "role": "Security orchestration",
    "description": "Coordinate scoped work and maintain the shared plan.",
    "verbs": [
      "Coordinate",
      "Scope",
      "Delegate"
    ]
  },
  {
    "id": "auditor",
    "name": "Auditor",
    "role": "Security code review",
    "description": "Review code, trace invariants, and gather supporting evidence.",
    "verbs": [
      "Review",
      "Trace",
      "Document"
    ]
  },
  {
    "id": "operator",
    "name": "Operator",
    "role": "Validation engineering",
    "description": "Support controlled local validation and record its results.",
    "verbs": [
      "Validate",
      "Record",
      "Report"
    ]
  },
  {
    "id": "sentinel",
    "name": "Sentinel",
    "role": "Independent review",
    "description": "Challenge assumptions, assess evidence, and flag uncertainty.",
    "verbs": [
      "Verify",
      "Challenge",
      "Triage"
    ]
  },
  {
    "id": "analyst",
    "name": "Analyst",
    "role": "Architecture & research",
    "description": "Connect documentation, architecture, and review evidence.",
    "verbs": [
      "Model",
      "Research",
      "Synthesize"
    ]
  }
];
  const toolGroups=[
    {"name":"Semantic Code","icon":"code","category":"Research","description":"Read-only structural code navigation; signals are not proofs.","keys":["code_surface","code_symbol","code_references","code_inspect","code_state","code_compare"]},
    {"name":"Hunt Board","icon":"hunts","category":"Collaboration","description":"Shared board metadata and recorded routing. The desktop review view does not launch tests.","keys":["hunt_create","hunt_card","hunt_board","hunt_route"]},

    {name:'Web Browser',icon:'globe',category:'Research',description:'Read and navigate web content within runtime permissions.',keys:['browser']},
    {name:'Code Interpreter',icon:'code',category:'Execution',description:'Run local processes through the runtime approval gate.',keys:['run','shell']},
    {name:'File System',icon:'folder',category:'Data',description:'Read and manage files inside your working environment.',keys:['list','read','mkdir','write','edit']},
    {name:'Memory',icon:'memory',category:'Data',description:'Store approved context and retrieve persistent knowledge.',keys:['note','recall','remember','memory_search']},
    {name:'Search',icon:'search',category:'Research',description:'Find relevant information using assigned search tools.',keys:['search']},
    {name:'Swarm Coordination',icon:'swarm',category:'Collaboration',description:'Delegate tasks and share messages across specialist agents.',keys:['delegate','send_message','consult_swarm']},
    {name:'Workspace Records',icon:'database',category:'Data',description:'Record decisions, findings, and shared task updates.',keys:['publish_finding','record_decision','update_task']},
    {name:'Connected Tools',icon:'tools',category:'Execution',description:'Use runtime integrations and approved skills.',keys:['mcp','skill','skill_draft']},
    {name:'Human Review',icon:'lock',category:'Collaboration',description:'Ask for operator input and finish with a clear result.',keys:['ask','finish']}
  ];
  const ready=()=>Boolean(state.connected&&state.data?.readiness?.ready);
  const ws=()=>state.data?.swarm?.workspace||{tasks:[],messages:[],findings:[],decisions:[],artifacts:[],blockers:[]};
  const config=()=>state.data?.config||{};
  const events=()=>state.data?.events||[];
  const memory=()=>state.data?.memory?.items||[];
  const mode=()=>state.data?.readiness?.mode|| (state.error?'offline':'connecting');
  const isPreview=()=>['demo','preview'].includes(mode());
  const activeTasks=()=>[...(ws().tasks||[]),...(ws().huntCards||[])].filter(t=>!['completed','cancelled','failed','done','parked'].includes(String(t.status).toLowerCase()));
  function agents(){
    const profiles=state.data?.swarm?.profiles||[];
    const statuses=new Map((state.data?.swarm?.matrix?.agents||[]).map(a=>[a.id,a]));
    return (profiles.length?profiles:defaults).map((p,i)=>{
      const fallback=defaults.find(d=>d.id===p.id||(p.id==='legal'&&d.id==='lawyer'))||defaults[4];
      const raw=p.enabled===false?'disabled':ready()?String(statuses.get(p.id)?.status||'IDLE').toLowerCase():'offline';
      const tone=['working','thinking','reviewing'].includes(raw)?'working':['waiting'].includes(raw)?'waiting':raw==='blocked'?'blocked':['offline','disabled'].includes(raw)?'offline':'idle';
      return {...p,index:String(i+1).padStart(2,'0'),role:p.role||p.profession||fallback.role,description:p.description||fallback.description,verbs:fallback.verbs,status:raw,tone,statusLabel:raw==='offline'?'Not linked':raw==='idle'?'Idle':raw[0].toUpperCase()+raw.slice(1),taskCount:activeTasks().filter(t=>t.assignedTo===p.id).length,currentTask:statuses.get(p.id)?.currentTask,tools:p.tools||[],persisted:profiles.length>0};
    });
  }
  function availableTools(){const list=agents();return toolGroups.map(g=>({...g,profiles:list.filter(a=>a.enabled!==false&&a.tools.some(t=>g.keys.includes(t)))}));}
  function records(){
    const result=[];
    const add=(source,rows,titleKey,textKey)=>rows.forEach((r,i)=>{
      const text=String(r[textKey]||r.text||r.content||r.summary||r.objective||r.title||r.topic||r.path||'');
      const id=r.id??`${source}-${i}`;
      result.push({key:`${source}:${id}`,id,source,title:String(r[titleKey]||text.split('\n')[0]||'Untitled').slice(0,110),text,time:r.at||r.createdAt||r.timestamp||null,author:r.author||r.from||r.assignedTo||'Workspace',deletable:source==='notes'&&Boolean(r.id)});
    });
    add('notes',memory(),'title','text');add('messages',ws().messages||[],'subject','content');add('tasks',ws().tasks||[],'title','description');add('findings',ws().findings||[],'topic','summary');add('decisions',ws().decisions||[],'topic','decision');add('artifacts',ws().artifacts||[],'name','path');
    add('hunt-cards',ws().huntCards||[],'title','workerResult');
    return result;
  }
  function groups(){const all=records();return [['notes','Notes'],['messages','Conversations'],['tasks','Tasks'],['findings','Findings'],['decisions','Decisions'],['artifacts','Artifacts'],['hunt-cards','Hunt cards']].map(([id,name])=>({id,name,count:all.filter(r=>r.source===id).length}));}
  function selectedAgent(){return agents().find(a=>a.id===state.selectedAgent)||agents()[0];}
  function selectedProfile(){return agents().find(a=>a.id===state.selectedProfile)||agents()[0];}
  function profileDraft(){const p=selectedProfile();return state.profileDrafts[p.id]||{name:p.name,role:p.role,profession:p.profession||p.role,instructions:p.instructions||'',model:p.model||''};}
  function persistedOutbox(messages=[]){
    if(!state.outbox) return false;
    const text=String(state.outbox).trim();
    const sentAt=Number(state.outboxAt)||0;
    return messages.some(m=>{
      if(m?.from!=='user') return false;
      if(String(m.content??m.text??'').trim()!==text) return false;
      if(!sentAt) return true;
      const at=Date.parse(m.timestamp??m.at??'');
      return Number.isFinite(at) && at >= sentAt-2000;
    });
  }
  function accept(payload){
    const data=payload?.state || payload;
    if(!data?.readiness) return;
    state.data=data;state.connected=true;state.error='';
    if(persistedOutbox(data?.swarm?.workspace?.messages||[])){
      state.outbox=null;
      state.outboxAt=0;
    }
    if(!state.configDirty) state.configDraft={...config()};
  }
  const time = (value,full=false) => {const d=new Date(value);return !value||!Number.isFinite(d.getTime())?'—':(full?d.toLocaleDateString([], {month:'short',day:'numeric',year:'numeric'}):d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',hour12:false}));};
  function eventLabel(e){const d=e?.data||{};if(e.type==='hunt.card_started')return `${d.cardId} → @${d.agent||d.agentId} (${d.stage})`;if(e.type==='hunt.card_stage_complete')return `${d.cardId} → ${d.nextStatus}`;if(e.type==='hunt.card_blocked')return `${d.cardId} blocked: ${d.error||'Review needed'}`;if(e.type==='hunt.waiting')return `${d.cardId}: ${d.reason||'Waiting'}`;if(e.type==='swarm.agent_status')return `${d.agent||e.agent||'Agent'} · ${d.status||'updated'}`;if(e.type==='observation')return `${e.agent||'Agent'} · ${d.action?.type||'tool observation'}`;if(e.type==='answer')return `${e.agent||'Agent'} answered`;if(e.type==='desktop.user_message')return 'Message sent to the swarm';if(e.type==='desktop.runtime_ready')return 'Runtime connected';if(e.type==='desktop.approval_required')return 'Operator approval requested';return String(e.type||'Runtime event').replaceAll(/[._]/g,' ');}
  window.EutryaStudio={names,state,defaults,toolGroups,ready,ws,config,events,memory,mode,isPreview,activeTasks,agents,availableTools,records,groups,selectedAgent,selectedProfile,profileDraft,persistedOutbox,accept,time,eventLabel};
})();
