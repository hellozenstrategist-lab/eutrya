(() => {
  'use strict'
  const {PAGES,nav,agents,concepts,meta,state,memoryNodes,toolDefs,settingCategories,$,$$,esc,chrome,sidebar,header,panel,agentCard} = window.EutryaCore

  function dashboardPage() {
    const stats=[['ACTIVE AGENTS','5/5'],['OPEN TASKS','9'],['MEMORY NODES','320'],['LATENCY','38ms']]
    return `<div class="page"><div class="metric-row">${stats.map(([k,v])=>`<div class="metric"><span>${k}</span><strong>${v}</strong></div>`).join('')}</div><div class="dashboard-grid">
      ${panel('NATIVE SWARM','ROLES ARE FULLY CUSTOMIZABLE',`<div class="agent-grid dashboard-agents">${agents.map(a=>agentCard(a,{compact:true})).join('')}</div><div class="routing-line"><span></span><span></span><span class="hub"></span><span></span><span></span></div><div class="routing-caption">SHARED CONTEXT &nbsp;//&nbsp; ROUTED INTELLIGENCE &nbsp;//&nbsp; MULTI-AGENT REASONING</div>`,'swarm-preview')}
      ${panel('SYSTEM STATE','ONLINE',`${['CPU','MEMORY','SWARM','CONTEXT'].map((x,i)=>`<div class="bar-row"><span>${x}</span><div class="bar"><i style="width:${[28,42,100,67][i]}%"></i></div><em>${[28,42,5,67][i]}${i===2?'/5':'%'}</em></div>`).join('')}<div class="signal-bars">${Array.from({length:34},(_,i)=>`<i style="height:${10+((i*17)%38)}px"></i>`).join('')}</div><p class="microcopy">STABLE &nbsp; READY &nbsp; SCALABLE</p>`,'system-state')}
      ${panel('CHAT / ADMIN (PRIMARY)','TALK TO ANY AGENT',`<div class="chat-feed"><div class="chat-line"><div class="avatar">E</div><div><strong>Eutrya (Admin)</strong><small>Ready when you are.</small><p>I can coordinate the swarm, break down your request, and bring in the right agents.</p></div></div>${state.chat.map(x=>`<div class="chat-line"><div class="avatar user-avatar">Y</div><div><strong>You</strong><p>${esc(x)}</p></div></div>`).join('')}</div><div class="composer"><button>⌕</button><input id="chat-input" placeholder="Message Admin… or mention @Engineer"><button id="send-chat">↗</button></div>`,'chat-panel')}
      ${panel('RECENT ACTIVITY','LIVE',[['Admin','Coordinated task plan','10:24'],['Researcher','Found 3 new sources','10:22'],['Finance Analyst','Completed analysis','10:18'],['Engineer','Deployed solution draft','10:15'],['Lawyer','Reviewed compliance notes','10:13']].map(([a,b,t],i)=>`<div class="activity-item"><span class="dot ${i%2?'green':'navy'}"></span><strong>${a}</strong><span>${b}</span><time>${t}</time></div>`).join(''),'activity-panel')}
      ${panel('NOTES','PERSISTENT ACROSS SESSIONS',['Explore market analysis for Q2','Look into regulatory updates','Draft technical architecture','Compare alternatives'].map(n=>`<div class="note">✣ ${n}</div>`).join('')+`<button class="ghost-button">＋ Add note</button>`,'notes-panel')}
    </div></div>`
  }

  function swarmPage() {
    const current=agents.find(a=>a.id===state.selectedAgent)||agents[0]
    return `<div class="page"><div class="swarm-layout">
      ${panel('SHARED CONTEXT','LIVE',['Project Brief','Market Analysis','Regulatory Frame','Financial Model','Research Corpus','Compliance Notes'].map(x=>`<div class="context-item">${x}</div>`).join(''),'context-panel')}
      ${panel('SWARM ORCHESTRATION','5/5 ACTIVE',`<div class="swarm-map"><div class="map-lines"><i></i><i></i><i></i><i></i><i></i><i></i></div>${agents.map((a,i)=>`<div class="map-agent map-${i}">${agentCard(a,{selected:state.selectedAgent===a.id})}</div>`).join('')}<div class="swarm-hub"><span></span><b>ROUTING CORE</b><small>JEV GUIDANCE</small></div></div><div class="orchestration-caption">ROUTING &nbsp;//&nbsp; CONTEXT SHARING &nbsp;//&nbsp; MULTI-AGENT REASONING &nbsp;//&nbsp; REAL-TIME COLLABORATION</div>`,'orchestration-panel')}
      ${panel('INSPECTOR',current.status.toUpperCase(),`<div class="inspector-body"><div class="inspector-title">${current.name}</div><div class="inspector-sub">${current.role}</div><div class="divider"></div><label>Current tasks <strong>${current.tasks}</strong></label><label>Thinking layer <strong>Jev</strong></label><label>Context mode <strong>Shared</strong></label><label>Can delegate <strong>${current.id==='admin'?'Yes':'Via Admin'}</strong></label><div class="pill-row">${current.verbs.map(v=>`<span>${v}</span>`).join('')}</div><button class="primary-button">Open conversation</button></div>`,'inspector-panel')}
      ${panel('LIVE ACTIVITY','ALL EVENTS',[['10:14','Task delegated','Regulatory analysis'],['10:15','Researcher','Gathering data'],['10:15','Lawyer','Analyzing compliance'],['10:16','Finance Analyst','Running models'],['10:16','Engineer','Awaiting specs'],['10:17','Swarm','In progress…']].map(([a,b,c])=>`<div class="event-chip"><span class="dot green"></span><time>${a}</time><strong>${b}</strong><small>${c}</small></div>`).join(''),'swarm-events')}
    </div></div>`
  }

  function libraryPage() {
    const selected=agents.find(a=>a.id===state.selectedProfile)||agents[1]
    return `<div class="page"><div class="library-layout">
      ${panel('PROFILE LIBRARY','PRE-MADE PROFESSIONAL PROFILES · POWERED BY JEV',`<div class="profile-row">${agents.map(a=>agentCard(a,{selected:a.id===state.selectedProfile})).join('')}</div><button class="add-profile">＋ <strong>ADD CUSTOM PROFILE</strong><span>EXPAND BEYOND THE DEFAULT</span></button><div class="routing-line"><span></span><span></span><span class="hub"></span><span></span><span></span></div>`,'profile-library')}
      ${panel('PROFILE SETTINGS','PROFILE 02',`<div class="inspector-title">${selected.role}</div><div class="inspector-sub">${selected.verbs.join(' · ')}</div><div class="tabs"><button class="active">Configure</button><button>Agents (5)</button><button>Knowledge</button><button>Tools</button></div><div class="form-stack"><label>Profile name<input value="${esc(selected.role)}" readonly></label><label>Description<textarea readonly>${esc(selected.role)} profile optimized for ${esc(selected.verbs.join(', ').toLowerCase())} workflows.</textarea></label><label>Agent count<div class="stepper"><button>−</button><span>5</span><button>＋</button></div></label><label>Focus areas<div class="pill-row">${selected.verbs.map(v=>`<span>${v}</span>`).join('')}</div></label><label>Model behavior<select><option>Balanced (Default)</option><option>Fast</option><option>Deep</option></select></label></div><div class="button-row"><button class="ghost-button">Reset</button><button class="primary-button">Save changes</button></div>`,'profile-settings')}
      ${panel('YOUR SWARM','ADAPTABLE · EXTENSIBLE',`<div class="big-number">5<small>PRE-MADE PROFILES INCLUDED</small></div><div class="big-number">∞<small>EXPAND WITH CUSTOM PROFILES</small></div><p>Start with five domain-optimized profiles, each running on Jev. Customize, duplicate, or create new profiles to match your workflow.</p>`,'swarm-summary')}
    </div></div>`
  }

  function memoryPage() {
    const q=state.memoryQuery.toLowerCase()
    const filtered=memoryNodes.filter(n=>n.join(' ').toLowerCase().includes(q))
    return `<div class="page"><div class="memory-layout">
      ${panel('MEMORY OVERVIEW','PERSISTENT',`<div class="memory-stat"><strong>247</strong><span>TOTAL SESSIONS</span></div><div class="memory-stat"><strong>1,842</strong><span>MEMORY ITEMS</span></div><div class="memory-stat"><strong>320</strong><span>KNOWLEDGE NODES</span></div><div class="memory-stat"><strong>5.6 GB</strong><span>EMBEDDING STORE</span></div><div class="divider"></div><strong class="section-label">QUICK FILTERS</strong>${['All Memory 247','Conversations 98','Documents 62','Agent Outputs 46','User Notes 28','Tasks 13','Bookmarks 8'].map((x,i)=>`<button class="filter ${i===0?'active':''}">${x}</button>`).join('')}`,'memory-overview')}
      ${panel('MEMORY MAP','GRAPH · ALL TIME',`<div class="memory-map"><div class="memory-core">PERSISTENT<br>MEMORY<small>CONTEXT · KNOWLEDGE · EXPERIENCE</small></div>${filtered.map((n,i)=>`<div class="memory-node node-${i}"><strong>${n[0]}</strong><span>${n[1]} NODES</span><small>${n[2]}</small></div>`).join('')}<div class="memory-web"></div></div>`,'memory-map-panel')}
      ${panel('MEMORY DETAIL','SELECTED',`<div class="detail-body"><h3>Designing Agent Coordination Architecture</h3><span class="pill">CONVERSATION</span><p class="microcopy">APR 12, 2024 · 10:24 AM</p><div class="divider"></div><strong>SUMMARY</strong><p>Discussion on multi-agent coordination patterns, task decomposition, communication protocols, and failure recovery.</p><strong>KEY TOPICS</strong><div class="pill-row">${['agent coordination','swarm architecture','task decomposition','failure recovery','orchestration'].map(x=>`<span>${x}</span>`).join('')}</div><strong>LINKED MEMORY</strong>${['Swarm Command Design Spec','Agent Role Definitions','Coordination Evaluation Results'].map(x=>`<div class="linked-memory">${x}<small>Related context</small></div>`).join('')}</div>`,'memory-detail')}
      ${panel('MEMORY SEARCH & RECALL','SEMANTIC',`<div class="searchbox">⌕ <input id="memory-search" value="${esc(state.memoryQuery)}" placeholder='Search your memory… e.g. "swarm architecture"'></div><div class="recent-memory">${['Swarm evaluation results and next steps','Ideas for memory compaction strategy','Agent coordination architecture v2','Implement memory retrieval API'].map((x,i)=>`<div class="memory-tile"><span>${['Conversation','Note','Document','Task'][i]}</span><strong>${x}</strong></div>`).join('')}</div>`,'memory-search')}
    </div></div>`
  }

  function toolsPage() {
    const active=toolDefs.find(t=>t[0]===state.selectedTool)||toolDefs[0]
    return `<div class="page"><div class="tools-layout">
      ${panel('TOOL LIBRARY','ENABLE TO DEPLOY',`<div class="tool-grid">${toolDefs.map(([name,icon,verbs])=>`<button class="tool-card ${state.selectedTool===name?'selected':''}" data-tool="${name}"><div class="tool-title"><b>${icon}</b><strong>${name}</strong><span class="dot green"></span></div><div class="tool-art"></div><div class="agent-verbs">${verbs.map(v=>`<span>${v}</span>`).join('')}</div><small>Eutrya Core</small></button>`).join('')}</div>`,'tool-library')}
      ${panel('TOOL DETAILS',state.toolEnabled[state.selectedTool]?'ENABLED':'DISABLED',`<div class="tool-detail-body"><div class="tool-detail-title"><b>${active[1]}</b><div><h3>${active[0]}</h3><small>Eutrya Core · v1.2.0</small></div></div><p>Connect this tool to the swarm. The backend adapter can be wired to your existing runtime without changing the UI contract.</p><div class="divider"></div><label>Enabled <input id="tool-enabled" type="checkbox" ${state.toolEnabled[state.selectedTool]?'checked':''}></label><label>Default mode<select><option>Extract & Summarize</option><option>Interactive</option><option>Read only</option></select></label><label>Output format<select><option>Markdown</option><option>JSON</option><option>Text</option></select></label><label>Timeout<input value="60 seconds" readonly></label><div class="collapsible">› PERMISSIONS <span>3 granted</span></div><div class="collapsible">› CONNECTED PROVIDERS <span>Eutrya Runtime</span></div><div class="collapsible">› USAGE & STATS <span>124 calls</span></div><div class="button-row"><button class="ghost-button">Test tool</button><button class="primary-button">Save changes</button></div></div>`,'tool-details')}
      ${panel('ACTIVE TOOLCHAIN','EDIT CHAIN',['User Request','Search','Web Browser','Code Interpreter','File System','Memory','Output'].map((x,i)=>`<div class="chain-item"><span>${x}</span>${i<6?'<b>→</b>':''}</div>`).join(''),'toolchain')}
      ${panel('TOOL ACTIVITY','LIVE',['Web Browser · Fetched and extracted content','Search · Searched knowledge base','Code Interpreter · Executed analysis','File System · Saved output','API Connector · Called backend API'].map((x,i)=>`<div class="activity-item"><span class="dot green"></span><time>10:${24-i*2}:17</time><span>${x}</span><strong>Success</strong></div>`).join(''),'tool-activity')}
      ${panel('EXECUTION CONSOLE','CLEAR',`<pre>&gt; Initializing tool runtime…
&gt; Loading browser context…
&gt; Routing through Eutrya adapter…
&gt; Parsing and cleaning data…
&gt; Success. Tool execution completed in 2.4s.
▌</pre>`,'console-panel')}
    </div></div>`
  }

  function settingsPage() {
    const cat=state.settingsCategory
    const checks=[['startup','Launch Eutrya at system startup'],['restore','Restore previous session on launch'],['last','Open to last active page'],['updates','Check for updates automatically'],['analytics','Send anonymous usage analytics']]
    return `<div class="page"><div class="settings-layout">
      ${panel('','',settingCategories.map(([name,icon,sub])=>`<button class="settings-cat ${cat===name?'active':''}" data-setting="${name}"><b>${icon}</b><span><strong>${name}</strong><small>${sub}</small></span></button>`).join(''),'settings-nav')}
      ${panel(`${cat.toUpperCase()} SETTINGS`,'SYSTEM CONFIGURATION',`<div class="settings-body"><p class="settings-lead">Configure ${cat.toLowerCase()} behavior for the Eutrya frontend. These controls are adapter-friendly so your backend can own the actual persistence.</p><div class="settings-section"><strong>STARTUP & BEHAVIOR</strong>${checks.map(([k,label])=>`<label class="check-row"><input type="checkbox" data-pref="${k}" ${state.prefs[k]?'checked':''}><span>${label}</span></label>`).join('')}</div><div class="settings-section two-col"><label>Interface language<select><option>English (US)</option></select></label><label>Time format<select><option>12-hour (AM/PM)</option><option>24-hour</option></select></label><label>Default view<select><option>Dashboard</option><option>Swarm</option></select></label><label>Auto-save interval<select><option>5 minutes</option><option>1 minute</option><option>Off</option></select></label><label>On new chat<select><option>Ask which agents to use</option><option>Admin only</option></select></label><label>Default model profile<select><option>Balanced (Default)</option><option>Fast</option><option>Deep</option></select></label></div><div class="config-log"><strong>RECENT CONFIGURATION CHANGES</strong>${['Updated model provider settings','Enabled session restore','Changed default profile to Engineering','Modified storage path'].map((x,i)=>`<div class="activity-item"><span class="dot ${i?'navy':'green'}"></span><span>${x}</span><time>${i?'Yesterday':'Today'} · 10:24</time></div>`).join('')}</div></div>`,'settings-main')}
      ${panel(`ABOUT ${cat.toUpperCase()} SETTINGS`,'',`<div class="settings-help-body"><p>Configure core application behavior, startup options, and interface preferences.</p><div class="divider"></div><strong>KEY FEATURES</strong><ul><li>Frontend-first configuration surfaces</li><li>Provider-agnostic model controls</li><li>Swarm defaults and role behavior</li><li>Local runtime and privacy hooks</li></ul><div class="button-stack"><button class="ghost-button">Reset to defaults</button><button class="ghost-button">Discard changes</button><button class="primary-button">Apply changes</button></div></div>`,'settings-help')}
    </div></div>`
  }

  function pageBody() {
    return ({dashboard:dashboardPage,swarm:swarmPage,library:libraryPage,memory:memoryPage,tools:toolsPage,settings:settingsPage}[state.page])()
  }

  function render() {
    $('#app').innerHTML = `<div class="app-shell">${chrome()}<div class="app-body">${sidebar()}<main class="workspace">${header()}<div class="workspace-scroll">${pageBody()}</div><footer class="app-footer"><span>ETR-021 &nbsp;//&nbsp; ${state.page.toUpperCase()} INTERFACE &nbsp;//&nbsp; SECURE LOCAL RUNTIME</span><span>BUILT FOR HUMAN POTENTIAL. ■</span></footer></main></div></div>`
    bind()
  }

  function bind() {
    $$('[data-page]').forEach(btn => btn.addEventListener('click', () => { state.page=btn.dataset.page; render() }))
    $('#reload')?.addEventListener('click', e => { state.reloads++; e.currentTarget.classList.add('pulse'); setTimeout(()=>e.currentTarget.classList.remove('pulse'),260) })
    $$('[data-agent]').forEach(btn => btn.addEventListener('click', () => { if(state.page==='swarm') state.selectedAgent=btn.dataset.agent; if(state.page==='library') state.selectedProfile=btn.dataset.agent; render() }))
    $$('[data-tool]').forEach(btn => btn.addEventListener('click', () => { state.selectedTool=btn.dataset.tool; render() }))
    $$('[data-setting]').forEach(btn => btn.addEventListener('click', () => { state.settingsCategory=btn.dataset.setting; render() }))
    $$('[data-pref]').forEach(input => input.addEventListener('change', () => { state.prefs[input.dataset.pref]=input.checked }))
    $('#tool-enabled')?.addEventListener('change', e => { state.toolEnabled[state.selectedTool]=e.target.checked; render() })
    const search=$('#memory-search'); if(search) search.addEventListener('input', e => { state.memoryQuery=e.target.value; const pos=e.target.selectionStart; render(); const n=$('#memory-search'); if(n){n.focus();n.setSelectionRange(pos,pos)} })
    const send=()=>{const input=$('#chat-input');const text=input?.value.trim();if(text){state.chat.push(text);render();setTimeout(()=>$('#chat-input')?.focus(),0)}}
    $('#send-chat')?.addEventListener('click',send); $('#chat-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')send()})
    $$('[data-window]').forEach(btn=>btn.addEventListener('click',()=>windowAction(btn.dataset.window)))
  }

  async function windowAction(action) {
    try {
      const w=window.__TAURI__?.window?.getCurrentWindow?.()
      if(!w) return
      if(action==='min') await w.minimize()
      if(action==='max') await w.toggleMaximize()
      if(action==='close') await w.close()
    } catch (_) {}
  }

  render()
})()
