(() => {
  'use strict'

  const PAGES = ['dashboard', 'swarm', 'library', 'memory', 'tools', 'settings']
  const nav = [
    ['dashboard', '▦', 'Dashboard'],
    ['swarm', '⌘', 'Swarm'],
    ['library', '▤', 'Library'],
    ['memory', '◉', 'Memory'],
    ['tools', '⌁', 'Tools'],
    ['settings', '⚙', 'Settings'],
  ]

  const agents = [
    { id:'admin', index:'01', name:'Admin', role:'Primary agent', verbs:['Coordinate','Delegate','Plan','Synthesize'], status:'online', tasks:3 },
    { id:'engineer', index:'02', name:'Engineer', role:'Engineering', verbs:['Build','Analyze','Debug','Implement'], status:'working', tasks:2 },
    { id:'lawyer', index:'03', name:'Lawyer', role:'Law', verbs:['Review','Analyze','Ensure','Mitigate'], status:'online', tasks:1 },
    { id:'finance', index:'04', name:'Finance Analyst', role:'Finance', verbs:['Model','Analyze','Forecast','Optimize'], status:'working', tasks:1 },
    { id:'researcher', index:'05', name:'Researcher', role:'Research', verbs:['Explore','Synthesize','Validate','Report'], status:'online', tasks:2 },
  ]

  const agentPortraits = {
    admin:'agent-admin.jpg', engineer:'agent-engineer.jpg', lawyer:'agent-lawyer.jpg',
    legal:'agent-lawyer.jpg', finance:'agent-finance.jpg', researcher:'agent-researcher.jpg'
  }

  const concepts = {
    dashboard:'./assets/dashboard.jpg', swarm:'./assets/swarm.jpg', library:'./assets/library.jpg',
    memory:'./assets/memory.jpg', tools:'./assets/tools.jpg', settings:'./assets/settings.jpg'
  }

  const meta = {
    dashboard:{eyebrow:'LOCAL',title:'Eutrya',subtitle:'Native swarm command surface'},
    swarm:{eyebrow:'SWARM › ACTIVE',title:'Swarm Command',subtitle:'Live orchestration · shared context · routed intelligence'},
    library:{eyebrow:'SWARM › PROFILES',title:'Profile Library',subtitle:'Persistent professional profiles · powered by Jev'},
    memory:{eyebrow:'MEMORY › ARCHIVE',title:'Memory Archive',subtitle:'Persistent context · semantic recall · linked knowledge'},
    tools:{eyebrow:'TOOLS › WORKBENCH',title:'Tools Workbench',subtitle:'Runtime tools · permissions · execution flow'},
    settings:{eyebrow:'SETTINGS › SYSTEM',title:'Settings',subtitle:'Models · swarm defaults · runtime · privacy'}
  }

  const state = {
    page:'dashboard', reloads:0, chat:[], selectedAgent:'admin', selectedProfile:'engineer', selectedTool:'Web Browser',
    memoryQuery:'', settingsCategory:'General', busy:false, pendingText:'', notice:'',
    backend:{connected:false,readiness:{ready:false,mode:'starting',error:null},config:null,swarm:null,memory:{items:[],skills:[]},approvals:[],events:[]},
    toolEnabled:{'Web Browser':true,'Code Interpreter':true,'File System':true,'Memory':true,'Search':true,'API Connector':true,'Database':true,'Email':true,'External Apps':true,'Custom Tool':true},
    prefs:{startup:false,restore:true,last:true,updates:false,analytics:false}
  }

  const memoryNodes = [
    ['Research','42','Papers · analysis · insights'], ['Projects','38','Plans · discussions · outcomes'],
    ['Technical','76','Architecture · implementation'], ['Ideas','33','Concepts · hypotheses · future work'],
    ['Personal','21','Preferences · workflow · goals'], ['Operations','28','Agent workflows · metrics']
  ]

  const toolDefs = [
    ['Web Browser','◎',['Browse','Extract','Summarize','Interact']],['Code Interpreter','>_',['Execute','Analyze','Debug','Visualize']],
    ['File System','▱',['Read','Write','Search','Manage']],['Memory','◫',['Store','Retrieve','Contextualize','Learn']],
    ['Search','⌕',['Web search','Knowledge base','Citations']],['API Connector','↔',['REST','GraphQL','Authenticate','Transform']],
    ['Database','▥',['Query','Analyze','Synchronize','Manage']],['Email','✉',['Read','Compose','Automate','Monitor']],
    ['External Apps','▦',['Notion','Slack','Workspace','Custom apps']],['Custom Tool','＋',['Build','Deploy','Share','Extend']]
  ]

  const settingCategories = [
    ['General','◇','System behavior and preferences'], ['Model Providers','◈','LLM connections and API settings'],
    ['Swarm Defaults','⌘','Agent behavior and collaboration'], ['Profiles','▤','Default settings and preferences'],
    ['Security & Privacy','⬡','Access, data, privacy'], ['Local Runtime','▣','Compute and execution'],
    ['Storage','▥','Data paths and cache'], ['Appearance','◉','Theme and interface'],
    ['Notifications','◌','Alerts and updates'], ['Advanced','⚙','Experimental features']
  ]

  const $ = (sel, root=document) => root.querySelector(sel)
  const $$ = (sel, root=document) => [...root.querySelectorAll(sel)]
  const esc = s => String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))

  function chrome() {
    return `<div class="chrome" data-tauri-drag-region>
      <div class="traffic-lights"><i></i><i></i><i></i></div>
      <div class="chrome-mark" data-tauri-drag-region><span>// ORCHESTRATE HIGHER INTELLIGENCE</span></div>
      <div class="chrome-center" data-tauri-drag-region>LOCAL &nbsp; <span class="sync-dot"></span> SYNCED &nbsp; <span class="online-dot"></span> JEV: ONLINE</div>
      <div class="window-controls"><button data-window="min">−</button><button data-window="max">□</button><button data-window="close">×</button></div>
    </div>`
  }

  function sidebar() {
    return `<aside class="sidebar">
      <div class="brand-lockup"><div class="brand-mark">Λ</div><div><div class="brand">Eutrya</div><div class="brand-sub">v0.2.0</div></div></div>
      <div class="slash">//</div>
      <nav class="nav-list">${nav.map(([key,icon,label]) => `<button class="nav-item ${state.page===key?'active':''}" data-page="${key}"><b>${icon}</b><span>${label}</span></button>`).join('')}</nav>
      <div class="sidebar-copy">HUMAN<br>AI<br>HIGHER<br>INTELLIGENCE</div>
      <div class="botanical-orbit"><div class="orbit orbit-a"></div><div class="orbit orbit-b"></div><div class="stem"></div></div>
      <div class="sidebar-foot">// eutrya<br><span>BUILT FOR<br>THE LONG RUN</span></div>
      <div class="sidebar-index">${String(PAGES.indexOf(state.page)+1).padStart(2,'0')}</div>
    </aside>`
  }

  function header() {
    const m=meta[state.page]
    const r=state.backend?.readiness??{}
    const matrix=state.backend?.swarm?.matrix
    const online=(matrix?.agents??[]).filter(a=>['IDLE','THINKING','WORKING','WAITING','REVIEWING'].includes(a.status)).length
    const total=(matrix?.agents??[]).length || agents.length
    const provider=state.backend?.config?.mainProvider??'runtime'
    const model=state.backend?.config?.mainModel||'not configured'
    const status=r.ready?'READY':(r.mode==='setup'?'SETUP':'CONNECTING')
    return `<header class="page-header">
      <div class="header-copy"><div class="eyebrow">PROJECT &nbsp;›&nbsp; ${m.eyebrow}</div><div class="page-title">${m.title}</div><div class="page-subtitle">${m.subtitle}</div></div>
      <div class="concept-strip" style="background-image:linear-gradient(90deg,rgba(233,231,224,.12),rgba(233,231,224,.76)),url('${concepts[state.page]}')"><div class="concept-annotation">INTELLIGENCE<br>GROWS<br>TOGETHER.</div></div>
      <button class="reload-btn" id="reload" ${state.busy?'disabled':''}>↻ <span>/Reload</span></button>
      <div class="sys-mini"><span class="dot ${r.ready?'green':'navy'}"></span> SYS. ${r.ready?'ONLINE':'LOCAL'}<br>${online}/${total} AGENTS<br>${esc(provider)} · ${esc(model)}<br>${status}</div>
    </header>`
  }

  function panel(title, metaText, body, cls='') {
    return `<section class="panel ${cls}">${title||metaText?`<div class="panel-head"><strong>${title||''}</strong><span>${metaText||''}</span></div>`:''}${body}</section>`
  }

  function agentCard(a, opts={}) {
    const selected=opts.selected?'selected':''
    const compact=opts.compact?'compact':''
    const portrait=agentPortraits[a.id]||agentPortraits.researcher
    return `<button class="agent-card ${selected} ${compact}" data-agent="${a.id}">
      <img class="agent-card-portrait" src="./assets/${portrait}" alt="" aria-hidden="true">
      <div class="agent-top"><span>${a.index}</span><span class="status ${String(a.status).toLowerCase()}">${String(a.status).toLowerCase()}</span></div>
      <div class="agent-name">${a.name}</div><div class="agent-verbs">${a.verbs.map(v=>`<span>${v}</span>`).join('')}</div>
      <div class="agent-art"><span></span><span></span><span></span></div><div class="jev"><strong>Jev</strong><small>NATIVE THINKING LAYER</small></div>
      ${opts.compact?'':`<div class="agent-bottom"><span>${a.role}</span><span>${a.tasks} tasks</span></div>`}
    </button>`
  }


  window.EutryaCore = {PAGES,nav,agents,concepts,meta,state,memoryNodes,toolDefs,settingCategories,$,$$,esc,chrome,sidebar,header,panel,agentCard}
})()
