(() => {
  'use strict'
  const {PAGES,agents,state,memoryNodes,toolDefs,settingCategories,$,$$,esc,chrome,sidebar,header,panel,agentCard} = window.EutryaCore
  const backend = window.EutryaBackend

  const verbsById = {
    admin:['Coordinate','Delegate','Plan','Synthesize'], engineer:['Build','Analyze','Debug','Implement'], legal:['Review','Analyze','Ensure','Mitigate'], lawyer:['Review','Analyze','Ensure','Mitigate'], finance:['Model','Analyze','Forecast','Optimize'], researcher:['Explore','Synthesize','Validate','Report']
  }
  const toolNameMap = {
    list:'File System', read:'File System', search:'Search', browser:'Web Browser', note:'Memory', recall:'Memory', memory_search:'Memory', remember:'Memory', skill:'External Apps', skill_draft:'External Apps', mkdir:'File System', write:'File System', edit:'File System', run:'Code Interpreter', shell:'Code Interpreter', mcp:'External Apps', delegate:'External Apps', send_message:'External Apps', publish_finding:'Memory', record_decision:'Memory', update_task:'Memory', consult_swarm:'Search', ask:'External Apps', finish:'External Apps'
  }

  function isReady(){ return Boolean(state.backend?.readiness?.ready) }
  function live(){ return state.backend?.swarm }
  function matrix(){ return live()?.matrix ?? {agents:[],activeTasks:[],blockers:[],activeFocus:'admin',primaryAgent:'admin',activeTemplate:'default'} }
  function workspace(){ return live()?.workspace ?? {tasks:[],findings:[],messages:[],blockers:[],decisions:[],artifacts:[]} }
  function memoryItems(){ return state.backend?.memory?.items ?? [] }
  function recentEvents(){ return state.backend?.events ?? [] }

  function applyBackend(payload) {
    if (!payload) return
    state.backend = { connected:true, ...payload }
    const profiles = payload.swarm?.profiles ?? []
    const statuses = new Map((payload.swarm?.matrix?.agents ?? []).map(x => [x.id, x]))
    if (profiles.length) {
      const next = profiles.map((p,i) => {
        const st=statuses.get(p.id)
        return {
          id:p.id,index:String(i+1).padStart(2,'0'),name:p.name,role:p.role||p.profession||'Specialist',
          profession:p.profession||p.role||'Specialist',instructions:p.instructions||'',model:p.model||null,tools:p.tools||[],enabled:p.enabled!==false,
          verbs:verbsById[p.id] ?? ['Analyze','Synthesize','Execute','Report'],status:(st?.status||'IDLE').toLowerCase(),tasks:(workspace().tasks||[]).filter(t=>t.assignedTo===p.id&&t.status!=='completed').length,
          currentTask:st?.currentTask||null
        }
      })
      agents.splice(0,agents.length,...next)
      if(!agents.some(a=>a.id===state.selectedAgent)) state.selectedAgent=payload.swarm?.matrix?.activeFocus||agents[0]?.id||'admin'
      if(!agents.some(a=>a.id===state.selectedProfile)) state.selectedProfile=agents.find(a=>a.id!=='admin')?.id||agents[0]?.id||'admin'
    }
    const cfg=payload.config
    if(cfg){state.prefs.autoWrite=Boolean(cfg.autoWrite);state.prefs.allowExec=Boolean(cfg.allowExec);state.prefs.jevCompaction=Boolean(cfg.jevCompaction)}
  }

  async function refresh({rerender=true}={}) {
    try {
      const payload=await backend.state()
      applyBackend(payload)
      state.notice=''
      if(rerender && !['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName)) render()
      return payload
    } catch(err) {
      state.backend={...state.backend,connected:false,readiness:{...(state.backend?.readiness||{}),ready:false,mode:'offline',error:err.message}}
      state.notice=err.message
      if(rerender) render()
      return null
    }
  }

  function eventLabel(e) {
    const d=e?.data||{}
    if(e.type==='swarm.agent_status') return `${d.agent||e.agent||'Agent'} · ${d.status||'updated'}`
    if(e.type==='swarm.event') return `${d.from||''} → ${d.to||''} · ${d.type||'event'}`
    if(e.type==='observation') return `${e.agent||'Agent'} · tool ${d.action?.type||'action'}`
    if(e.type==='answer') return `${e.agent||'Agent'} · answered`
    if(e.type==='desktop.user_message') return 'You · message sent'
    if(e.type==='desktop.runtime_ready') return `Runtime · ${d.mode||'ready'}`
    if(e.type==='desktop.approval_required') return `Approval · ${d.action?.type||'action'}`
    return String(e.type||'runtime event').replaceAll('.',' · ')
  }

  function readinessBanner() {
    const r=state.backend?.readiness||{}
    if(r.ready) return ''
    const err=r.error||state.notice||'The desktop shell is waiting for the Eutrya runtime bridge.'
    return `<div class="runtime-banner"><div><strong>${r.mode==='setup'?'RUNTIME SETUP REQUIRED':'RUNTIME OFFLINE'}</strong><p>${esc(err)}</p></div><button data-page="settings" class="primary-button">Open settings</button></div>`
  }

  function dashboardPage() {
    const m=matrix(), ws=workspace(), mem=memoryItems()
    const active=m.agents.filter(a=>a.status!=='BLOCKED').length||agents.length
    const stats=[['ACTIVE AGENTS',`${active}/${m.agents.length||agents.length}`],['OPEN TASKS',String(ws.tasks.filter(t=>t.status!=='completed').length)],['MEMORY ITEMS',String(mem.length)],['RUNTIME',state.backend?.readiness?.mode?.toUpperCase()||'LOCAL']]
    const messages=(ws.messages||[]).slice(-30)
    const chatBody = `${readinessBanner()}<div class="chat-feed">${messages.length?messages.map(msg=>{
      const mine=msg.from==='user';const who=mine?'You':(agents.find(a=>a.id===msg.from)?.name||msg.from)
      return `<div class="chat-line"><div class="avatar ${mine?'user-avatar':''}">${esc(who.slice(0,1).toUpperCase())}</div><div><strong>${esc(who)}</strong><small>${new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</small><p>${esc(msg.content)}</p></div></div>`
    }).join(''):`<div class="chat-line"><div class="avatar">E</div><div><strong>Eutrya (Admin)</strong><small>Native swarm ready.</small><p>Give me a task. Jev will route it through the organization and the runtime will preserve the work.</p></div></div>`}${state.busy?`<div class="chat-line"><div class="avatar">⋯</div><div><strong>Swarm working</strong><p>${esc(state.pendingText||'Processing…')}</p></div></div>`:''}</div><div class="composer"><button title="Selected agent">@</button><input id="chat-input" placeholder="Message ${esc(agents.find(a=>a.id===state.selectedAgent)?.name||'Admin')}…" ${!isReady()||state.busy?'disabled':''}><button id="${state.busy?'stop-chat':'send-chat'}">${state.busy?'■':'↗'}</button></div>`
    const events=recentEvents().slice(-8).reverse()
    return `<div class="page"><div class="metric-row">${stats.map(([k,v])=>`<div class="metric"><span>${k}</span><strong>${esc(v)}</strong></div>`).join('')}</div><div class="dashboard-grid">
      ${panel('NATIVE SWARM',`${matrix().activeTemplate||'default'} · CLICK AN AGENT TO FOCUS`,`<div class="agent-grid dashboard-agents">${agents.map(a=>agentCard(a,{compact:true,selected:a.id===state.selectedAgent})).join('')}</div><div class="routing-line"><span></span><span></span><span class="hub"></span><span></span><span></span></div><div class="routing-caption">SHARED CONTEXT &nbsp;//&nbsp; ROUTED INTELLIGENCE &nbsp;//&nbsp; MULTI-AGENT REASONING</div>`,'swarm-preview')}
      ${panel('SYSTEM STATE',isReady()?'ONLINE':'SETUP',`${[['RUNTIME',isReady()?100:18],['SWARM',m.agents.length?100:12],['MEMORY',Math.min(100,10+mem.length*7)],['EVENTS',Math.min(100,recentEvents().length)]].map(([x,v])=>`<div class="bar-row"><span>${x}</span><div class="bar"><i style="width:${v}%"></i></div><em>${v}%</em></div>`).join('')}<div class="signal-bars">${Array.from({length:34},(_,i)=>`<i style="height:${10+((i*17)%38)}px"></i>`).join('')}</div><p class="microcopy">${esc(state.backend?.config?.mainProvider||'LOCAL')} · ${esc(state.backend?.config?.mainModel||'MODEL NOT CONFIGURED')}</p>`,'system-state')}
      ${panel(`CHAT / ${(agents.find(a=>a.id===state.selectedAgent)?.name||'ADMIN').toUpperCase()}`,state.busy?'WORKING':'TALK TO ANY AGENT',chatBody,'chat-panel')}
      ${panel('RECENT ACTIVITY','LIVE',events.length?events.map((e,i)=>`<div class="activity-item"><span class="dot ${i%2?'green':'navy'}"></span><strong>${esc(e.agent||e.agentId||'runtime')}</strong><span>${esc(eventLabel(e))}</span><time>${new Date(e.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time></div>`).join(''):`<div class="note">Waiting for runtime activity.</div>`,'activity-panel')}
      ${panel('NOTES','SHARED WORKSPACE',(ws.findings||[]).slice(-4).map(f=>`<div class="note">✣ ${esc(f.topic)}</div>`).join('')+`<button class="ghost-button" data-page="memory">Open memory</button>`,'notes-panel')}
    </div></div>`
  }

  function swarmPage() {
    const m=matrix(), current=agents.find(a=>a.id===state.selectedAgent)||agents[0]||{id:'admin',name:'Admin',role:'Primary agent',verbs:[],status:'idle',tasks:0}
    const tasks=(workspace().tasks||[]).filter(t=>t.status!=='completed')
    return `<div class="page">${readinessBanner()}<div class="swarm-layout">
      ${panel('SHARED CONTEXT','LIVE',[`Template · ${m.activeTemplate||'default'}`,`Primary · ${m.primaryAgent||'admin'}`,`Focus · @${m.activeFocus||state.selectedAgent}`,`${tasks.length} active tasks`,`${(m.blockers||[]).length} blockers`].map(x=>`<div class="context-item">${esc(x)}</div>`).join('')+`<div class="template-buttons">${['default','engineering','startup','legal','research'].map(x=>`<button data-template="${x}">${x}</button>`).join('')}</div>`,'context-panel')}
      ${panel('SWARM ORCHESTRATION',`${agents.length} ACTIVE`,`<div class="swarm-map"><div class="map-lines"><i></i><i></i><i></i><i></i><i></i><i></i></div>${agents.slice(0,5).map((a,i)=>`<div class="map-agent map-${i}">${agentCard(a,{selected:state.selectedAgent===a.id})}</div>`).join('')}<div class="swarm-hub"><span></span><b>ROUTING CORE</b><small>JEV GUIDANCE</small></div></div><div class="orchestration-caption">ROUTING &nbsp;//&nbsp; CONTEXT SHARING &nbsp;//&nbsp; MULTI-AGENT REASONING &nbsp;//&nbsp; REAL-TIME COLLABORATION</div>`,'orchestration-panel')}
      ${panel('INSPECTOR',(current.status||'idle').toUpperCase(),`<div class="inspector-body"><div class="inspector-title">${esc(current.name)}</div><div class="inspector-sub">${esc(current.role)}</div><div class="divider"></div><label>Current tasks <strong>${current.tasks}</strong></label><label>Thinking layer <strong>Jev</strong></label><label>Context mode <strong>Shared</strong></label><label>Model <strong>${esc(current.model||state.backend?.config?.mainModel||'default')}</strong></label>${current.currentTask?`<p class="microcopy">${esc(current.currentTask)}</p>`:''}<div class="pill-row">${(current.verbs||[]).map(v=>`<span>${esc(v)}</span>`).join('')}</div><button class="primary-button" data-page="dashboard">Open conversation</button></div>`,'inspector-panel')}
      ${panel('LIVE TASKS','SHARED WORKSPACE',tasks.length?tasks.slice(-6).map(t=>`<div class="event-chip"><span class="dot green"></span><time>${esc(t.status)}</time><strong>${esc(t.assignedTo)}</strong><small>${esc(t.title)}</small></div>`).join(''):`<div class="note">No active tasks.</div>`,'swarm-events')}
    </div></div>`
  }

  function libraryPage() {
    const selected=agents.find(a=>a.id===state.selectedProfile)||agents[0]
    if(!selected) return `<div class="page">${readinessBanner()}</div>`
    return `<div class="page">${readinessBanner()}<div class="library-layout">
      ${panel('PROFILE LIBRARY','PERSISTENT ROLES · POWERED BY JEV',`<div class="profile-row">${agents.map(a=>agentCard(a,{selected:a.id===state.selectedProfile})).join('')}</div><button class="add-profile" id="add-profile">＋ <strong>ADD CUSTOM PROFILE</strong><span>EXPAND BEYOND THE DEFAULT</span></button><div class="routing-line"><span></span><span></span><span class="hub"></span><span></span><span></span></div>`,'profile-library')}
      ${panel('PROFILE SETTINGS',`PROFILE ${esc(selected.index)}`,`<div class="inspector-title">${esc(selected.name)}</div><div class="inspector-sub">${esc(selected.role)}</div><div class="tabs"><button class="active">Configure</button><button>Tools (${selected.tools?.length||0})</button><button>Model</button></div><div class="form-stack"><label>Profile name<input id="profile-name" value="${esc(selected.name)}"></label><label>Role<input id="profile-role" value="${esc(selected.role)}"></label><label>Profession<input id="profile-profession" value="${esc(selected.profession||selected.role)}"></label><label>Instructions<textarea id="profile-instructions">${esc(selected.instructions||'')}</textarea></label><label>Model override<input id="profile-model" value="${esc(selected.model||'')}" placeholder="Use swarm default"></label><label>Tools<div class="pill-row">${(selected.tools||[]).map(v=>`<span>${esc(v)}</span>`).join('')}</div></label></div><div class="button-row"><button class="ghost-button" id="remove-profile" ${selected.id==='admin'?'disabled':''}>Remove</button><button class="primary-button" id="save-profile">Save changes</button></div>`,'profile-settings')}
      ${panel('YOUR SWARM','ADAPTABLE · EXTENSIBLE',`<div class="big-number">${agents.length}<small>PERSISTENT PROFILES</small></div><div class="big-number">∞<small>EXPAND WITH CUSTOM PROFILES</small></div><p>Profiles live in the actual Eutrya swarm configuration. Changes here are persisted by the backend and used on the next routed task.</p>`,'swarm-summary')}
    </div></div>`
  }

  function memoryPage() {
    const q=state.memoryQuery.toLowerCase(), items=memoryItems().filter(x=>(x.text||'').toLowerCase().includes(q)), ws=workspace()
    const counts=[Math.max(1,Math.ceil(items.length*.25)),ws.tasks?.length||0,ws.findings?.length||0,ws.decisions?.length||0,ws.messages?.length||0,ws.artifacts?.length||0]
    return `<div class="page">${readinessBanner()}<div class="memory-layout">
      ${panel('MEMORY OVERVIEW','PERSISTENT',`<div class="memory-stat"><strong>${memoryItems().length}</strong><span>APPROVED MEMORIES</span></div><div class="memory-stat"><strong>${ws.messages?.length||0}</strong><span>SWARM MESSAGES</span></div><div class="memory-stat"><strong>${ws.tasks?.length||0}</strong><span>WORKSPACE TASKS</span></div><div class="memory-stat"><strong>${state.backend?.memory?.skills?.length||0}</strong><span>ACTIVE SKILLS</span></div><div class="divider"></div><strong class="section-label">SOURCES</strong>${['Persistent memory','Conversations','Tasks','Findings','Decisions','Artifacts'].map((x,i)=>`<button class="filter ${i===0?'active':''}">${esc(x)} ${counts[i]||0}</button>`).join('')}`,'memory-overview')}
      ${panel('MEMORY MAP','GRAPH · LIVE',`<div class="memory-map"><div class="memory-core">PERSISTENT<br>MEMORY<small>CONTEXT · KNOWLEDGE · EXPERIENCE</small></div>${memoryNodes.map((n,i)=>`<div class="memory-node node-${i}"><strong>${esc(n[0])}</strong><span>${counts[i]||0} NODES</span><small>${esc(n[2])}</small></div>`).join('')}<div class="memory-web"></div></div>`,'memory-map-panel')}
      ${panel('MEMORY DETAIL',items.length?'MATCHED':'READY',`<div class="detail-body"><h3>${items[0]?esc(items[0].text.slice(0,90)):'Approved long-term memory'}</h3>${items[0]?`<span class="pill">${esc(items[0].source||'memory')}</span><p class="microcopy">${esc(items[0].at||'')}</p><div class="divider"></div><p>${esc(items[0].text)}</p><button class="ghost-button" data-forget="${esc(items[0].id)}">Forget this memory</button>`:'<p>Memories added here become real backend memory and are available to the runtime as user-approved context.</p>'}<div class="divider"></div><strong>RECENT FINDINGS</strong>${(ws.findings||[]).slice(-3).map(f=>`<div class="linked-memory">${esc(f.topic)}<small>${esc(f.author)}</small></div>`).join('')}</div>`,'memory-detail')}
      ${panel('MEMORY SEARCH & RECALL','SEMANTIC',`<div class="searchbox">⌕ <input id="memory-search" value="${esc(state.memoryQuery)}" placeholder="Search persistent memory…"></div><div class="memory-add"><input id="memory-add-input" placeholder="Add an approved memory…"><button id="memory-add" class="primary-button">Remember</button></div><div class="recent-memory">${items.slice(-8).reverse().map(x=>`<div class="memory-tile"><span>${esc(x.source||'memory')}</span><strong>${esc(x.text)}</strong></div>`).join('')||'<div class="memory-tile"><span>EMPTY</span><strong>No matching persistent memories.</strong></div>'}</div>`,'memory-search')}
    </div></div>`
  }

  function toolsPage() {
    const active=toolDefs.find(t=>t[0]===state.selectedTool)||toolDefs[0]
    const profiles=agents.filter(a=>a.enabled!==false), available=new Map()
    for(const p of profiles) for(const t of (p.tools||[])){const display=toolNameMap[t]||t;available.set(display,(available.get(display)||0)+1)}
    const liveTools=[...toolDefs]
    return `<div class="page">${readinessBanner()}<div class="tools-layout">
      ${panel('TOOL LIBRARY','LIVE PROFILE PERMISSIONS',`<div class="tool-grid">${liveTools.map(([name,icon,verbs])=>`<button class="tool-card ${state.selectedTool===name?'selected':''}" data-tool="${esc(name)}"><div class="tool-title"><b>${icon}</b><strong>${esc(name)}</strong><span class="dot ${available.has(name)?'green':'navy'}"></span></div><div class="tool-art"></div><div class="agent-verbs">${verbs.map(v=>`<span>${esc(v)}</span>`).join('')}</div><small>${available.get(name)||0}/${profiles.length} agent profiles</small></button>`).join('')}</div>`,'tool-library')}
      ${panel('TOOL DETAILS',available.has(state.selectedTool)?'AVAILABLE':'NOT ASSIGNED',`<div class="tool-detail-body"><div class="tool-detail-title"><b>${active[1]}</b><div><h3>${esc(active[0])}</h3><small>Eutrya native runtime</small></div></div><p>Tool access is enforced by the backend profile and the Jev decision ticket. Effectful actions still require the runtime permission gate.</p><div class="divider"></div><label>Assigned profiles <strong>${available.get(state.selectedTool)||0}</strong></label><label>Workspace writes <strong>${state.backend?.config?.autoWrite?'Auto-approved':'Approval required'}</strong></label><label>Process execution <strong>${state.backend?.config?.allowExec?'Offered':'Disabled'}</strong></label><label>Jev compaction <strong>${state.backend?.config?.jevCompaction?'Enabled':'Disabled'}</strong></label><div class="collapsible">› PERMISSION GATE <span>state-bound tickets</span></div><div class="collapsible">› CONNECTED PROVIDER <span>${esc(state.backend?.config?.mainProvider||'none')}</span></div><div class="collapsible">› WORKSPACE <span>${esc((state.backend?.config?.workspace||'').split('/').pop()||'local')}</span></div></div>`,'tool-details')}
      ${panel('ACTIVE TOOLCHAIN','REAL RUNTIME',['User Request','Jev Attention','Text Model','Jev Ranking','Decision Gate','Toolbox','Observation'].map((x,i)=>`<div class="chain-item"><span>${esc(x)}</span>${i<6?'<b>→</b>':''}</div>`).join(''),'toolchain')}
      ${panel('TOOL ACTIVITY','LIVE',recentEvents().filter(e=>e.type==='observation').slice(-8).reverse().map(e=>`<div class="activity-item"><span class="dot green"></span><time>${new Date(e.at).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</time><span>${esc(eventLabel(e))}</span><strong>Recorded</strong></div>`).join('')||'<div class="note">No tool observations yet.</div>','tool-activity')}
      ${panel('EXECUTION CONSOLE','EVENT STREAM',`<pre>${recentEvents().slice(-10).map(e=>`> ${new Date(e.at).toLocaleTimeString()}  ${eventLabel(e)}`).join('\n')||'> Waiting for runtime events…'}\n▌</pre>`,'console-panel')}
    </div></div>`
  }

  function settingsPage() {
    const cat=state.settingsCategory, cfg=state.backend?.config||{}, r=state.backend?.readiness||{}
    const checks=[['autoWrite','Auto-approve workspace writes'],['allowExec','Offer local process execution'],['jevCompaction','Use Jev compaction']]
    return `<div class="page"><div class="settings-layout">
      ${panel('','',settingCategories.map(([name,icon,sub])=>`<button class="settings-cat ${cat===name?'active':''}" data-setting="${name}"><b>${icon}</b><span><strong>${name}</strong><small>${sub}</small></span></button>`).join(''),'settings-nav')}
      ${panel(`${cat.toUpperCase()} SETTINGS`,'LIVE BACKEND CONFIGURATION',`<div class="settings-body">${readinessBanner()}<p class="settings-lead">These controls now talk directly to Eutrya Native. Secrets are never returned to the UI; the app only reports whether the configured environment variable is present.</p><div class="settings-section"><strong>MODEL & COGNITION</strong><div class="two-col embedded-grid"><label>Provider<select id="setting-provider">${['vercel','chatgpt','openrouter','compatible','ollama'].map(x=>`<option ${cfg.mainProvider===x?'selected':''}>${x}</option>`).join('')}</select></label><label>Main model<input id="setting-model" value="${esc(cfg.mainModel||'')}" placeholder="provider/model"></label><label>Jev evaluator<input value="${esc(cfg.jevModel||'typesafe-ai/jev')}" readonly></label><label>Gateway key<strong class="setting-value ${cfg.jevKeyPresent?'ok':'warn'}">${cfg.jevKeyPresent?'PRESENT':'MISSING'}</strong></label><label>Set Jev / Vercel key<input id="setting-jev-key" type="password" placeholder="vck_… (stored locally, never returned)"></label><label><span>Credential store</span><button class="ghost-button" id="save-jev-key">Save AI_GATEWAY_API_KEY</button></label>${cfg.mainKeyEnv&&cfg.mainKeyEnv!=='AI_GATEWAY_API_KEY'?`<label>Set ${esc(cfg.mainKeyEnv)}<input id="setting-provider-key" type="password" placeholder="Stored locally"></label><label><span>Provider credential</span><button class="ghost-button" id="save-provider-key">Save ${esc(cfg.mainKeyEnv)}</button></label>`:''}</div></div><div class="settings-section"><strong>PERMISSIONS & MEMORY</strong>${checks.map(([k,label])=>`<label class="check-row"><input type="checkbox" data-runtime-pref="${k}" ${cfg[k]?'checked':''}><span>${label}</span></label>`).join('')}</div><div class="settings-section"><strong>WORKSPACE</strong><label>Active workspace<input id="setting-workspace" value="${esc(cfg.workspace||backend.info?.workspace||'')}"></label><button class="ghost-button" id="switch-workspace">Switch workspace</button></div><div class="settings-section two-col"><label>Max steps<input id="setting-max-steps" type="number" min="1" max="500" value="${esc(cfg.maxSteps||24)}"></label><label>Max calls<input id="setting-max-calls" type="number" min="1" max="10000" value="${esc(cfg.maxCalls||150)}"></label><label>Output tokens<input id="setting-output" type="number" min="256" max="64000" value="${esc(cfg.maxOutputTokens||6144)}"></label><label>Timeout (ms)<input id="setting-timeout" type="number" min="100" max="600000" value="${esc(cfg.timeoutMs||90000)}"></label></div><div class="button-row"><button class="ghost-button" id="restart-runtime">Restart bridge</button><button class="primary-button" id="apply-runtime-settings">Apply runtime settings</button></div></div>`,'settings-main')}
      ${panel(`RUNTIME STATUS`,'',`<div class="settings-help-body"><p><strong>${r.ready?'READY':'NOT READY'}</strong><br>${esc(r.error||'Native swarm connected.')}</p><div class="divider"></div><strong>CONFIG</strong><ul><li>Node ${esc(r.node||'unknown')}</li><li>Mode: ${esc(r.mode||'offline')}</li><li>Provider: ${esc(cfg.mainProvider||'none')}</li><li>Model: ${esc(cfg.mainModel||'not configured')}</li><li>Config: ${esc(cfg.configFile||'')}</li></ul><div class="divider"></div><strong>SECURITY</strong><p>The desktop bridge binds only to 127.0.0.1, accepts the Eutrya desktop request header, and never exposes API keys.</p></div>`,'settings-help')}
    </div></div>`
  }

  function approvalOverlay() {
    const row=state.backend?.approvals?.[0]
    if(!row) return ''
    const a=row.action||{}
    return `<div class="approval-overlay"><div class="approval-card"><div class="eyebrow">OPERATOR APPROVAL REQUIRED</div><h2>${esc(a.type||'Effectful action')}</h2><p>Eutrya is waiting before performing this exact action.</p><pre>${esc(JSON.stringify(a,null,2))}</pre><div class="button-row"><button class="ghost-button" data-approval="${esc(row.id)}" data-approved="false">Deny</button><button class="primary-button" data-approval="${esc(row.id)}" data-approved="true">Approve once</button></div></div></div>`
  }

  function pageBody(){return ({dashboard:dashboardPage,swarm:swarmPage,library:libraryPage,memory:memoryPage,tools:toolsPage,settings:settingsPage}[state.page])()}

  function render(){
    $('#app').innerHTML=`<div class="app-shell">${chrome()}<div class="app-body">${sidebar()}<main class="workspace">${header()}<div class="workspace-scroll">${pageBody()}</div><footer class="app-footer"><span>ETR-021 &nbsp;//&nbsp; ${state.page.toUpperCase()} INTERFACE &nbsp;//&nbsp; ${state.backend?.readiness?.mode?.toUpperCase()||'LOCAL'} RUNTIME</span><span>${state.backend?.connected?'BACKEND LINKED':'BACKEND DISCONNECTED'} &nbsp;■</span></footer></main></div>${approvalOverlay()}</div>`
    bind()
  }

  async function sendChat(){
    const input=$('#chat-input'),text=input?.value.trim();if(!text||state.busy)return
    state.busy=true;state.pendingText=text;render()
    try {const target=state.selectedAgent==='admin'?null:state.selectedAgent;const payload=await backend.chat(text,target);applyBackend(payload.state);state.notice=''}
    catch(err){if(err.payload?.state)applyBackend(err.payload.state);state.notice=err.message}
    finally{state.busy=false;state.pendingText='';render();setTimeout(()=>$('#chat-input')?.focus(),0)}
  }

  function bind(){
    $$('[data-page]').forEach(btn=>btn.addEventListener('click',()=>{state.page=btn.dataset.page;render()}))
    $('#reload')?.addEventListener('click',async e=>{e.currentTarget.classList.add('pulse');try{applyBackend(await backend.reload())}catch(err){state.notice=err.message}finally{setTimeout(()=>e.currentTarget?.classList.remove('pulse'),260);render()}})
    $$('[data-agent]').forEach(btn=>btn.addEventListener('click',async()=>{
      if(state.page==='library'){state.selectedProfile=btn.dataset.agent;render();return}
      state.selectedAgent=btn.dataset.agent;render();if(isReady())try{const p=await backend.focus(btn.dataset.agent);applyBackend(p.state)}catch{}
    }))
    $$('[data-template]').forEach(btn=>btn.addEventListener('click',async()=>{try{const p=await backend.template(btn.dataset.template);applyBackend(p.state);state.selectedAgent=p.state?.swarm?.matrix?.activeFocus||'admin';render()}catch(err){state.notice=err.message;render()}}))
    $$('[data-tool]').forEach(btn=>btn.addEventListener('click',()=>{state.selectedTool=btn.dataset.tool;render()}))
    $$('[data-setting]').forEach(btn=>btn.addEventListener('click',()=>{state.settingsCategory=btn.dataset.setting;render()}))
    const search=$('#memory-search');if(search)search.addEventListener('input',e=>{state.memoryQuery=e.target.value;const pos=e.target.selectionStart;render();const n=$('#memory-search');if(n){n.focus();n.setSelectionRange(pos,pos)}})
    $('#send-chat')?.addEventListener('click',sendChat);$('#chat-input')?.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendChat()}})
    $('#stop-chat')?.addEventListener('click',async()=>{try{await backend.stop()}finally{state.busy=false;state.pendingText='';await refresh()}})
    $('#memory-add')?.addEventListener('click',async()=>{const text=$('#memory-add-input')?.value.trim();if(!text)return;try{const p=await backend.remember(text);applyBackend(p.state);render()}catch(err){state.notice=err.message;render()}})
    $$('[data-forget]').forEach(btn=>btn.addEventListener('click',async()=>{try{const p=await backend.forget(btn.dataset.forget);applyBackend(p.state);render()}catch(err){state.notice=err.message;render()}}))
    $('#save-profile')?.addEventListener('click',async()=>{const id=state.selectedProfile;try{const p=await backend.updateAgent(id,{name:$('#profile-name').value.trim(),role:$('#profile-role').value.trim(),profession:$('#profile-profession').value.trim(),instructions:$('#profile-instructions').value,model:$('#profile-model').value.trim()||null});applyBackend(p.state);render()}catch(err){state.notice=err.message;render()}})
    $('#remove-profile')?.addEventListener('click',async()=>{const id=state.selectedProfile;if(id==='admin')return;try{const p=await backend.removeAgent(id);applyBackend(p.state);state.selectedProfile=agents[0]?.id||'admin';render()}catch(err){state.notice=err.message;render()}})
    $('#add-profile')?.addEventListener('click',async()=>{const name=prompt('New agent name');if(!name)return;const id=name.toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,32)||`agent-${Date.now().toString(36)}`;try{const p=await backend.addAgent({id,name:name.slice(0,64),role:'Custom specialist',profession:'Custom specialist',instructions:'Complete tasks within your assigned specialty, share evidence with the swarm, and do not claim unobserved success.',model:null,tools:['list','read','search','browser','note','recall','ask','finish','delegate','send_message','publish_finding','record_decision','update_task','consult_swarm'],enabled:true});applyBackend(p.state);state.selectedProfile=id;render()}catch(err){state.notice=err.message;render()}})
    $$('[data-approval]').forEach(btn=>btn.addEventListener('click',async()=>{try{const p=await backend.approve(btn.dataset.approval,btn.dataset.approved==='true');applyBackend(p.state);render()}catch(err){state.notice=err.message;render()}}))
    $('#apply-runtime-settings')?.addEventListener('click',async()=>{const patch={mainProvider:$('#setting-provider').value,mainModel:$('#setting-model').value.trim(),maxSteps:Number($('#setting-max-steps').value),maxCalls:Number($('#setting-max-calls').value),maxOutputTokens:Number($('#setting-output').value),timeoutMs:Number($('#setting-timeout').value)};$$('[data-runtime-pref]').forEach(x=>patch[x.dataset.runtimePref]=x.checked);try{applyBackend(await backend.settings(patch));render()}catch(err){if(err.payload?.state)applyBackend(err.payload.state);state.notice=err.message;render()}})
    $('#save-jev-key')?.addEventListener('click',async()=>{const value=$('#setting-jev-key')?.value.trim();if(!value)return;try{applyBackend(await backend.credential('AI_GATEWAY_API_KEY',value));render()}catch(err){if(err.payload?.state)applyBackend(err.payload.state);state.notice=err.message;render()}})
    $('#save-provider-key')?.addEventListener('click',async()=>{const value=$('#setting-provider-key')?.value.trim();const name=state.backend?.config?.mainKeyEnv;if(!value||!name)return;try{applyBackend(await backend.credential(name,value));render()}catch(err){if(err.payload?.state)applyBackend(err.payload.state);state.notice=err.message;render()}})
    $('#switch-workspace')?.addEventListener('click',async()=>{const value=$('#setting-workspace')?.value.trim();if(!value)return;try{await backend.setWorkspace(value);await refresh()}catch(err){state.notice=err.message;render()}})
    $('#restart-runtime')?.addEventListener('click',async()=>{try{await backend.restart();await refresh()}catch(err){state.notice=err.message;render()}})
    $$('[data-window]').forEach(btn=>btn.addEventListener('click',()=>windowAction(btn.dataset.window)))
  }

  async function windowAction(action){try{const w=window.__TAURI__?.window?.getCurrentWindow?.();if(!w)return;if(action==='min')await w.minimize();if(action==='max')await w.toggleMaximize();if(action==='close')await w.close()}catch{}}

  async function boot(){
    render()
    await backend.connect()
    await refresh()
    setInterval(()=>refresh({rerender:true}),1800)
  }
  boot()
})()
