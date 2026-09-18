import { object, string, integer, insist, keys } from './util.mjs';

export const MODES = ['observe', 'explore', 'deepen', 'reconsider', 'verify'];
export const ACTION_HELP = {
  list: 'List a workspace directory: {type:"list",path:"."}',
  read: 'Read text and its current SHA-256: {type:"read",path:"src/file.js",startLine:1,endLine:160}',
  search: 'Literal case-insensitive text search, not regex: {type:"search",path:".",text:"TODO"}',
  code_surface: 'Map local code structure and externally reachable functions: {type:"code_surface",path:"."}',
  code_symbol: 'Find definitions and mentions of a code symbol: {type:"code_symbol",path:".",query:"withdraw"}',
  code_references: 'Find references and enclosing callers for a symbol: {type:"code_references",path:".",symbol:"withdraw"}',
  code_inspect: 'Inspect one function/modifier and extract calls, modifiers and state writes: {type:"code_inspect",path:"contracts/Vault.sol",symbol:"withdraw"}',
  code_state: 'Trace reads and writes of a state-like symbol: {type:"code_state",path:".",symbol:"totalAssets"}',
  code_compare: 'Compare functions in one file structurally: {type:"code_compare",path:"contracts/Vault.sol",symbols:["withdraw","redeem"]}',
  mkdir: 'Create one workspace directory (parent must exist): {type:"mkdir",path:"src"}',
  write: 'Create/replace text: {type:"write",path:"file.js",content:"...",expectedSha256:null}. null means create ONLY. Existing files require the hash from read.',
  edit: 'Replace exactly one occurrence: {type:"edit",path:"file.js",oldText:"...",newText:"...",expectedSha256:"64 hex chars"}',
  run: 'Request an operator-approved local process, NOT a shell string: {type:"run",program:"npm",args:["test"]}. Only available when the operator enables it.',
  shell: 'Execute a command in the workspace shell (requires operator approval): {type:"shell",command:"ls -la"}',
  browser: 'Navigate to a URL with headless browser and extract readable content and links: {type:"browser",url:"https://example.com"}',
  remember: 'Propose user-relevant long-term memory (requires approval): {type:"remember",text:"..."}',
  memory_search: 'Search approved persistent memory: {type:"memory_search",query:"..."}',
  skill: 'Read an installed procedural reference: {type:"skill",name:"skill-name"}',
  skill_draft: 'Save a procedural skill DRAFT for operator review: {type:"skill_draft",name:"name",content:"markdown"}',
  mcp: 'Call an explicitly configured external tool (always needs approval): {type:"mcp",server:"name",tool:"name",arguments:{}}. See task context for allowed tool schemas.',
  note: 'Save a concise hypothesis or conclusion, not private chain-of-thought: {type:"note",text:"..."}',
  recall: 'Retrieve a complete prior observation by ID: {type:"recall",observationId:"o1"}',
  ask: 'Pause for genuinely missing information: {type:"ask",question:"..."}',
  finish: 'Return the answer: {type:"finish",answer:"..."}. This does NOT by itself verify correctness.',
  look: 'Observe the local switchboard: {type:"look"}',
  press: 'Press one observed switch: {type:"press",switch:0}. Valid indices: 0..3.',
  delegate: 'Delegate a task to a specialized agent in the swarm: {type:"delegate",to:"auditor",task:"..."}',
  send_message: 'Send a message or review request to another agent: {type:"send_message",to:"sentinel",message:"..."}',
  publish_finding: 'Publish a finding to the shared workspace: {type:"publish_finding",topic:"...",content:"..."}',
  record_decision: 'Record a major organizational decision: {type:"record_decision",title:"...",rationale:"..."}',
  update_task: 'Update the status of a shared task: {type:"update_task",taskId:"task-1",status:"completed"}',
  consult_swarm: 'Query the shared workspace (tasks, findings, agent status): {type:"consult_swarm",query:"all"}'
};
const fields = {
  remember:['type','text'], memory_search:['type','query'], skill:['type','name'], skill_draft:['type','name','content'],
  mcp:['type','server','tool','arguments'],
  list: ['type','path'], read: ['type','path','startLine','endLine'], search: ['type','path','text'],
  code_surface:['type','path'], code_symbol:['type','path','query'], code_references:['type','path','symbol'], code_inspect:['type','path','symbol'], code_state:['type','path','symbol'], code_compare:['type','path','symbols'],
  mkdir: ['type','path'], write: ['type','path','content','expectedSha256'], edit: ['type','path','oldText','newText','expectedSha256'],
  run: ['type','program','args'], shell: ['type','command'], browser: ['type','url'], note: ['type','text'], recall: ['type','observationId'],
  ask: ['type','question'], finish: ['type','answer'], look: ['type'], press: ['type','switch'],
  delegate: ['type','to','task'], send_message: ['type','to','message'], publish_finding: ['type','topic','content'],
  record_decision: ['type','title','rationale'], update_task: ['type','taskId','status'], consult_swarm: ['type','query']
};
export function validateAction(value) {
  const a = object(value, 'action');
  insist(typeof a.type === 'string' && Object.hasOwn(fields, a.type), 'Unknown action type');
  keys(a, fields[a.type], 'action');
  for (const k of fields[a.type]) insist(Object.hasOwn(a, k), `action.${k} is required`);
  if ('path' in a) string(a.path, 'path', 512);
  if (a.type === 'read') { integer(a.startLine,'startLine',1,1000000); integer(a.endLine,'endLine',a.startLine,a.startLine+399); }
  if (a.type === 'search') string(a.text, 'search text', 200);
  if (a.type === 'code_symbol') string(a.query,'code query',120);
  if (['code_references','code_inspect','code_state'].includes(a.type)) string(a.symbol,'code symbol',120);
  if (a.type === 'code_compare') insist(Array.isArray(a.symbols)&&a.symbols.length>=2&&a.symbols.length<=8&&a.symbols.every(x=>typeof x==='string'&&x.length>=1&&x.length<=120),'code_compare requires 2..8 symbols');
  if (a.type === 'write') { insist(typeof a.content === 'string' && a.content.length <= 32000, 'write content exceeds 32000 characters'); }
  if (['write','edit'].includes(a.type)) {
    insist((a.type === 'write' && a.expectedSha256 === null) || /^[a-f0-9]{64}$/.test(a.expectedSha256), 'Expected a SHA-256 hash (or null for a NEW file)');
  }
  if (a.type === 'edit') {
    string(a.oldText,'oldText',16000); insist(typeof a.newText === 'string' && a.newText.length <= 32000,'Invalid newText');
  }
  if (a.type === 'run') {
    string(a.program,'program',512);
    insist(!a.program.includes('\0'), 'NUL in program');
    insist(Array.isArray(a.args) && a.args.length <= 64 && a.args.every(x => typeof x === 'string' && x.length <= 4000 && !x.includes('\0')), 'Invalid process args');
  }
  if (a.type === 'shell') {
    string(a.command, 'command', 8000);
    insist(!a.command.includes('\0'), 'NUL in command');
  }
  if (a.type === 'browser') {
    string(a.url, 'url', 2048);
    insist(/^https?:\/\//i.test(a.url), 'Browser URL must start with http:// or https://');
  }
  if (a.type==='remember') string(a.text,'memory',1600);
  if (a.type==='memory_search') insist(typeof a.query==='string'&&a.query.length<=200,'Invalid memory query');
  if (['skill','skill_draft'].includes(a.type)) insist(/^[a-z0-9][a-z0-9_-]{0,59}$/.test(a.name),'Invalid skill name');
  if (a.type==='skill_draft') string(a.content,'skill content',24000);
  if (a.type==='mcp') { string(a.server,'MCP server',80);string(a.tool,'MCP tool',120);object(a.arguments,'MCP arguments');insist(JSON.stringify(a.arguments).length<=16000,'MCP arguments too large'); }
  if (a.type === 'note') string(a.text,'note',1600);
  if (a.type === 'recall') insist(/^o[1-9][0-9]*$/.test(a.observationId),'Invalid observation ID');
  if (a.type === 'ask') string(a.question,'question',2000);
  if (a.type === 'finish') string(a.answer,'answer',16000);
  if (a.type === 'press') integer(a.switch,'switch',0,3);
  if (a.type === 'delegate') { string(a.to, 'to', 64); string(a.task, 'task', 4000); }
  if (a.type === 'send_message') { string(a.to, 'to', 64); string(a.message, 'message', 4000); }
  if (a.type === 'publish_finding') { string(a.topic, 'topic', 200); string(a.content, 'content', 4000); }
  if (a.type === 'record_decision') { string(a.title, 'title', 200); string(a.rationale, 'rationale', 4000); }
  if (a.type === 'update_task') {
    string(a.taskId, 'taskId', 64);
    insist(['backlog','in_progress','review','blocked','completed'].includes(a.status), 'Invalid task status');
  }
  if (a.type === 'consult_swarm') string(a.query, 'query', 200);
  return structuredClone(a);
}
export function validateProposal(raw, knownEvidence = null) {
  let p = raw;
  if (typeof p === 'string') {
    const t = p.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
    try { p = JSON.parse(t); } catch { throw new Error('Main model did not return a valid JSON proposal; nothing executed'); }
  }
  object(p,'proposal');
  // Unwrap envelope if model nested the proposal in an auxiliary property
  if (!p.candidates && p.proposal && typeof p.proposal === 'object' && !Array.isArray(p.proposal)) {
    p = p.proposal;
  } else if (!p.candidates && p.data && typeof p.data === 'object' && !Array.isArray(p.data)) {
    p = p.data;
  }
  // Discard any auxiliary fields (e.g. thinking, reasoning, notes, rationale) emitted by models
  for (const k of Object.keys(p)) {
    if (!['summary','hypotheses','unknowns','candidates'].includes(k)) delete p[k];
  }
  keys(p,['summary','hypotheses','unknowns','candidates'],'proposal');
  string(p.summary,'summary',1600);
  for (const k of ['hypotheses','unknowns']) {
    if (p[k] === undefined) p[k] = [];
    insist(Array.isArray(p[k]) && p[k].length <= 6 && p[k].every(x => typeof x === 'string' && x.length <= 600), `Invalid ${k}`);
  }
  insist(Array.isArray(p.candidates) && p.candidates.length >= 1 && p.candidates.length <= 3, 'Propose one to three candidates');
  const ids = new Set();
  for (const c of p.candidates) {
    object(c,'candidate');
    for (const k of Object.keys(c)) {
      if (!['id','summary','evidence','expected','action'].includes(k)) delete c[k];
    }
    keys(c,['id','summary','evidence','expected','action'],'candidate');
    insist(typeof c.id === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(c.id) && !ids.has(c.id), 'Candidate IDs must be unique, simple strings'); ids.add(c.id);
    string(c.summary,'candidate summary',700); string(c.expected,'expected observation',700);
    if (c.evidence === undefined) c.evidence = [];
    insist(Array.isArray(c.evidence) && c.evidence.length <= 12 && c.evidence.every(x => typeof x === 'string' && /^o[1-9][0-9]*$/.test(x)), 'Invalid evidence references');
    if (knownEvidence) insist(c.evidence.every(x => knownEvidence.has(x)), 'Proposal cites an unknown observation');
    validateAction(c.action);
  }
  return structuredClone(p);
}
export const PROPOSAL_EXAMPLE = {
  summary: 'Concise task-relevant conclusion, not a private reasoning transcript.',
  hypotheses: ['Clearly labelled, unverified interpretation.'], unknowns: ['Missing evidence.'],
  candidates: [{id:'a',summary:'Inspect the relevant source',evidence:[],expected:'Locate the function to change',action:{type:'list',path:'.'}}]
};
