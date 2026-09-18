import fs from 'node:fs';
import assert from 'node:assert/strict';

const once=(source,needle,value)=>{assert.equal(source.split(needle).length,2,`Expected exactly one integration marker: ${needle.slice(0,100)}`);return source.replace(needle,value)};
const change=(file,fn)=>{const source=fs.readFileSync(file,'utf8');fs.writeFileSync(file,fn(source));console.log(`Updated ${file}`)};

change('desktop/web/index.html',s=>{
  s=once(s,'  <link rel="stylesheet" href="./ui/studio.css">','  <link rel="stylesheet" href="./ui/studio.css">\n  <link rel="stylesheet" href="./css/hunts.css">');
  return once(s,'  <script src="./ui/model.js"></script>','  <script src="./ui/model.js"></script>\n  <script src="./hunts.js"></script>');
});
change('desktop/web/hunts.js',s=>{
  s=s.replaceAll('window.EutryaCore.state','window.EutryaStudio.state');
  s=once(s,'const b = window.EutryaStudio.state.backend','const state = window.EutryaStudio.state\n    const b = {...state.data, connected:state.connected}');
  s=once(s,'model(s.backend, s.selectedHunt, s.huntSearch, s.huntAssignee)','model(s.data, s.selectedHunt, s.huntSearch, s.huntAssignee)');
  s=once(s,'Boolean(s.backend?.connected)','Boolean(s.connected)');
  s=once(s,'openingFocus?.focus?.() }, {once:true})','openingFocus?.focus?.(); hooks.render?.() }, {once:true})');
  s=once(s,'const result = await window.EutryaBackend.request(path, {method,body:data})','hooks.invalidate?.()\n    let result\n    try { result = await window.EutryaBackend.request(path, {method,body:data}) } finally { hooks.invalidate?.() }');
  return s;
});
change('desktop/web/ui/model.js',s=>{
  s=once(s,"['dashboard','swarm','library','memory','tools','settings']","['dashboard','swarm','hunts','library','memory','tools','settings']");
  const start=s.indexOf('  const defaults=['),end=s.indexOf('  const toolGroups=[');
  assert.ok(start>=0&&end>start);
  const defaults=[
    {id:'admin',name:'Admin',role:'Security orchestration',description:'Coordinate scoped work and maintain the shared plan.',verbs:['Coordinate','Scope','Delegate']},
    {id:'auditor',name:'Auditor',role:'Security code review',description:'Review code, trace invariants, and gather supporting evidence.',verbs:['Review','Trace','Document']},
    {id:'operator',name:'Operator',role:'Validation engineering',description:'Support controlled local validation and record its results.',verbs:['Validate','Record','Report']},
    {id:'sentinel',name:'Sentinel',role:'Independent review',description:'Challenge assumptions, assess evidence, and flag uncertainty.',verbs:['Verify','Challenge','Triage']},
    {id:'analyst',name:'Analyst',role:'Architecture & research',description:'Connect documentation, architecture, and review evidence.',verbs:['Model','Research','Synthesize']}
  ];
  s=s.slice(0,start)+'  const defaults='+JSON.stringify(defaults,null,2)+';\n'+s.slice(end);
  const added=[
    {name:'Semantic Code',icon:'code',category:'Research',description:'Read-only structural code navigation; signals are not proofs.',keys:['code_surface','code_symbol','code_references','code_inspect','code_state','code_compare']},
    {name:'Hunt Board',icon:'hunts',category:'Collaboration',description:'Shared board metadata and recorded routing. The desktop review view does not launch tests.',keys:['hunt_create','hunt_card','hunt_board','hunt_route']}
  ];
  s=once(s,'  const toolGroups=[','  const toolGroups=[\n'+added.map(g=>'    '+JSON.stringify(g)+',').join('\n')+'\n');
  s=once(s,"const activeTasks=()=>(ws().tasks||[]).filter(t=>!['completed','cancelled','failed'].includes(String(t.status).toLowerCase()));","const activeTasks=()=>[...(ws().tasks||[]),...(ws().huntCards||[])].filter(t=>!['completed','cancelled','failed','done','parked'].includes(String(t.status).toLowerCase()));");
  s=once(s,"r.summary||r.title||r.topic||r.path||''","r.summary||r.objective||r.title||r.topic||r.path||''");
  s=once(s,"    return result;\n  }\n  function groups()","    add('hunt-cards',ws().huntCards||[],'title','workerResult');\n    return result;\n  }\n  function groups()");
  s=once(s,"['artifacts','Artifacts']].map","['artifacts','Artifacts'],['hunt-cards','Hunt cards']].map");
  s=once(s,"function eventLabel(e){const d=e?.data||{};","function eventLabel(e){const d=e?.data||{};if(e.type==='hunt.card_started')return `${d.cardId} → @${d.agent||d.agentId} (${d.stage})`;if(e.type==='hunt.card_stage_complete')return `${d.cardId} → ${d.nextStatus}`;if(e.type==='hunt.card_blocked')return `${d.cardId} blocked: ${d.error||'Review needed'}`;if(e.type==='hunt.waiting')return `${d.cardId}: ${d.reason||'Waiting'}`;");
  return s;
});
change('desktop/web/ui/components.js',s=>{
  s=once(s,"    dashboard:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',","    dashboard:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',\n    hunts:'M3 3h18v18H3zM9 3v18M15 3v18M5 7h2m4 3h2m4-3h2',");
  s=once(s,"const portraits = {admin:'admin',engineer:'engineer',legal:'lawyer',lawyer:'lawyer',finance:'finance',researcher:'researcher'};","const portraits = {admin:'admin',auditor:'engineer',operator:'researcher',sentinel:'lawyer',analyst:'finance',engineer:'engineer',legal:'lawyer',lawyer:'lawyer',finance:'finance',researcher:'researcher'};");
  return once(s,'<span>v0.2.0</span>','<span>${esc(window.EutryaStudio?.state.data?.readiness?.bridgeVersion ? "v"+window.EutryaStudio.state.data.readiness.bridgeVersion : "Bridge not linked")}</span>');
});
change('desktop/web/ui/views.js',s=>{
  s=once(s,'<div class="brand-version">v0.2.0 / STUDIO</div>','<div class="brand-version" id="build-version">STUDIO / CONNECTING</div>');
  s=once(s,'const pages={dashboard,swarm,library,memory:memoryPage,tools,settings};','const pages={dashboard,swarm,hunts:()=>window.EutryaHunts.render(),library,memory:memoryPage,tools,settings};');
  s=once(s,'<small>ACTIVE TASKS</small>','<small>OPEN WORK ITEMS</small>');
  s=once(s,"${button('/Swarm','navigate','','','data-page=\"swarm\"')}","${button('/Swarm','navigate','','','data-page=\"swarm\"')}${button('/Hunts','navigate','','','data-page=\"hunts\"')}");
  s=once(s,"${panel('Current tasks',tasks(3),'',actionLink('Queue','navigate','data-page=\"swarm\"'))}","${panel('Current tasks',tasks(3),'',actionLink('Queue','navigate','data-page=\"swarm\"'))}${panel('Hunt workspace',kv([['Boards',(ws().hunts||[]).length],['Cards',(ws().huntCards||[]).length],['Waiting review',(ws().huntCards||[]).filter(c=>c.status==='review').length]]),'',actionLink('Open board','navigate','data-page=\"hunts\"'))}");
  return s;
});
change('desktop/web/ui/studio.js',s=>{
  s=once(s,'  function paintChrome(){','  function paintChrome(){\n    const build=document.querySelector("#build-version");if(build)build.textContent=state.data?.readiness?.bridgeVersion ? `v${state.data.readiness.bridgeVersion} / STUDIO` : "STUDIO / BRIDGE NOT LINKED";');
  s=once(s,'    paintChrome();\n    const active=document.activeElement;','    paintChrome();\n    if(window.EutryaHunts?.hasOpenDialog()){renderPending=true;return;}\n    const active=document.activeElement;');
  s=once(s,'    area.scrollTop=top;','    window.EutryaHunts?.bind({render:()=>render(true),refresh,applyBackend:accept,invalidate:()=>{refreshSerial++;}});\n    area.scrollTop=top;');
  s=once(s,"if(row&&!dialog.open)modal('approval',{row});","if(row&&!dialog.open&&!window.EutryaHunts?.hasOpenDialog())modal('approval',{row});");
  return s;
});
change('desktop/server.mjs',s=>{
  s=once(s,"import { redactor, insist, clip, uid } from '../src/util.mjs';","import { redactor, insist, clip, uid } from '../src/util.mjs';\nimport { editReviewBoard, withEditToken } from './review-board.mjs';");
  s=once(s,"const HERE = path.dirname(fileURLToPath(import.meta.url));","const HERE = path.dirname(fileURLToPath(import.meta.url));\nconst BUILD_VERSION = JSON.parse(fs.readFileSync(path.join(HERE,'..','package.json'),'utf8')).version;");
  s=once(s,"bridgeVersion: '0.4.0',","bridgeVersion: BUILD_VERSION,");
  s=once(s,'hunts: swarm.sharedWorkspace.listHunts(),','hunts: swarm.sharedWorkspace.listHunts().map(withEditToken),');
  s=once(s,'huntCards: swarm.sharedWorkspace.listHuntCards(),','huntCards: swarm.sharedWorkspace.listHuntCards().map(withEditToken),');
  s=once(s,'    readiness: readiness(),','    readiness: readiness(),\n    capabilities: { desktopReviewBoard: true, huntExecutionControls: false },');
  s=once(s,"  if (req.method === 'GET' && url.pathname === '/api/state')", "  if (url.pathname.startsWith('/api/review/')) {\n    const edited = editReviewBoard(swarm, req.method, url.pathname, await body(req));\n    const {code, ...result} = edited;\n    return json(res, code, {...result, state: stateView()});\n  }\n  if (req.method === 'GET' && url.pathname === '/api/state')");
  return s;
});
// Pause is a safety operation: once paused, do not dispatch more work or mark a stopped task complete.
change('src/swarm/swarm.mjs',s=>{
  s=once(s,'    while(wave<maxWaves) {\n      this.sharedWorkspace.refreshHuntReadiness(huntId);','    while(wave<maxWaves) {\n      if(this.sharedWorkspace.getHunt(huntId)?.status!=="active" || signal?.aborted) break;\n      this.sharedWorkspace.refreshHuntReadiness(huntId);');
  s=once(s,'        const route=await this.routeHuntCard(card.id,signal);\n        if(!route) continue;','        if(this.sharedWorkspace.getHunt(huntId)?.status!=="active" || signal?.aborted) break;\n        const route=await this.routeHuntCard(card.id,signal);\n        if(this.sharedWorkspace.getHunt(huntId)?.status!=="active" || signal?.aborted) break;\n        if(!route) continue;');
  return once(s,"      if(['ERROR','NEEDS_REVIEW'].includes(runtime.state.status)) throw new Error(runtime.state.reason || `Agent ended in ${runtime.state.status}`);","      if(!['ANSWERED','VERIFIED'].includes(runtime.state.status)) throw new Error(runtime.state.reason || `Agent ended without completion: ${runtime.state.status}`);");
});
for(const file of ['package.json','package-lock.json'])change(file,s=>{
  const j=JSON.parse(s);j.version='0.4.1';if(j.packages?.[''])j.packages[''].version='0.4.1';return JSON.stringify(j,null,2)+'\n';
});
for(const file of ['bin/eutrya.mjs','src/mcp.mjs','src/providers/codex-subscription.mjs','src/tools.mjs','desktop/src-tauri/Cargo.toml','desktop/src-tauri/tauri.conf.json','tests/desktop-bridge.test.mjs'])change(file,s=>s.replaceAll('0.4.0','0.4.1'));
change('desktop/src-tauri/tauri.conf.json',s=>{const j=JSON.parse(s);j.bundle.resources['../review-board.mjs']='runtime/desktop/review-board.mjs';return JSON.stringify(j,null,2)+'\n'});
change('scripts/install-omarchy.sh',s=>once(s,'cp "$ROOT/desktop/server.mjs" "$RUNTIME/desktop/server.mjs"','cp "$ROOT/desktop/server.mjs" "$RUNTIME/desktop/server.mjs"\ncp "$ROOT/desktop/review-board.mjs" "$RUNTIME/desktop/review-board.mjs"'));
change('README.md',s=>once(s,'Public Alpha · v0.4.0','Public Alpha · v0.4.1').replace('Version: **0.4.0**.','Version: **0.4.1**.')+'\n\n### Desktop review workspace (0.4.1)\n\nThe active Studio entry point now includes a **Hunts** tab with seven Kanban columns, filters, current assignments, recorded Jev routing history, scope/rules, card evidence and independent-review details. It also includes manual paused-board creation, parked cards, human notes, conflict-safe edits, JSON export, and pause/resume of board state. Resume does not start execution. The UI does not launch autonomous target testing. Running, review, and completed work stages cannot be set by dragging a card.\n\nSecurity roles, portraits, semantic-code tools, hunt records in Memory, dashboard counts, and displayed versions reflect the current backend. Rebuild an installed desktop binary after updating source; reloading its bridge alone cannot update bundled frontend assets. See [desktop/README.md](desktop/README.md).\n');
change('CHANGELOG.md',s=>once(s,'# Changelog\n','# Changelog\n\n## 0.4.1 — Desktop hunt review workspace\n\nUpdated the actual Studio entry point with Hunt Kanban, live assignments and routing history, card evidence/review dialogs, manual intake and notes, guarded status edits, pause controls, and exports. Added security-profile defaults, current tool groups, accurate work-item counts and backend-derived version labels. New desktop records start paused/parked and no automatic target-testing launcher is provided. Fixed dispatch after a board is paused and prevented incomplete workers from marking work complete.\n'));
console.log('Desktop integration applied. No provider calls or target traffic were made.');
