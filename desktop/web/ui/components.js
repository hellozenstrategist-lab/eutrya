/* Eutrya Studio: dependency-free, accessible presentation components. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const paths = {
    dashboard:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
    swarm:'M12 9V5M9 12H5m10 0h4m-7 3v4M9 9l-3-3m9 9 3 3M9 15l-3 3m9-9 3-3',
    library:'M4 3h4v18H4zM11 3h4v18h-4zM18 4l3 16M5 7h2m5 0h2',
    memory:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10z',
    tools:'m3 13 4-4 4 7 4-11 3 6h3',
    settings:'M10 3h4l1 3 3 1 3 3v4l-3 1-1 3-3 3h-4l-1-3-3-1-3-3v-4l3-1 1-3z',
    search:'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm5 12 6 6',
    plus:'M12 5v14M5 12h14', arrow:'M4 12h16m-6-6 6 6-6 6',
    chevron:'m9 5 7 7-7 7', close:'m6 6 12 12M6 18 18 6', minus:'M5 12h14',
    maximize:'M4 4h16v16H4z', reload:'M20 8a9 9 0 1 0 0 8M20 3v5h-5',
    send:'m3 3 18 9-18 9 4-9-4-9zm4 9h14', stop:'M6 6h12v12H6z',
    check:'m5 12 4 4 10-10', clock:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4v5l3 2',
    code:'m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-2 18',
    file:'M5 2h9l5 5v15H5zm9 0v6h5M8 12h8m-8 4h8',
    folder:'M3 5h7l2 3h9v12H3z', globe:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 0c5 5 5 13 0 18-5-5-5-13 0-18zM3 12h18',
    lock:'M5 10h14v11H5zm3 0V7a4 4 0 0 1 8 0v3m-4 5v2',
    grid:'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z',
    list:'M8 5h13M8 12h13M8 19h13M3 5h1M3 12h1M3 19h1',
    info:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 7v7m0-11v1',
    trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
    copy:'M8 8h13v13H8zM16 8V3H3v13h5',
    admin:'m3 7 4 4 5-7 5 7 4-4-2 12H5L3 7zm2 15h14',
    engineer:'m4 4 16 16m-3-17 4 4-7 7M3 17l4 4 6-6M3 3l2 6 4-4-6-2z',
    lawyer:'M12 3v18M5 21h14M4 7h16M6 7l-4 8h8L6 7zm12 0-4 8h8l-4-8z',
    finance:'M4 20V12h3v8zm7 0V4h3v16zm7 0V8h3v12z',
    researcher:'M9 3h6m-4 0v6l-7 11h16L13 9V3M8 14h8',
    database:'M3 6c0-5 18-5 18 0s-18 5-18 0zm0 0v12c0 5 18 5 18 0V6M3 12c0 5 18 5 18 0',
    terminal:'m4 6 6 6-6 6m9 0h7', download:'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4'
  };
  const icon = (name, cls='') => `<svg class="icon ${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.file}"/>${name==='swarm'?'<circle cx="12" cy="12" r="3"/><circle cx="12" cy="3" r="1.5"/><circle cx="3" cy="12" r="1.5"/><circle cx="21" cy="12" r="1.5"/><circle cx="12" cy="21" r="1.5"/>':''}${name==='settings'?'<circle cx="12" cy="12" r="3"/>':''}</svg>`;
  const logo = () => '<svg class="logo" viewBox="0 0 48 48" aria-hidden="true"><path fill="currentColor" d="M5 41 20 6h8l15 35H32L24 18 15 41z"/></svg>';
  const portraits = {admin:'admin',engineer:'engineer',legal:'lawyer',lawyer:'lawyer',finance:'finance',researcher:'researcher'};
  const portrait = id => `./assets/agent-${portraits[id] || 'researcher'}.jpg`;
  let floralId=0;
  const floral = (cls='',fit='slice') => {
    const id=`botanical-fade-${++floralId}`;
    return `<svg class="floral ${esc(cls)}" viewBox="975 140 420 650" preserveAspectRatio="xMidYMid ${fit}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="white" stop-opacity="0"/><stop offset=".2" stop-color="white"/><stop offset=".8" stop-color="white"/><stop offset="1" stop-color="white" stop-opacity="0"/></linearGradient><mask id="${id}-mask" maskUnits="userSpaceOnUse" x="975" y="140" width="420" height="650"><rect x="975" y="140" width="420" height="650" fill="url(#${id})"/></mask></defs><svg x="975" y="140" width="420" height="650" viewBox="975 140 420 650" overflow="hidden"><image href="./assets/dashboard-hero.jpg" width="1672" height="941" mask="url(#${id}-mask)"/></svg></svg>`;
  };
  const button = (label, action, symbol='', kind='', attrs='') => `<button class="btn ${kind}" data-action="${esc(action)}" ${attrs}>${symbol?icon(symbol):''}<span>${esc(label)}</span></button>`;
  const empty = (title, hint='') => `<div class="empty-state">${icon('info')}<div><strong>${esc(title)}</strong>${hint?`<p>${esc(hint)}</p>`:''}</div></div>`;
  const status = (text, mode='idle') => `<span class="status ${esc(mode)}"><i></i>${esc(text)}</span>`;
  const panel = (title, content, cls='', aside='') => `<section class="panel ${cls}"><header class="panel-heading"><h2>${esc(title)}</h2>${aside}</header><div class="panel-content">${content}</div></section>`;
  const stamp = text => `<span class="stamp">${esc(text)}</span>`;
  const definitions = {
    dashboard:['Eutrya','A durable mind for a more intelligent tomorrow.','A more capable you, for a more interesting future.','ORCHESTRATE / CREATE / EVOLVE'],
    swarm:['Swarm','Many minds. A higher purpose.','Intelligence multiplies when minds work together.','COORDINATE / SYNTHESIZE / DELIVER'],
    library:['Agent Library','Discover. Configure. Deploy.','Better questions build a brighter tomorrow.','SPECIALIZE / COLLABORATE / EVOLVE'],
    memory:['Memory','Capture. Connect. Reason. Evolve.','The more we remember, the more we can become.','CAPTURE / CONNECT / COMPOUND'],
    tools:['Tools','Build higher capabilities through intelligent tools.','Better tools create braver thinkers.','PLAN / BUILD / EXTEND'],
    settings:['Settings','Configure today for a more intelligent tomorrow.','Better systems make intelligence durable.','CONFIGURE / PROTECT / EVOLVE']
  };
  function hero(page, extra='') {
    const d=definitions[page] || definitions.dashboard;
    return `<section class="hero hero-${page}"><div class="hero-main"><div class="registration-mark"></div>${floral('', 'meet')}<span class="hero-index">EUTRYA / ${esc(page.toUpperCase())}</span><h1>${esc(d[0])}</h1><p>${esc(d[1])}</p><div class="hero-foot"><span>${esc(d[3])}</span><span>v0.2.0</span></div></div><aside class="hero-aside"><div class="hero-quote">${floral()}<span class="quote-mark">“</span><blockquote>${esc(d[2])}</blockquote><cite>— EUTRYA</cite></div>${extra}</aside></section>`;
  }
  function agentCard(a, selected=false, layout='library') {
    return `<button class="agent-card ${layout} ${selected?'selected':''}" data-action="select-agent" data-id="${esc(a.id)}" aria-pressed="${selected}"><div class="agent-visual"><img src="${portrait(a.id)}" alt="" loading="lazy"><span class="agent-symbol">${icon(portraits[a.id] || 'researcher')}</span><span class="agent-index">${esc(a.index)}</span></div><div class="agent-copy"><h3>${esc(a.name)}</h3>${status(a.statusLabel,a.tone)}<p>${esc(a.description)}</p><div class="tags">${(a.verbs || []).slice(0,3).map(v=>`<span>${esc(v.toLowerCase())}</span>`).join('')}</div><footer><span>${a.taskCount} ${a.taskCount===1?'task':'tasks'}</span>${icon('arrow')}</footer></div></button>`;
  }
  function network(agents, selected, view='graph') {
    if(view==='list' || agents.length>9) return `<div class="network-list">${agents.map(a=>`<button data-action="select-agent" data-id="${esc(a.id)}" class="network-list-row ${a.id===selected?'selected':''}"><img src="${portrait(a.id)}" alt=""><span><strong>${esc(a.name)}</strong><small>${esc(a.role)}</small></span>${status(a.statusLabel,a.tone)}${icon('chevron')}</button>`).join('')}</div>`;
    const center = agents.find(a=>a.id==='admin') || agents[0];
    if(!center) return empty('No agents configured');
    const peers=agents.filter(a=>a!==center);
    const coords=peers.map((a,i)=>{const angle=-Math.PI/2 + 2*Math.PI*i/peers.length;return {a,x:340+220*Math.cos(angle),y:215+146*Math.sin(angle)};});
    const node = (a,x,y,hub=false) => `<button class="network-node ${hub?'hub':''} ${a.id===selected?'selected':''}" style="left:${x/680*100}%;top:${y/450*100}%" data-action="select-agent" data-id="${esc(a.id)}" aria-pressed="${a.id===selected}"><span class="node-image"><img src="${portrait(a.id)}" alt=""></span><span class="node-label"><strong>${esc(a.name)}</strong>${status(a.statusLabel,a.tone)}</span></button>`;
    return `<div class="network-scene">${floral('network-flower')}<svg class="network-lines" viewBox="0 0 680 450" preserveAspectRatio="none" aria-hidden="true"><ellipse cx="340" cy="215" rx="220" ry="146" class="orbit"/><ellipse cx="340" cy="215" rx="130" ry="95" class="orbit"/>${coords.map(({x,y})=>`<path d="M340 215L${x} ${y}"/><circle cx="${340+(x-340)*.57}" cy="${215+(y-215)*.57}" r="3"/>`).join('')}<path d="M25 40h26m-13-13v26M617 397h26m-13-13v26" class="crosshair"/></svg>${node(center,340,215,true)}${coords.map(({a,x,y})=>node(a,x,y)).join('')}<span class="network-caption">SHARED CONTEXT<br>ROUTED INTELLIGENCE</span></div>`;
  }
  function sourceGraph(groups, selected='all', mini=false) {
    const nodes=groups.filter(g=>g.count>0);
    return `<div class="source-graph ${mini?'mini':''}">${floral('graph-flower')}<svg viewBox="0 0 600 470" preserveAspectRatio="none" aria-hidden="true"><circle cx="300" cy="230" r="160" class="orbit"/><circle cx="300" cy="230" r="95" class="orbit"/>${nodes.map((g,i)=>{const t=-Math.PI/2+Math.PI*2*i/nodes.length;return `<path d="M300 230L${300+190*Math.cos(t)} ${230+145*Math.sin(t)}"/>`;}).join('')}</svg><div class="source-core">${logo()}<span>CONTEXT</span></div>${nodes.map((g,i)=>{const t=-Math.PI/2+Math.PI*2*i/nodes.length;return `<button class="source-node ${selected===g.id?'selected':''}" data-action="memory-source" data-id="${esc(g.id)}" style="left:${(300+190*Math.cos(t))/6}%;top:${(230+145*Math.sin(t))/4.7}%"><i></i><strong>${esc(g.name)}</strong><small>${g.count} ${g.count===1?'record':'records'}</small></button>`;}).join('')}${!nodes.length?'<div class="graph-empty">No records yet</div>':''}<span class="graph-caption">GROUPED BY SOURCE<br>NOT SEMANTIC SIMILARITY</span></div>`;
  }
  window.EutryaUI = {esc, icon, logo, portrait, floral, button, empty, status, panel, stamp, hero, agentCard, network, sourceGraph};
})();
