(() => {
  'use strict'
  const columns = ['intake', 'ready', 'active', 'review', 'blocked', 'done', 'parked']
  const labels = {intake:'Intake', ready:'Ready', active:'Active', review:'Review', blocked:'Blocked', done:'Done', parked:'Parked', unknown:'Unknown'}
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
  const array = value => Array.isArray(value) ? value : []
  const short = (value, length = 140) => String(value ?? '').slice(0, length)
  const time = value => { const d = new Date(value); return value && Number.isFinite(d.valueOf()) ? d.toLocaleString() : 'Not recorded' }
  const badge = value => `<span class="hunt-badge">${escape(value || 'Unknown')}</span>`
  const empty = value => `<p class="hunt-empty">${escape(value)}</p>`
  let hooks = {}, modal = null, openingFocus = null

  function model(payload, selectedId, query = '', assignee = '') {
    const workspace = payload?.swarm?.workspace ?? {}
    const hunts = array(workspace.hunts), all = array(workspace.huntCards)
    const hunt = hunts.find(h => h.id === selectedId) ?? hunts.find(h => h.status === 'active') ?? hunts[0] ?? null
    const cards = hunt ? all.filter(c => c.huntId === hunt.id) : []
    const search = String(query).toLowerCase()
    const shown = cards.filter(c => (!assignee || c.assignedTo === assignee || c.worker === assignee || c.reviewer === assignee) &&
      [c.id, c.title, c.objective, c.status, c.assignedTo, c.worker, c.reviewer, ...array(c.blockers)].join(' ').toLowerCase().includes(search))
    const groups = Object.fromEntries([...columns, 'unknown'].map(status => [status, shown.filter(c => (columns.includes(c.status) ? c.status : 'unknown') === status)]))
    const byId = new Map(all.map(c => [c.id, c]))
    return {hunts, hunt, cards, shown, groups, byId, agents:array(payload?.swarm?.matrix?.agents)}
  }
  function canMove(card) { return !card.assignedTo && ['intake','ready','blocked','parked'].includes(card.status) }
  function dependencies(card, byId) {
    return array(card.dependsOn).map(id => ({id, title:byId.get(id)?.title ?? 'Missing dependency', status:byId.get(id)?.status ?? 'missing'}))
  }
  function routeWeight(value) {
    return Number.isFinite(value) && value >= 0 && value <= 1 ? `${(value * 100).toFixed(1)}% choice weight` : 'Weight not recorded'
  }
  function editable() {
    const b = window.EutryaCore.state.backend
    return Boolean(b?.connected && b?.readiness?.ready && b?.capabilities?.desktopReviewBoard)
  }
  function current() {
    const s = window.EutryaCore.state
    const m = model(s.backend, s.selectedHunt, s.huntSearch, s.huntAssignee)
    if (m.hunt) s.selectedHunt = m.hunt.id
    return m
  }
  function cardHtml(card, byId) {
    const deps = dependencies(card, byId), pending = deps.filter(d => d.status !== 'done').length
    const owner = card.assignedTo || (card.status === 'review' ? card.worker : null)
    const move = canMove(card) && editable()
    return `<button type="button" class="hunt-card" data-hunt-card="${escape(card.id)}" draggable="${move}" aria-label="Open ${escape(card.title)}">
      <span class="hunt-card-meta"><span>${escape(card.id)}</span>${badge(`Priority: ${card.priority || 'unknown'}`)}</span>
      <strong>${escape(card.title)}</strong><span class="hunt-card-objective">${escape(short(card.objective))}</span>
      <span class="hunt-card-foot"><span>${owner ? '@' + escape(owner) : 'Unassigned'}</span><span>${pending ? `${pending} dependencies pending` : card.workerResult ? 'Worker result recorded' : 'No worker result'}</span></span>
    </button>`
  }
  function assignmentHtml(m) {
    return m.agents.filter(a => a.id !== 'admin').map(a => {
      const jobs = m.cards.filter(c => c.assignedTo === a.id)
      return `<article class="hunt-resident"><span class="hunt-resident-top"><strong>@${escape(a.name || a.id)}</strong>${badge(a.status)}</span>
      <p>${jobs.length ? jobs.map(c => `<button type="button" class="hunt-text-button" data-hunt-card="${escape(c.id)}">${escape(c.title)}</button>`).join('') : escape(a.currentTask || 'No assigned card on this board')}</p></article>`
    }).join('') || empty('Resident status has not been reported.')
  }
  function render() {
    const s = window.EutryaCore.state, m = current(), writable = editable()
    const connected = Boolean(s.backend?.connected)
    const tool = (label, action, disabled = false) => `<button type="button" class="ghost-button" data-hunt-action="${action}" ${disabled ? 'disabled' : ''}>${label}</button>`
    const list = [...columns, ...(m.groups.unknown.length ? ['unknown'] : [])]
    const history = m.cards.flatMap(c => array(c.routeHistory).map(r => ({...r, card:c}))).sort((a,b) => String(b.at || '').localeCompare(String(a.at || ''))).slice(0, 30)
    return `<div class="page hunt-page">
      <section class="hunt-heading"><div><div class="eyebrow">HUNTS / SHARED WORKSPACE</div><h1>Evidence before conclusions.</h1><p>One board for scope, assignments, findings, and independent review.</p></div><span class="hunt-sync ${connected ? '' : 'stale'}">${connected ? '● Connected to local bridge' : '○ Offline — last recorded state'}</span></section>
      <div class="hunt-toolbar"><label>Board<select id="hunt-select" aria-label="Select hunt board">${m.hunts.length ? m.hunts.map(h => `<option value="${escape(h.id)}" ${h.id === m.hunt?.id ? 'selected' : ''}>${escape(h.title)} · ${escape(h.status)}</option>`).join('') : '<option>No boards yet</option>'}</select></label>
      <label class="hunt-search">Filter cards<input id="hunt-search" type="search" value="${escape(s.huntSearch || '')}" placeholder="Title, objective, ID or blocker"></label>
      <label>Agent<select id="hunt-assignee"><option value="">All agents</option>${m.agents.map(a => `<option value="${escape(a.id)}" ${s.huntAssignee === a.id ? 'selected' : ''}>${escape(a.name || a.id)}</option>`).join('')}</select></label>
      ${tool('Refresh','refresh')}${tool('New board','create',!writable)}</div>
      ${!writable ? '<p class="hunt-notice">Read-only view. Connect a compatible local bridge to edit board metadata.</p>' : ''}
      ${!m.hunt ? `<section class="hunt-welcome"><h2>Your review workspace starts here.</h2><p>Create a board to record a program page and its rules, or inspect boards already created through the CLI. No sample findings are displayed.</p>${tool('Create review board','create',!writable)}</section>` : `
      <section class="hunt-summary"><div><h2>${escape(m.hunt.title)}</h2><p>${escape(m.hunt.id)} · ${escape(m.hunt.pageUrl)}</p></div><div class="hunt-actions">${badge(m.hunt.status)}${tool('Rules & scope','rules')}${tool('New card','new-card',!writable || m.hunt.status !== 'paused')}${tool(m.hunt.status === 'paused' ? 'Resume board' : 'Pause board', m.hunt.status === 'paused' ? 'resume' : 'pause',!writable || m.hunt.status === 'completed')}${tool('Export board','export')}</div></section>
      <p class="hunt-notice">${m.shown.length} of ${m.cards.length} cards shown. New manual cards are parked. Board edits never start testing; runtime stages are not manually marked complete.</p>
      <section class="hunt-residents" aria-label="Live agent assignments">${assignmentHtml(m)}</section>
      <section class="hunt-kanban" aria-label="Hunt Kanban board">${list.map(status => `<section class="hunt-column" data-hunt-column="${status}" ${writable && ['parked','blocked'].includes(status) ? 'data-hunt-drop="' + status + '"' : ''}><h3><span>${labels[status]}</span><b>${m.groups[status].length}</b></h3><div class="hunt-column-cards">${m.groups[status].map(c => cardHtml(c,m.byId)).join('') || empty('No cards')}</div></section>`).join('')}</section>
      <section class="hunt-history"><div class="hunt-section-title"><h2>Jev routing history</h2><span>Recorded decisions, not inferred activity</span></div>${history.length ? `<div class="hunt-history-list">${history.map(r => `<button type="button" data-hunt-card="${escape(r.card.id)}"><time>${escape(time(r.at))}</time><strong>${escape(r.card.title)}</strong><span>→ @${escape(r.agent)}</span><span>${escape(r.stage)} · ${escape(r.source || 'not recorded')}</span><small>${escape(routeWeight(r.probability))}</small></button>`).join('')}</div><p class="hunt-notice">Choice weights are not calibrated confidence, evidence of correctness, or permission to execute.</p>` : empty('Routing decisions will appear here when reported by the backend.')}</section>`}
    </div>`
  }
  function field(name, label, value = '', area = false, required = false, max = 8000) {
    return `<label>${escape(label)}${area ? `<textarea name="${name}" rows="4" maxlength="${max}" ${required?'required':''}>${escape(value)}</textarea>` : `<input name="${name}" value="${escape(value)}" maxlength="${max}" ${required?'required':''}>`}</label>`
  }
  function show(title, content, onSubmit) {
    if (modal) modal.close()
    openingFocus = document.activeElement
    modal = document.createElement('dialog')
    modal.className = 'hunt-dialog'
    modal.setAttribute('aria-labelledby','hunt-dialog-title')
    modal.innerHTML = `<form><header><h2 id="hunt-dialog-title">${escape(title)}</h2><button type="button" data-close aria-label="Close dialog">×</button></header><div class="hunt-dialog-content">${content}<p class="hunt-form-error" role="alert"></p></div></form>`
    const dialog = modal
    document.body.append(dialog)
    dialog.querySelector('[data-close]').onclick = () => dialog.close()
    dialog.addEventListener('close', () => { dialog.remove(); if (modal === dialog) modal = null; openingFocus?.focus?.() }, {once:true})
    dialog.querySelector('form').onsubmit = async event => {
      event.preventDefault()
      if (!onSubmit) return
      const form = event.currentTarget, error = dialog.querySelector('[role="alert"]')
      const buttons = [...form.querySelectorAll('button[type="submit"]')]
      buttons.forEach(b => b.disabled = true); error.textContent = ''
      try { await onSubmit(Object.fromEntries(new FormData(form)), event.submitter?.value); dialog.close(); hooks.render?.() }
      catch (err) { error.textContent = err.message; buttons.forEach(b => b.disabled = false) }
    }
    dialog.showModal()
    return dialog
  }
  async function request(method, path, data) {
    if (!editable()) throw new Error('A compatible, connected bridge is required.')
    const result = await window.EutryaBackend.request(path, {method,body:data})
    if (result.state) hooks.applyBackend?.(result.state)
    else await hooks.refresh?.({rerender:false})
    return result
  }
  const lines = value => String(value || '').split('\n').map(s => s.trim()).filter(Boolean)
  function createBoard() {
    show('Create a review board', `<p class="hunt-notice">This stores metadata locally. It does not fetch the page, validate authorization, or start a hunt. The board starts paused.</p>
      ${field('title','Board title','',false,true,300)}${field('pageUrl','Program page URL','',false,true,2048)}${field('rules','Program rules','',true,true,12000)}
      ${field('scope','In-scope assets — one per line','',true)}${field('exclusions','Exclusions — one per line','',true)}${field('testingRules','Testing restrictions — one per line','',true)}<footer><button class="primary-button" type="submit">Create paused board</button></footer>`, async values => {
        const r = await request('POST','/api/review/hunts',{...values,scope:lines(values.scope),exclusions:lines(values.exclusions),testingRules:lines(values.testingRules)})
        window.EutryaCore.state.selectedHunt = r.hunt.id
      })
  }
  function newCard() {
    const m = current(), h = m.hunt
    if (!h || h.status !== 'paused') return
    show('Add a parked card', `<p class="hunt-notice">A manual planning record, not an execution instruction.</p>${field('title','Card title','',false,true,400)}${field('objective','Review objective','',true,true,5000)}
      <label>Priority<select name="priority">${['low','medium','high','critical'].map(p => `<option ${p==='medium'?'selected':''}>${p}</option>`).join('')}</select></label>
      <label>Preferred role (hint only)<select name="role"><option value="">None</option>${m.agents.filter(a=>a.id!=='admin').map(a=>`<option value="${escape(a.id)}">${escape(a.name||a.id)}</option>`).join('')}</select></label>
      <label>Dependency<select name="dependency"><option value="">None</option>${m.cards.map(c=>`<option value="${escape(c.id)}">${escape(c.title)} · ${escape(c.status)}</option>`).join('')}</select></label><footer><button class="primary-button" type="submit">Add parked card</button></footer>`, async v => {
        await request('POST',`/api/review/hunts/${encodeURIComponent(h.id)}/cards`,{title:v.title,objective:v.objective,priority:v.priority,preferredRoles:v.role?[v.role]:[],dependsOn:v.dependency?[v.dependency]:[],expectedToken:h.editToken})
      })
  }
  function cardDetail(id, desiredStatus) {
    const m = current(), card = m.byId.get(id)
    if (!card || card.huntId !== m.hunt?.id) return
    const deps = dependencies(card,m.byId), writable = editable()
    const content = `<div class="hunt-detail-meta">${badge(card.status)}${badge(`Priority: ${card.priority}`)}<code>${escape(card.id)}</code></div><p>${escape(card.objective)}</p>
      <dl class="hunt-detail-grid"><dt>Assigned</dt><dd>${escape(card.assignedTo || 'Unassigned')}</dd><dt>Worker</dt><dd>${escape(card.worker || 'Not recorded')}</dd><dt>Reviewer</dt><dd>${escape(card.reviewer || 'Not recorded')}</dd><dt>Attempts</dt><dd>${Number.isInteger(card.attempts)?card.attempts:'Not recorded'}</dd><dt>Updated</dt><dd>${escape(time(card.updatedAt))}</dd></dl>
      <details open><summary>Worker evidence / result</summary><pre>${escape(card.workerResult || 'No worker result recorded. A card is not evidence by itself.')}</pre></details>
      <details open><summary>Independent review</summary><pre>${escape(card.reviewResult || 'No independent review recorded.')}</pre></details>
      <details ${array(card.blockers).length?'open':''}><summary>Blockers (${array(card.blockers).length})</summary>${array(card.blockers).map(b=>`<p>${escape(b)}</p>`).join('') || empty('No recorded blockers.')}</details>
      <details><summary>Dependencies (${deps.length})</summary>${deps.map(d=>`<p><strong>${escape(d.title)}</strong> — ${escape(d.status)}<br><code>${escape(d.id)}</code></p>`).join('') || empty('No dependencies.')}</details>
      <details><summary>Routing history (${array(card.routeHistory).length})</summary>${array(card.routeHistory).map(r=>`<p>${escape(time(r.at))} → @${escape(r.agent)} · ${escape(r.stage)} · ${escape(r.source)}<br>${escape(routeWeight(r.probability))}</p>`).join('') || empty('No routing decisions recorded.')}</details>
      ${field('note','Human review notes',card.humanNotes || '',true,false,8000)}
      ${writable ? `<footer><button class="primary-button" type="submit" value="note">Save note</button>${canMove(card)?'<button class="ghost-button" type="submit" value="parked">Park card</button><button class="ghost-button" type="submit" value="blocked">Flag blocked</button>':''}</footer><p class="hunt-notice">Notes do not approve a finding or mark work complete. Blocking a card requires an explanation.</p>` : '<p class="hunt-notice">Read-only while disconnected.</p>'}`
    const d = show(card.title, content, async (v, action) => {
      await request('PATCH',`/api/review/cards/${encodeURIComponent(card.id)}`,{expectedToken:card.editToken,note:v.note,...(action!=='note'?{status:action}:{})})
    })
    if (desiredStatus) {
      const error = d.querySelector('[role="alert"]')
      error.textContent = `Confirm “${labels[desiredStatus]}” below${desiredStatus==='blocked'?' and explain the blocker':''}. No execution is started.`
    }
  }
  function rules() {
    const h = current().hunt
    if (!h) return
    show('Program rules & scope', `<p><strong>${escape(h.title)}</strong><br>${escape(h.pageUrl)}</p><pre>${escape(h.rules || 'No rules recorded.')}</pre>${[['Scope',h.scope],['Exclusions',h.exclusions],['Testing restrictions',h.testingRules]].map(([label,items])=>`<h3>${label}</h3><pre>${escape(array(items).join('\n') || 'Not recorded')}</pre>`).join('')}`)
  }
  async function setStatus(status) {
    const h = current().hunt
    if (!h) return
    show(status==='paused'?'Pause board':'Resume board', `<p>${status==='paused'?'Pause future dispatch and request cancellation of this board’s running workers. Already completed effects cannot be undone.':'Make the board active again. This changes metadata only: it does not launch the router or start testing.'}</p><footer><button class="primary-button" type="submit">Confirm</button></footer>`,async()=>{
      await request('PATCH',`/api/review/hunts/${encodeURIComponent(h.id)}/status`,{status,expectedToken:h.editToken})
    })
  }
  function exportBoard() {
    const m = current(); if (!m.hunt) return
    const clean = value => { const {editToken,...rest} = value; return rest }
    const data = JSON.stringify({exportedAt:new Date().toISOString(),hunt:clean(m.hunt),cards:m.cards.map(clean)},null,2)
    const url = URL.createObjectURL(new Blob([data],{type:'application/json'})), a = document.createElement('a')
    a.href=url; a.download=`${m.hunt.id}-review.json`; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  function bind(callbacks) {
    hooks = callbacks
    const s=window.EutryaCore.state
    document.querySelectorAll('[data-hunt-card]').forEach(el=>{
      el.addEventListener('click',()=>cardDetail(el.dataset.huntCard))
      el.addEventListener('dragstart',e=>{if(el.draggable){e.dataTransfer.setData('application/x-eutrya-card',el.dataset.huntCard);e.dataTransfer.effectAllowed='move'}})
    })
    document.querySelectorAll('[data-hunt-drop]').forEach(el=>{
      el.addEventListener('dragover',e=>{if([...e.dataTransfer.types].includes('application/x-eutrya-card'))e.preventDefault()})
      el.addEventListener('drop',e=>{e.preventDefault();const id=e.dataTransfer.getData('application/x-eutrya-card');const c=current().byId.get(id);if(c&&canMove(c))cardDetail(id,el.dataset.huntDrop)})
    })
    const select=document.querySelector('#hunt-select'), search=document.querySelector('#hunt-search'), assignee=document.querySelector('#hunt-assignee')
    if(select)select.onchange=e=>{s.selectedHunt=e.target.value;hooks.render()}
    if(assignee)assignee.onchange=e=>{s.huntAssignee=e.target.value;hooks.render()}
    if(search)search.oninput=e=>{s.huntSearch=e.target.value;const pos=e.target.selectionStart;hooks.render();const next=document.querySelector('#hunt-search');next?.focus();if(next&&next.type==='text')next.setSelectionRange(pos,pos)}
    document.querySelectorAll('[data-hunt-action]').forEach(el=>el.addEventListener('click',()=>{
      const action=el.dataset.huntAction
      if(action==='refresh')hooks.refresh()
      else if(action==='create')createBoard()
      else if(action==='new-card')newCard()
      else if(action==='rules')rules()
      else if(action==='pause')setStatus('paused')
      else if(action==='resume')setStatus('active')
      else if(action==='export')exportBoard()
    }))
  }
  window.EutryaHunts = Object.freeze({render,bind,model,canMove,dependencies,routeWeight,escape,hasOpenDialog:()=>Boolean(modal?.open)})
})()
