/* Eutrya Studio controller. Event delegation is installed once; polling never
   replaces the titlebar, loses form drafts, or silently invents runtime data. */
(() => {
  'use strict';
  const M=window.EutryaStudio, U=window.EutryaUI, V=window.EutryaViews, api=window.EutryaBackend;
  const {state,accept,ready,agents,selectedProfile,profileDraft,config,records}=M;
  const {esc,icon,button,status}=U;
  const $=s=>document.querySelector(s);
  let refreshSerial=0, refreshBusy=false, renderPending=false, timer=null;
  $('#app').innerHTML=V.shell();
  const dialog=$('#modal');
  function preferences(){document.documentElement.dataset.density=state.preferences.density;document.documentElement.dataset.motion=state.preferences.motion;}
  preferences();
  function toast(message,error=false){const el=$('#toast');clearTimeout(state.toastTimer);el.textContent=message;el.className=`toast ${error?'error':''}`;state.toastTimer=setTimeout(()=>el.classList.add('hidden'),6500);}
  function paintChrome(){
    const build=document.querySelector("#build-version");if(build)build.textContent=state.data?.readiness?.bridgeVersion ? `v${state.data.readiness.bridgeVersion} / STUDIO` : "STUDIO / BRIDGE NOT LINKED";
    $('#connection-status').innerHTML=`<span>LOCAL</span>${status(state.connected?'LINKED':'OFFLINE',state.connected?'online':'offline')}<span>${esc(M.mode().toUpperCase())}</span>`;
    document.querySelectorAll('.primary-nav [data-page]').forEach(el=>{if(el.dataset.page===state.page)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
    document.title=`${state.page==='dashboard'?'Eutrya':state.page[0].toUpperCase()+state.page.slice(1)+' · Eutrya'}`;
  }
  function render(force=false, pageChanged=false){
    paintChrome();
    if(window.EutryaHunts?.hasOpenDialog()){renderPending=true;return;}
    const active=document.activeElement;
    if(!force && active?.matches('input,textarea,select')){renderPending=true;syncApproval();return;}
    const focus=active?.id, start=active?.selectionStart, end=active?.selectionEnd;
    const area=$('#workspace');
    const top=pageChanged?(state.scroll[state.page]||0):area.scrollTop;
    const nested={};document.querySelectorAll('[data-scroll]').forEach(el=>nested[el.dataset.scroll]=el.scrollTop);
    try { $('#page').innerHTML=V.renderPage(); }
    catch(err){$('#page').innerHTML=`<div class="notice"><div><strong>Interface rendering error</strong><p>${esc(err.message)}</p></div></div>`;console.error('Eutrya UI render failed:',err);}
    window.EutryaHunts?.bind({render:()=>render(true),refresh,applyBackend:accept,invalidate:()=>{refreshSerial++;}});
    area.scrollTop=top;
    document.querySelectorAll('[data-scroll]').forEach(el=>{el.scrollTop=nested[el.dataset.scroll]??(el.dataset.scroll==='chat'?el.scrollHeight:0);});
    if(focus && !pageChanged){const next=document.getElementById(focus);if(next){next.focus({preventScroll:true});if(typeof start==='number'&&next.setSelectionRange){try{next.setSelectionRange(start,end);}catch{/* Number inputs do not expose a selection. */}}}}
    renderPending=false;syncApproval();
  }
  async function refresh(){
    if(refreshBusy) return;
    refreshBusy=true;const serial=++refreshSerial;
    try {const data=await api.state();if(serial===refreshSerial){const changed=JSON.stringify(data)!==JSON.stringify(state.data)||!state.connected;accept(data);if(changed)render();else syncApproval();}}
    catch(err){if(serial===refreshSerial){state.connected=false;state.error=err.message||'Cannot reach the local runtime.';render();}}
    finally{refreshBusy=false;}
  }
  async function perform(key,operation,success=''){
    if(state.pending.has(key))return false;
    state.pending.add(key);refreshSerial++;
    try {const result=await operation();refreshSerial++;accept(result);state.error='';if(success)toast(success);return true;}
    catch(err){if(err.payload?.state)accept(err.payload.state);state.error=err.message||'The runtime request failed.';toast(state.error,true);return false;}
    finally{state.pending.delete(key);render(true);}
  }
  function navigate(page){
    if(!M.names.includes(page))return;
    state.scroll[state.page]=$('#workspace').scrollTop;
    state.page=page;if(location.hash!==`#${page}`)history.pushState(null,'',`#${page}`);
    render(true,true);
  }
  function updateDirty(){
    const note=$('.settings-actions>span');if(note){note.textContent='Unsaved runtime changes';note.classList.add('unsaved');}
    document.querySelectorAll('[data-action="save-config"],[data-action="discard-config"]').forEach(el=>el.disabled=!state.connected);
  }
  function modal(type,options={}){
    if(dialog.open)dialog.close();
    state.modal={type,...options};
    let title='',body='',save='Confirm',danger=false;
    if(type==='add-agent'){
      title='Create an agent';save='Create profile';
      body='<p>Add a persistent specialist to your existing native swarm.</p><div class="form-stack"><label class="form-field"><span>Name</span><input name="name" required maxlength="64" placeholder="e.g. Designer" autofocus></label><label class="form-field"><span>Role</span><input name="role" required maxlength="120" placeholder="Design & product experience"></label><label class="form-field"><span>Instructions</span><textarea name="instructions" rows="5" required>Complete work within your assigned specialty, share evidence with the swarm, and ask for clarification when needed.</textarea></label></div>';
    }else if(type==='add-memory'){
      title='Remember something';save='Save memory';body='<p>This will become user-approved context in the actual runtime.</p><label class="form-field"><span>Memory</span><textarea name="text" required maxlength="12000" rows="6" autofocus placeholder="What should Eutrya remember?"></textarea></label>';
    }else if(type==='remove-agent'){
      title='Remove agent?';save='Remove profile';danger=true;body=`<p>Remove <strong>${esc(options.name)}</strong> from the runtime configuration? This action is sent to your backend.</p>`;
    }else if(type==='forget'){
      title='Forget this memory?';save='Forget memory';danger=true;body='<p>This removes the selected memory from the runtime. Other workspace records are not affected.</p>';
    }else if(type==='template'){
      title='Apply swarm template?';save='Apply template';body=`<p>Apply the <strong>${esc(options.template)}</strong> template? This may change your agent roles and configuration.</p>`;
    }else if(type==='approval'){
      title='Operator approval';save='Approve once';body=`<p>The runtime is waiting before performing this exact action. Review it before allowing it.</p><pre class="approval-code">${esc(JSON.stringify(options.row.action||{},null,2))}</pre>`;
    }else if(type==='events'){
      title='Runtime events';body=`<pre class="approval-code">${esc(M.events().filter(e=>e.type!=='desktop.token').slice(-80).map(e=>`${M.time(e.at)}  ${M.eventLabel(e)}`).join('\n')||'No events received.' )}</pre>`;
    }
    dialog.innerHTML=`<form id="modal-form"><header class="dialog-header"><h2 id="modal-title">${title}</h2>${button('Close dialog','close-modal','close','square','type="button" aria-label="Close dialog"')}</header><div class="dialog-content">${body}</div><footer class="dialog-actions">${button(type==='approval'?'Deny':'Cancel',type==='approval'?'deny-approval':'close-modal','','','type="button"')}${type!=='events'?`<button class="btn ${danger?'danger':'primary'}" type="submit">${save}</button>`:''}</footer></form>`;
    dialog.showModal();
  }
  function syncApproval(){const row=state.data?.approvals?.find(a=>a.status==='pending');if(row&&!dialog.open&&!window.EutryaHunts?.hasOpenDialog())modal('approval',{row});}
  async function submitModal(form){
    const m=state.modal;if(!m)return;const data=new FormData(form);
    const key=`modal-${m.type}`;if(state.pending.has(key))return;
    let op;
    if(m.type==='add-agent'){
      const name=String(data.get('name')||'').trim(),role=String(data.get('role')||'').trim(),instructions=String(data.get('instructions')||'').trim();if(!name||!role||!instructions)return;
      let id=name.toLowerCase().replace(/[^a-z0-9_-]+/g,'-').replace(/^-|-$/g,'').slice(0,28)||'specialist';if(agents().some(a=>a.id===id))id+=`-${Date.now().toString(36).slice(-5)}`;
      const base=selectedProfile();
      op=()=>api.addAgent({id,name,role,profession:role,instructions,model:null,tools:base.tools,enabled:true});
      state.selectedProfile=id;
    }else if(m.type==='add-memory'){const text=String(data.get('text')||'').trim();if(!text)return;op=()=>api.remember(text);}
    else if(m.type==='remove-agent')op=()=>api.removeAgent(m.id);
    else if(m.type==='forget')op=()=>api.forget(m.id);
    else if(m.type==='template')op=()=>api.template(m.template);
    else if(m.type==='approval')op=()=>api.approve(m.row.id,true);
    if(!op)return;
    const submit=form.querySelector('[type=submit]');if(submit)submit.disabled=true;
    const ok=await perform(key,op,'Saved to the runtime.');
    if(ok){dialog.close();state.modal=null;render(true);}else if(submit)submit.disabled=false;
  }
  async function send(){
    if(!ready()||state.chatBusy)return;
    const text=state.chatDraft.trim();if(!text)return;
    const target=state.selectedAgent==='admin'?null:state.selectedAgent;
    state.chatDraft='';state.chatBusy=true;state.outbox=text;render(true);
    await perform('chat',()=>api.chat(text,target));
    state.chatBusy=false;state.outbox=null;render(true);$('#chat-draft')?.focus();
  }
  async function saveConfig(){
    const d=state.configDraft||{};
    if(!state.connected||!state.configDirty)return;
    const patch={mainProvider:String(d.mainProvider||'vercel'),mainModel:String(d.mainModel||'').trim(),autoWrite:Boolean(d.autoWrite),allowExec:Boolean(d.allowExec),jevCompaction:Boolean(d.jevCompaction)};
    const ranges={maxSteps:[1,500],maxCalls:[1,10000],maxOutputTokens:[256,64000],timeoutMs:[100,600000]};
    for(const [key,[lo,hi]] of Object.entries(ranges)){const n=Number(d[key]);if(!Number.isInteger(n)||n<lo||n>hi){toast(`${key} must be an integer between ${lo} and ${hi}.`,true);return;}patch[key]=n;}
    if(await perform('save-config',()=>api.settings(patch),'Runtime settings saved.')){state.configDirty=false;state.configDraft={...config()};render(true);}
  }
  async function windowAction(action){
    const current=window.__TAURI__?.window?.getCurrentWindow?.();if(!current){toast('Window controls are available in the native desktop app.');return;}
    try{if(action==='window-min')await current.minimize();if(action==='window-max')await current.toggleMaximize();if(action==='window-close')await current.close();}
    catch(err){toast(`Window action failed: ${err.message}`,true);}
  }
  const handlers={
    navigate:el=>navigate(el.dataset.page),
    'select-agent':el=>{const id=el.dataset.id;if(state.page==='library'){state.selectedProfile=id;state.profileTab='configuration';render(true);}else{state.selectedAgent=id;render(true);if(ready())void perform('focus',()=>api.focus(id));}},
    'agent-chat':el=>{state.selectedAgent=el.dataset.id;navigate('dashboard');if(ready())void perform('focus',()=>api.focus(el.dataset.id));},
    'network-view':el=>{state.networkView=el.dataset.view;render(true);},
    'library-view':el=>{state.libraryView=el.dataset.view;render(true);},
    'profile-tab':el=>{state.profileTab=el.dataset.tab;render(true);},
    'memory-source':el=>{state.source=el.dataset.id;state.selectedRecord=null;if(state.page!=='memory')navigate('memory');else render(true);},
    record:el=>{state.selectedRecord=el.dataset.id;render(true);},
    tool:el=>{state.selectedTool=el.dataset.name;render(true);},
    'tool-category':el=>{state.toolCategory=el.dataset.category;render(true);},
    'settings-tab':el=>{state.settingsTab=el.dataset.tab;render(true);},
    reload:()=>perform('reload',()=>api.reload(),'Runtime reloaded.'),
    stop:async()=>{await perform('stop',()=>api.stop(),'Stop requested.');state.chatBusy=false;state.outbox=null;render(true);},
    reconnect:async()=>{if(state.pending.has('reconnect'))return;await perform('reconnect',async()=>{await api.connect();return api.state();},'Bridge reconnected.');},
    restart:()=>perform('restart',async()=>{const info=await api.restart();if(info?.error)throw new Error(info.error);return api.state();},'Bridge restarted.'),
    workspace:()=>{const path=$('#workspace-path')?.value.trim();if(path)return perform('workspace',async()=>{await api.setWorkspace(path);return api.state();},'Workspace updated.');},
    'add-agent':()=>{if(ready())modal('add-agent');},
    'add-memory':()=>{if(state.connected)modal('add-memory');},
    'remove-agent':()=>{const p=selectedProfile();if(ready()&&p.id!=='admin')modal('remove-agent',{id:p.id,name:p.name});},
    forget:el=>{if(state.connected)modal('forget',{id:el.dataset.id});},
    template:el=>{if(ready())modal('template',{template:el.dataset.template});},
    'save-profile':async()=>{if(!ready())return;const p=selectedProfile(),d=profileDraft();if(!d.name.trim()||!d.role.trim()){toast('Name and role cannot be blank.',true);return;}const patch={name:d.name.trim(),role:d.role.trim(),profession:d.profession.trim(),instructions:d.instructions,model:d.model.trim()||null};if(await perform('save-profile',()=>api.updateAgent(p.id,patch),'Profile saved.')){delete state.profileDrafts[p.id];render(true);}},
    'save-config':saveConfig,
    'discard-config':()=>{state.configDraft={...config()};state.configDirty=false;render(true);},
    'close-modal':()=>{dialog.close();state.modal=null;},
    'deny-approval':async()=>{const row=state.modal?.row;if(row&&await perform('deny',()=>api.approve(row.id,false),'Action denied.')){dialog.close();state.modal=null;render(true);}},
    events:()=>modal('events'),
    'copy-record':async el=>{const r=records().find(r=>r.key===el.dataset.id);if(!r)return;try{await navigator.clipboard.writeText(r.text);toast('Record copied.');}catch{toast('Clipboard unavailable. Select the record text to copy it.',true);}}
  };
  document.addEventListener('click',e=>{const el=e.target.closest('[data-action]');if(!el||el.disabled)return;const action=el.dataset.action;if(action.startsWith('window-'))void windowAction(action);else if(handlers[action]){Promise.resolve(handlers[action](el)).catch(err=>toast(err.message,true));}});
  document.addEventListener('input',e=>{
    const el=e.target;
    if(el.id==='chat-draft')state.chatDraft=el.value;
    if(el.id==='agent-search'){state.agentQuery=el.value;render(true);}
    if(el.id==='memory-search'){state.memoryQuery=el.value;render(true);}
    if(el.id==='tool-search'){state.toolQuery=el.value;render(true);}
    if(el.dataset.profile){const p=selectedProfile();state.profileDrafts[p.id]={...profileDraft(),[el.dataset.profile]:el.value};const s=$('.profile-editor .panel-heading .stamp');if(s)s.textContent='UNSAVED';}
    if(el.dataset.config){state.configDraft={...(state.configDraft||config()),[el.dataset.config]:el.type==='checkbox'?el.checked:el.value};state.configDirty=true;updateDirty();}
  });
  document.addEventListener('change',e=>{
    const el=e.target;
    if(el.dataset.config){state.configDraft={...(state.configDraft||config()),[el.dataset.config]:el.type==='checkbox'?el.checked:el.value};state.configDirty=true;updateDirty();}
    if(el.id==='ui-density'||el.id==='ui-motion'){
      if(el.id==='ui-density')state.preferences.density=el.value;else state.preferences.motion=el.checked?'off':'system';
      preferences();try{localStorage.setItem('eutrya.studio.preferences',JSON.stringify(state.preferences));}catch{toast('This window cannot persist interface preferences.',true);}
    }
  });
  document.addEventListener('submit',async e=>{
    e.preventDefault();const id=e.target.id;
    if(id==='chat-form')return send();
    if(id==='modal-form')return submitModal(e.target);
    if(id==='jev-key-form'||id==='provider-key-form'){
      const field=id==='jev-key-form'?$('#jev-key'):$('#provider-key');const value=field.value.trim();const name=id==='jev-key-form'?'AI_GATEWAY_API_KEY':config().mainKeyEnv;
      if(!value||!name)return;field.value='';await perform(id,()=>api.credential(name,value),'Credential submitted to the local store.');
    }
  });
  document.addEventListener('keydown',e=>{if(e.target.id==='chat-draft'&&e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();void send();}});
  document.addEventListener('focusout',()=>{if(renderPending)setTimeout(()=>render(),100);});
  dialog.addEventListener('close',()=>{state.modal=null;});
  $('#titlebar').addEventListener('mousedown',e=>{
    if(e.button!==0||e.target.closest('button,input,textarea,select,a'))return;
    const current=window.__TAURI__?.window?.getCurrentWindow?.();if(!current)return;
    const promise=e.detail===2?current.toggleMaximize():current.startDragging();
    Promise.resolve(promise).catch(err=>toast(`Window dragging unavailable: ${err.message}`,true));
  });
  window.addEventListener('popstate',()=>{const p=location.hash.slice(1);if(M.names.includes(p)){state.page=p;render(true,true);}});
  window.addEventListener('beforeunload',()=>clearTimeout(timer));
  async function poll(){await refresh();timer=setTimeout(poll,2200);}
  async function boot(){render(true);try{await api.connect();}catch(err){state.error=err.message;}void poll();}
  boot().catch(err=>{state.error=err.message;state.connected=false;render(true);});
})();
