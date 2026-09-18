import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function ui(data = null) {
  const state = {data, connected:Boolean(data), selectedHunt:null, huntSearch:'', huntAssignee:''};
  const window = {EutryaStudio:{state}};
  vm.runInNewContext(fs.readFileSync('desktop/web/hunts.js','utf8'), {window, console});
  return {api:window.EutryaHunts,state};
}
const snapshot = () => ({
  readiness:{ready:true,bridgeVersion:'0.4.1'},capabilities:{desktopReviewBoard:true},
  swarm:{workspace:{hunts:[{id:'hunt-a',title:'Local review',status:'paused',pageUrl:'https://example.invalid/program'}],huntCards:[
    {id:'card-one',huntId:'hunt-a',title:'Recorded evidence',objective:'Review the supplied material',priority:'high',status:'review',assignedTo:null,worker:'auditor',reviewer:null,workerResult:'Observation only',dependsOn:[],routeHistory:[{agent:'auditor',stage:'ready',source:'mock',probability:0.8,at:'2026-09-18T12:00:00Z'}]},
    {id:'card-two',huntId:'hunt-a',title:'Manual note',objective:'Compare documentation',priority:'low',status:'parked',assignedTo:null,dependsOn:['card-one'],routeHistory:[]}
  ]},matrix:{agents:[{id:'auditor',name:'Auditor',status:'IDLE'},{id:'sentinel',name:'Sentinel',status:'WORKING',currentTask:'Other board'}]}}
});

test('desktop entry point loads the Hunts implementation, not legacy app/core', () => {
  const index = fs.readFileSync('desktop/web/index.html','utf8');
  assert.match(index,/\.\/hunts\.js/);
  assert.match(index,/\.\/ui\/studio\.js/);
  assert.doesNotMatch(index,/src="\.\/app\.js"|src="\.\/core\.js"/);
});
test('Hunt view shows actual empty state without fabricated cards', () => {
  const {api} = ui(); const result = api.render();
  assert.match(result,/No boards yet/); assert.match(result,/Offline/);
  assert.doesNotMatch(result,/data-hunt-card=/);
});
test('model selection is stable and filters by worker or assigned resident', () => {
  const data = snapshot(), {api} = ui(data);
  const result = api.model(data,'hunt-a','recorded','auditor');
  assert.equal(result.hunt.id,'hunt-a'); assert.equal(result.cards.length,2); assert.equal(result.shown.length,1);
  assert.equal(result.groups.review[0].id,'card-one');
});
test('UI escapes externally supplied titles, descriptions, rules and IDs', () => {
  const data = snapshot(); data.swarm.workspace.hunts[0].title='<b>untrusted</b>';
  data.swarm.workspace.huntCards[0].title='<em>not markup</em>';
  const {api}=ui(data), result=api.render();
  assert.match(result,/&lt;b&gt;untrusted&lt;\/b&gt;/);
  assert.match(result,/&lt;em&gt;not markup&lt;\/em&gt;/);
  assert.doesNotMatch(result,/<b>untrusted<\/b>/);
});
test('unknown backend stages remain visible rather than being dropped', () => {
  const data=snapshot();data.swarm.workspace.huntCards[0].status='future-stage';
  const {api}=ui(data);assert.equal(api.model(data,'hunt-a').groups.unknown.length,1);
  assert.match(api.render(),/data-hunt-column="unknown"/);
});
test('dependencies expose missing records and do not assume completion', () => {
  const {api}=ui(), byId=new Map([['x',{title:'Earlier work',status:'review'}]]);
  const deps=api.dependencies({dependsOn:['x','missing']},byId);
  assert.equal(deps[0].status,'review');assert.equal(deps[1].status,'missing');
});
test('only inactive manual states may be parked or marked blocked', () => {
  const {api}=ui();
  for(const status of ['active','review','done'])assert.equal(api.canMove({status,assignedTo:null}),false);
  assert.equal(api.canMove({status:'ready',assignedTo:'auditor'}),false);
  assert.equal(api.canMove({status:'parked',assignedTo:null}),true);
});
test('routing weight is labeled as weight, never proof of correctness', () => {
  const {api}=ui();assert.match(api.routeWeight(0.91),/91.0% choice weight/);
  assert.equal(api.routeWeight(null),'Weight not recorded');assert.equal(api.routeWeight(2),'Weight not recorded');
});
test('the review UI has no router-launch or target-testing call', () => {
  const source=fs.readFileSync('desktop/web/hunts.js','utf8');
  assert.doesNotMatch(source,/runHuntBoard|runHunt\(|\/hunts\/[^\n]*\/run/);
});
test('live Studio fallback profiles and semantic tool catalog match backend concepts', () => {
  const context={window:{},location:{hash:''},localStorage:{getItem:()=>null}};
  vm.runInNewContext(fs.readFileSync('desktop/web/ui/model.js','utf8'),context);
  const m=context.window.EutryaStudio;
  assert.deepEqual(Array.from(m.defaults,p=>p.id),['admin','auditor','operator','sentinel','analyst']);
  assert.ok(m.names.includes('hunts'));
  for(const key of ['code_surface','code_symbol','code_references','code_inspect','code_state','code_compare','hunt_board'])assert.ok(m.toolGroups.some(g=>g.keys.includes(key)));
});
