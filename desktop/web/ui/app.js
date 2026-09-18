/* Persistent shell, delegated events, actual backend adapters. No demo fallback. */
(() => {
  'use strict';
  const U=window.EutryaUI,B=window.EutryaBackend;
  const {esc,icon,button,field,miniButton,model,views,PAGES,shell}=U;
  const $=q=>document.querySelector(q);
  let prefs={density:'comfortable',reducedMotion:false};
  try{const stored=JSON.parse(localStorage.getItem('eutrya.ui.preferences')||'{}');prefs={density:stored.density==='compact'?'compact':'comfortable',reducedMotion:stored.reducedMotion===true}}catch{/* Private browsing can disable storage. */}
  const state={page:PAGES.includes(location.hash.slice(1))?location.hash.slice(1):'dashboard',payload:null,connected:false,connecting:true,error:'',agent:'admin',profile:'engineer',profileDraft:null,profileDirty:false,settingsDraft:null,settingsDirty:false,settingsSection:'all',workspaceDraft:null,libraryQuery:'',libraryFilter:'all',libraryView:'grid',tool:'browser',toolQuery:'',toolCategory:'All',memoryQuery:'',source:'all',memorySelected:null,networkView:'map',zoom:1,chatDraft:'',chatAfter:null,busy:false,pendingText:'',prefs};
  let pollTimer,queryTimer,noticeTimer,refreshing=false,signature='',lastPage=null,activeApproval=null;
  const pending=new Set();
  $('#app').innerHTML=shell();
  function applyPreferences(){document.documentElement.dataset.density=state.prefs.density;document.documentElement.classList.toggle('reduced-motion',state.prefs.reducedMotion)}
  function notify(message,error=false){const n=$('#notice');n.textContent=String(message);n.classList.toggle('error',error);n.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{n.hidden=true},error?10000:4000)}
  function receive(data){const p=data?.state||data;if(!p?.readiness)return;state.payload=p;state.connected=true;state.error='';state.connecting=false;if(!state.settingsDirty)state.settingsDraft={...(p.config||{})};const list=p.swarm?.profiles||[];if(list.length&&!list.some(a=>a.id===state.agent))state.agent=list[0].id;if(list.length&&!list.some(a=>a.id===state.profile)){state.profile=list[0].id;state.profileDraft=null;state.profileDirty=false}if(!state.profileDirty)state.profileDraft={...(list.find(a=>a.id===state.profile)||{})};updateChrome();showApproval()}
  function updateChrome(){const m=model(state),c=$('#connection-label');const label=state.connecting?'CONNECTING':!state.connected?'DISCONNECTED':m.r.demo?'DEMO RUNTIME':m.ready?'RUNTIME LINKED':'SETUP REQUIRED';c.textContent='LOCAL  ·  '+label;c.prepend(document.createElement('i'));c.className='connection-label '+(m.r.demo?'demo':m.ready?'ready':'');document.title=`Eutrya — ${U.title(state.page)}`}
  function captureFocus(){const a=document.activeElement;if(!a||!$('#page-content').contains(a))return null;return {id:a.id,name:a.name,start:a.selectionStart,end:a.selectionEnd}}
  function render({preserve=true}={}){
    const focus=preserve?captureFocus():null,scroller=$('#main-scroll');const y=scroller.scrollTop;
    const scrolls=[...document.querySelectorAll('.chat-feed,.archive-list')].map(el=>({cls:el.className.split(' ')[0],top:el.scrollTop}));
    try{$('#page-content').innerHTML=views[state.page](state)}catch(err){console.error('Eutrya view failed',err);$('#page-content').innerHTML=`<div class="runtime-banner"><p>Could not render this page: ${esc(err.message)}</p>${button('Dashboard','page-dashboard')}</div>`;notify('Page render failed: '+err.message,true)}
    for(const el of document.querySelectorAll('.nav-link')){if(el.dataset.page===state.page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current')}
    $('#footer-page').textContent=state.page.toUpperCase();updateChrome();applyPreferences();
    if(preserve&&lastPage===state.page){scroller.scrollTop=y;for(const item of scrolls){const node=$('.'+item.cls);if(node)node.scrollTop=item.top}}else scroller.scrollTop=0;
    if(focus){const next=focus.id?document.getElementById(focus.id):[...document.querySelectorAll('#page-content [name]')].find(x=>x.name===focus.name);if(next){next.focus({preventScroll:true});try{if(focus.start!=null)next.setSelectionRange(focus.start,focus.end)}catch{/* Select and numeric inputs have no text selection. */}}}
    lastPage=state.page;
  }
  async function refresh(force=false){if(refreshing)return;refreshing=true;try{const p=await B.state();const next=JSON.stringify(p),changed=next!==signature||!state.connected;signature=next;receive(p);const editing=state.settingsDirty||state.profileDirty||document.activeElement?.matches('input,textarea,select')||Boolean(window.getSelection()?.toString());if(changed&&(force||!editing))render()}catch(err){state.connected=false;state.connecting=false;state.error=err.message;updateChrome();if(force||!document.activeElement?.matches('input,textarea,select'))render()}finally{refreshing=false}}
  async function mutation(key,fn,success=''){if(pending.has(key))return false;pending.add(key);try{const result=await fn();receive(result);if(success)notify(success);render();return true}catch(err){if(err.payload)receive(err.payload);state.error=err.message;notify(err.message,true);render();return false}finally{pending.delete(key)}}
  function navigate(page){if(!PAGES.includes(page))return;state.page=page;try{history.replaceState(null,'','#'+page)}catch{}render({preserve:false})}
  function dialog(title,body,footer='',name='EUTRYA / OPERATOR'){
    const d=$('#ui-dialog');if(d.open)d.close();d.innerHTML=`<div class="modal-head"><span>${esc(name)}</span>${miniButton('Close dialog','dismiss','close')}</div><h2>${esc(title)}</h2>${body}${footer}`;d.showModal();return d;
  }
  function closeDialog(){const d=$('#ui-dialog');if(d.open)d.close();d.innerHTML=''}
  function confirmAction(title,text,key,attrs=''){dialog(title,`<p>${esc(text)}</p>`,`<div class="form-actions">${button('Cancel','dismiss')}${button('Confirm',key,{primary:true,attrs})}</div>`)}
  function showApproval(){const row=state.payload?.approvals?.[0],d=$('#approval-dialog');if(!row){if(d.open)d.close();activeApproval=null;return}if(activeApproval===row.id)return;activeApproval=row.id;d.innerHTML=`<p class="eyebrow">HUMAN APPROVAL REQUIRED</p><h2>${esc(row.action?.type||'Runtime action')}</h2><p>The runtime is paused before this specific action. The interface will not approve it automatically.</p><pre>${esc(JSON.stringify(row.action||{},null,2))}</pre><div class="form-actions">${button('Deny','approval-deny',{attrs:`data-id="${esc(row.id)}"`})}${button('Approve once','approval-yes',{primary:true,attrs:`data-id="${esc(row.id)}"`})}</div>`;if(!d.open)d.showModal()}
  function syncDraft(target){const name=target.name;if(!name)return;const value=target.type==='checkbox'?target.checked:target.type==='number'?Number(target.value):target.value;
    if(target.closest('#profile-form')){state.profileDraft={...(state.profileDraft||{}),[name]:value};state.profileDirty=true;const note=$('.form-footnote');if(note)note.textContent='Unsaved changes'}
    if(target.closest('#settings-form')){
      if(target.matches('[data-secret]'))return;
      if(['density','reducedMotion'].includes(name)){state.prefs[name]=value;applyPreferences();try{localStorage.setItem('eutrya.ui.preferences',JSON.stringify(state.prefs))}catch{}return}
      if(name==='workspace'){state.workspaceDraft=value;return}
      state.settingsDraft={...(state.settingsDraft||{}),[name]:value};state.settingsDirty=true;const label=$('.save-state');if(label)label.textContent='UNSAVED CHANGES';const discard=$('[data-action="discard-settings"]');if(discard)discard.disabled=false;
    }
  }
  async function send(){const text=(state.chatDraft||'').trim();if(!text||state.busy||!model(state).ready)return;state.busy=true;state.pendingText='Waiting for a reply from '+(model(state).agents.find(a=>a.id===state.agent)?.name||'Admin')+'…';render();try{const out=await B.chat(text,state.agent==='admin'?null:state.agent);receive(out);state.chatDraft=''}catch(err){if(err.payload)receive(err.payload);notify(err.message,true)}finally{state.busy=false;state.pendingText='';render();const feed=$('#chat-feed');if(feed)feed.scrollTop=feed.scrollHeight;$('#chat-input')?.focus()}}
  async function saveSettings(){const m=model(state),d=state.settingsDraft||{};const limits={maxSteps:[1,500],maxCalls:[1,10000],maxOutputTokens:[256,64000],timeoutMs:[100,600000]};for(const [k,[lo,hi]]of Object.entries(limits)){if(!Number.isInteger(Number(d[k]))||d[k]<lo||d[k]>hi){notify(`${k} must be a whole number between ${lo} and ${hi}.`,true);return}}if(!String(d.mainModel||'').trim()&&d.mainProvider!=='chatgpt'){notify('Enter the main model identifier.',true);return}confirmAction('Apply runtime settings?','This saves your provider, model, limits, and permission choices, then reloads the runtime. Active work may be interrupted.','confirm-settings')}
  async function chooseAgent(id){if(state.page==='library'){if(state.profileDirty&&id!==state.profile){confirmAction('Discard profile edits?','The current profile has unsaved changes. Switch without saving?','confirm-profile-switch',`data-id="${esc(id)}"`);return}state.profile=id;state.profileDirty=false;state.profileDraft={...(model(state).agents.find(a=>a.id===id)||{})};render();return}state.agent=id;render();if(model(state).ready)await mutation('focus',()=>B.focus(id))}
  async function windowAction(action){try{const w=window.__TAURI__?.window?.getCurrentWindow?.();if(!w){notify('Native window controls are available inside the desktop app.');return}if(action==='min')await w.minimize();if(action==='max')await w.toggleMaximize();if(action==='close')await w.close();if(action==='drag')await w.startDragging()}catch(err){notify('Window action failed: '+(err.message||err),true)}}
  // Manual titlebar dragging: no competing data-tauri-drag-region handler.
  $('#titlebar').addEventListener('mousedown',event=>{if(event.button!==0||event.target.closest('button,input,a'))return;if(window.__TAURI__)void windowAction(event.detail===2?'max':'drag')});
  async function action(name,el){
    if(name.startsWith('page-'))return navigate(name.slice(5));
    if(name.startsWith('window-'))return windowAction(name.slice(7));
    switch(name){
      case 'dismiss':return closeDialog();
      case 'open-settings':return navigate('settings');
      case 'reload':return mutation('reload',()=>B.reload(),'Runtime reloaded.');
      case 'stop':await mutation('stop',()=>B.stop(),'Stop requested.');return refresh(true);
      case 'reconnect':state.connecting=true;render();await B.connect();return refresh(true);
      case 'focus-chat':navigate('dashboard');return $('#chat-input')?.focus();
      case 'clear-chat':state.chatAfter=Date.now();render();return notify('Conversation hidden in this view. Stored history was not deleted.');
      case 'open-agent-chat':state.agent=el.dataset.id;navigate('dashboard');$('#chat-input')?.focus();return;
      case 'network-map':state.networkView='map';return render();
      case 'network-list':state.networkView='list';return render();
      case 'zoom-in':state.zoom=Math.min(1.4,Math.round((state.zoom+.1)*10)/10);return render();
      case 'zoom-out':state.zoom=Math.max(.7,Math.round((state.zoom-.1)*10)/10);return render();
      case 'library-all':state.libraryFilter='all';return render();
      case 'library-enabled':state.libraryFilter='enabled';return render();
      case 'library-list':state.libraryView='list';return render();
      case 'library-grid':state.libraryView='grid';return render();
      case 'confirm-profile-switch':state.profile=el.dataset.id;state.profileDirty=false;state.profileDraft={...(model(state).agents.find(a=>a.id===state.profile)||{})};closeDialog();return render();
      case 'add-agent':if(!model(state).ready)return notify('Connect the runtime to add a profile.',true);dialog('A new mind in the swarm',`<form id="new-agent-form">${field('Name','name','',{attrs:'required maxlength="64"',placeholder:'Design researcher'})}${field('Specialty / role','role','',{attrs:'required maxlength="120"',placeholder:'Research and synthesis'})}<label class="field"><span>Instructions</span><textarea name="instructions" rows="4" required placeholder="Describe the agent’s responsibility and boundaries."></textarea></label><div class="form-actions">${button('Cancel','dismiss',{attrs:'type="button"'})}<button type="submit" class="btn primary">Create profile</button></div></form>`);return;
      case 'remove-agent':return confirmAction('Remove this profile?','The selected non-admin profile will be removed from the runtime.','confirm-remove-agent',`data-id="${esc(state.profile)}"`);
      case 'confirm-remove-agent':{const id=el.dataset.id;if(id==='admin')return;closeDialog();await mutation('remove-agent',()=>B.removeAgent(id),'Profile removed.');state.profileDirty=false;state.profileDraft=null;render();return}
      case 'template':return confirmAction('Apply '+el.dataset.template+' template?','This changes your saved swarm configuration. Existing customizations may be replaced.','confirm-template',`data-template="${esc(el.dataset.template)}"`);
      case 'confirm-template':{const t=el.dataset.template;closeDialog();return mutation('template',()=>B.template(t),'Swarm template applied.')}
      case 'source':state.source=el.dataset.sourceName||'all';state.memorySelected=null;return render();
      case 'add-memory':if(!state.connected)return notify('Connect the bridge to save memory.',true);dialog('A thought worth keeping',`<form id="new-memory-form"><label class="field"><span>Approved persistent memory</span><textarea name="text" rows="6" required maxlength="20000" placeholder="What should Eutrya remember?"></textarea></label><p class="small muted">This becomes real, user-approved context in the runtime.</p><div class="form-actions">${button('Cancel','dismiss',{attrs:'type="button"'})}<button type="submit" class="btn primary">Remember</button></div></form>`);return;
      case 'forget-memory':return confirmAction('Forget this memory?','This removes the selected memory from the runtime store.','confirm-forget',`data-id="${esc(el.dataset.id)}"`);
      case 'confirm-forget':{const id=el.dataset.id;closeDialog();state.memorySelected=null;return mutation('forget',()=>B.forget(id),'Memory forgotten.')}
      case 'tool-category':state.toolCategory=el.dataset.category;return render();
      case 'ask-tool':{const t=U.catalog.find(t=>t.id===el.dataset.toolId);state.agent='admin';state.chatDraft=`Help me use ${t?.name||'this tool'} for the following task: `;navigate('dashboard');$('#chat-input')?.focus();return}
      case 'settings-permissions':state.settingsSection='permissions';return navigate('settings');
      case 'settings-section':state.settingsSection=el.dataset.section;return render();
      case 'discard-settings':state.settingsDirty=false;state.settingsDraft={...(state.payload?.config||{})};return render();
      case 'confirm-settings':{closeDialog();const d=state.settingsDraft;const patch={};for(const k of ['mainProvider','mainModel','maxSteps','maxCalls','maxOutputTokens','timeoutMs','autoWrite','allowExec','jevCompaction'])if(d[k]!==undefined)patch[k]=d[k];const ok=await mutation('settings',()=>B.settings(patch),'Runtime settings applied.');if(ok){state.settingsDirty=false;state.settingsDraft={...(state.payload?.config||{})};render()}return}
      case 'save-jev-key':case 'save-provider-key':{const isJev=name==='save-jev-key',input=$(`[data-secret="${isJev?'jev':'provider'}"]`),value=input?.value.trim(),key=isJev?'AI_GATEWAY_API_KEY':state.payload?.config?.mainKeyEnv;if(!value||!key)return notify('Enter the credential first.',true);const ok=await mutation('credential',()=>B.credential(key,value),'Credential saved by runtime.');if(ok&&input)input.value='';return}
      case 'switch-workspace':return confirmAction('Switch workspace?','The bridge will restart in the selected folder. Current work may be interrupted.','confirm-workspace');
      case 'confirm-workspace':{const path=String(state.workspaceDraft??state.payload?.config?.workspace??'').trim();if(!path)return notify('Enter a workspace path.',true);closeDialog();const ok=await mutation('workspace',()=>B.setWorkspace(path),'Workspace switched.');if(ok)await refresh(true);return}
      case 'activity':{const events=model(state).events;dialog('Runtime activity',`<div class="activity-list">${events.slice().reverse().map(e=>`<div><time>${U.time(e.at)}</time><span>${esc(U.eventLabel(e))}</span></div>`).join('')||'<p>No events recorded.</p>'}</div>`);return}
      case 'approval-yes':case 'approval-deny':return mutation('approval-'+el.dataset.id,()=>B.approve(el.dataset.id,name==='approval-yes'),'Approval decision recorded.');
    }
  }
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;if(!target)return;
    const nav=target.closest('[data-page]');if(nav){event.preventDefault();navigate(nav.dataset.page);return}
    const a=target.closest('[data-action]');if(a&&!a.disabled){event.preventDefault();Promise.resolve(action(a.dataset.action,a)).catch(err=>notify(err.message||err,true));return}
    const agent=target.closest('[data-agent]');if(agent){event.preventDefault();void chooseAgent(agent.dataset.agent);return}
    const memory=target.closest('[data-memory]');if(memory){state.memorySelected=memory.dataset.memory;render();return}
    const source=target.closest('[data-source]');if(source){state.source=source.dataset.source;state.memorySelected=null;navigate('memory');return}
    const tool=target.closest('[data-tool]');if(tool){state.tool=tool.dataset.tool;render()}
  });
  document.addEventListener('input',event=>{const t=event.target;if(!(t instanceof Element))return;syncDraft(t);if(t.id==='chat-input')state.chatDraft=t.value;if(t.matches('[data-query]')){state[t.dataset.query]=t.value;clearTimeout(queryTimer);queryTimer=setTimeout(()=>render(),100)}});
  document.addEventListener('change',event=>{if(event.target instanceof Element)syncDraft(event.target)});
  document.addEventListener('submit',event=>{event.preventDefault();const f=event.target;
    if(f.id==='chat-form'){void send();return}
    if(f.id==='settings-form'){void saveSettings();return}
    if(f.id==='profile-form'){if(!f.reportValidity())return;const id=state.profile;const d={...state.profileDraft};const patch={name:d.name,role:d.role,profession:d.profession,instructions:d.instructions,model:String(d.model||'').trim()||null};void mutation('profile',()=>B.updateAgent(id,patch),'Profile saved.').then(ok=>{if(ok){state.profileDirty=false;state.profileDraft={...(model(state).agents.find(a=>a.id===id)||{})};render()}});return}
    if(f.id==='new-memory-form'){const text=new FormData(f).get('text')?.trim();if(!text)return;void mutation('remember',()=>B.remember(text),'Memory saved.').then(ok=>{if(ok){closeDialog();state.source='memories';navigate('memory')}});return}
    if(f.id==='new-agent-form'){const d=Object.fromEntries(new FormData(f));const name=String(d.name||'').trim();if(!name)return;const root=name.toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,26)||'agent';let id=root;const ids=new Set(model(state).agents.map(a=>a.id));if(ids.has(id))id+=`-${Date.now().toString(36).slice(-5)}`;const base=model(state).agents.find(a=>a.id==='researcher')||model(state).agents[0];const profile={id,name,role:d.role,profession:d.role,instructions:d.instructions,model:null,tools:[...(base?.tools||['read','search','recall','ask','finish'])],enabled:true};void mutation('add-agent',()=>B.addAgent(profile),'Agent created.').then(ok=>{if(ok){closeDialog();state.profile=id;state.profileDraft=profile;state.profileDirty=false;navigate('library')}})}
  });
  document.addEventListener('keydown',event=>{const t=event.target;if(t instanceof Element&&t.matches('[role="button"]')&&['Enter',' '].includes(event.key)){event.preventDefault();t.dispatchEvent(new MouseEvent('click',{bubbles:true}));return}if(t.id==='chat-input'&&event.key==='Enter'&&!event.shiftKey){event.preventDefault();void send();return}if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='k'){event.preventDefault();$('#library-search,#memory-search,#tool-search,#chat-input')?.focus()}if((event.ctrlKey||event.metaKey)&&/^[1-6]$/.test(event.key)){event.preventDefault();navigate(PAGES[Number(event.key)-1])}});
  $('#approval-dialog').addEventListener('cancel',e=>{e.preventDefault();notify('Choose Approve once or Deny to resolve the runtime request.')});
  window.addEventListener('hashchange',()=>{const p=location.hash.slice(1);if(PAGES.includes(p))navigate(p)});
  window.addEventListener('beforeunload',()=>clearTimeout(pollTimer));
  async function boot(){applyPreferences();render();try{await B.connect()}catch(err){state.error=err.message;state.connected=false}finally{state.connecting=false}await refresh(true);const poll=async()=>{await refresh();pollTimer=setTimeout(poll,state.connected?1800:5000)};pollTimer=setTimeout(poll,1800)}
  window.EutryaDesktop={state,navigate,render,refresh,stopPolling:()=>clearTimeout(pollTimer)};
  void boot();
})();
