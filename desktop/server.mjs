#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NativeSwarm } from '../src/swarm/swarm.mjs';
import { Knowledge } from '../src/knowledge.mjs';
import { loadConfig, validateConfig } from '../src/config.mjs';
import { loadEnvFile, profileConfigPath, saveSecret } from '../src/environment.mjs';
import { atomicJson } from '../src/local-state.mjs';
import { providerSettings, textModelReady } from '../src/providers/gateway.mjs';
import { redactor, insist, clip, uid } from '../src/util.mjs';
import { editReviewBoard, withEditToken } from './review-board.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BUILD_VERSION = JSON.parse(fs.readFileSync(path.join(HERE,'..','package.json'),'utf8')).version;
const args = parseArgs(process.argv.slice(2));
const host = '127.0.0.1';
const requestedPort = numberArg(args.port, 32117, 1, 65535);
const workspace = realWorkspace(args.workspace ?? process.env.EUTRYA_WORKSPACE ?? process.cwd());
const profile = String(args.profile ?? 'default');
const explicitDemo = Boolean(args.demo || process.env.EUTRYA_DESKTOP_DEMO === '1');
const configFile = path.resolve(args.config ?? profileConfigPath(profile));
const redact = redactor();

let config = null;
let swarm = null;
let knowledge = null;
let readinessError = null;
let startupError = null;
let eventCursor = 0;
const events = [];
const approvalQueue = new Map();
let starting = null;

loadPrivateEnvironment(configFile);
await ensureRuntime();

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    if (['demo'].includes(key)) { out[key] = true; continue; }
    out[key] = argv[i + 1];
    i++;
  }
  return out;
}
function numberArg(value, fallback, lo, hi) {
  const n = Number(value ?? fallback);
  insist(Number.isInteger(n) && n >= lo && n <= hi, `Expected integer ${lo}..${hi}`);
  return n;
}
function realWorkspace(value) {
  const p = path.resolve(String(value || os.homedir()));
  fs.mkdirSync(p, { recursive: true });
  return fs.realpathSync(p);
}
function loadPrivateEnvironment(file) {
  const base = path.dirname(file);
  for (const candidate of [path.join(base, '.env'), path.join(base, 'env'), path.join(os.homedir(), '.config', 'eutrya', '.env'), path.join(os.homedir(), '.config', 'eutrya', 'env')]) {
    try { loadEnvFile(candidate, { optional: true }); } catch (err) { pushEvent('desktop.env_error', { file: candidate, error: err.message }); }
  }
}
function pushEvent(type, data = {}, agent = null, agentId = null) {
  const row = { cursor: ++eventCursor, at: new Date().toISOString(), type, data: redact(data), agent, agentId };
  events.push(row);
  if (events.length > 500) events.splice(0, events.length - 500);
  return row;
}
function approval(action, signal) {
  return new Promise(resolve => {
    const id = `approval-${uid().slice(0, 10)}`;
    const row = { id, action: redact(action), createdAt: new Date().toISOString(), status: 'pending' };
    let done = false;
    const finish = approved => {
      if (done) return;
      done = true;
      row.status = approved ? 'approved' : 'denied';
      row.resolvedAt = new Date().toISOString();
      approvalQueue.delete(id);
      signal?.removeEventListener('abort', abort);
      clearTimeout(timer);
      pushEvent('desktop.approval_resolved', { id, approved });
      resolve(Boolean(approved));
    };
    const abort = () => finish(false);
    const timer = setTimeout(() => finish(false), 10 * 60 * 1000);
    signal?.addEventListener('abort', abort, { once: true });
    row.finish = finish;
    approvalQueue.set(id, row);
    pushEvent('desktop.approval_required', { id, action: row.action });
  });
}
function publicApproval(row) {
  return { id: row.id, action: row.action, createdAt: row.createdAt, status: row.status };
}
function configView() {
  if (!config) return null;
  const p = providerSettings(config);
  return {
    mainProvider: config.mainProvider,
    mainModel: config.mainModel,
    jevModel: config.jevModel,
    maxSteps: config.maxSteps,
    maxCalls: config.maxCalls,
    maxOutputTokens: config.maxOutputTokens,
    timeoutMs: config.timeoutMs,
    retries: config.retries,
    autoWrite: config.autoWrite,
    allowExec: config.allowExec,
    jevCompaction: config.jevCompaction,
    dataRoot: config.dataRoot,
    sessionRoot: config.sessionRoot,
    mainKeyEnv: p.keyEnv,
    mainKeyPresent: Boolean(process.env[p.keyEnv]),
    jevKeyPresent: Boolean(process.env.AI_GATEWAY_API_KEY),
    configFile,
    workspace,
  };
}
function readiness() {
  return {
    ready: Boolean(swarm),
    demo: explicitDemo,
    mode: explicitDemo ? 'demo' : (swarm ? 'live' : 'setup'),
    error: readinessError ?? startupError,
    node: process.versions.node,
    bridgeVersion: BUILD_VERSION,
    runtimeRoot: path.resolve(HERE,'..'),
  };
}
async function ensureRuntime({ force = false } = {}) {
  if (starting) return starting;
  if (swarm && !force) return swarm;
  starting = (async () => {
    try {
      if (swarm) { try { await swarm.close(); } catch {} swarm = null; }
      loadPrivateEnvironment(configFile);
      config = loadConfig(configFile);
      knowledge = new Knowledge(config.dataRoot, `desktop:${profile}`, { redact });
      readinessError = null;
      if (!explicitDemo) {
        try {
          insist(process.env.AI_GATEWAY_API_KEY, 'AI_GATEWAY_API_KEY is not configured. Open Settings or configure ~/.config/eutrya/.env.');
          textModelReady(config);
        } catch (err) {
          readinessError = err.message;
          pushEvent('desktop.not_ready', { error: readinessError });
          return null;
        }
      }
      swarm = new NativeSwarm({
        config,
        workspace,
        demo: explicitDemo,
        approve: approval,
        onEvent: row => pushEvent(row.type, row.data, row.agent ?? null, row.agentId ?? null),
        redact,
      });
      pushEvent('desktop.runtime_ready', { mode: explicitDemo ? 'demo' : 'live', workspace, model: config.mainModel, provider: config.mainProvider });
      return swarm;
    } catch (err) {
      startupError = err.message;
      pushEvent('desktop.runtime_error', { error: startupError });
      return null;
    } finally {
      starting = null;
    }
  })();
  return starting;
}
function swarmView() {
  if (!swarm) return null;
  return {
    matrix: swarm.statusMatrix(),
    profiles: swarm.listAgents(),
    model: swarm.modelStatus(),
    workspace: {
      tasks: swarm.sharedWorkspace.listTasks(),
      findings: swarm.sharedWorkspace.listFindings(),
      decisions: swarm.sharedWorkspace.listDecisions(),
      artifacts: swarm.sharedWorkspace.listArtifacts(),
      messages: swarm.sharedWorkspace.listMessages({ limit: 120 }),
      blockers: swarm.sharedWorkspace.listBlockers({ unresolvedOnly: false }),
      hunts: swarm.sharedWorkspace.listHunts().map(withEditToken),
      huntCards: swarm.sharedWorkspace.listHuntCards().map(withEditToken),
      summary: swarm.sharedWorkspace.summary(),
    },
  };
}
function stateView() {
  return {
    readiness: readiness(),
    capabilities: { desktopReviewBoard: true, huntExecutionControls: false },
    config: configView(),
    swarm: swarmView(),
    memory: knowledge ? { items: knowledge.memories(''), skills: knowledge.listSkills() } : { items: [], skills: [] },
    approvals: Array.from(approvalQueue.values()).map(publicApproval),
    events: events.slice(-120),
  };
}
function json(res, code, value, extra = {}) {
  const body = JSON.stringify(value);
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...corsHeaders(), ...extra });
  res.end(body);
}
function corsHeaders(req = null) {
  const origin = req?.headers?.origin;
  const allowed = !origin || origin === 'tauri://localhost' || origin === 'http://tauri.localhost' || origin.startsWith?.('http://127.0.0.1:') || origin.startsWith?.('http://localhost:');
  return {
    'access-control-allow-origin': allowed && origin ? origin : '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'access-control-allow-headers': 'content-type,x-eutrya-desktop',
    'vary': 'origin',
  };
}
function authorized(req) {
  const origin = req.headers.origin ?? '';
  const allowedOrigin = !origin || origin === 'tauri://localhost' || origin === 'http://tauri.localhost' || origin.startsWith('http://127.0.0.1:') || origin.startsWith('http://localhost:');
  return allowedOrigin && req.headers['x-eutrya-desktop'] === '1';
}
async function body(req, maxBytes = 256_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Request body too large'), { statusCode: 413 });
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8');
  return JSON.parse(text);
}
function pathParts(req) {
  const url = new URL(req.url, `http://${host}:${requestedPort}`);
  return { url, parts: url.pathname.split('/').filter(Boolean) };
}
async function dispatchRoute(req, res) {
  const { url, parts } = pathParts(req);
  if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders(req)); return res.end(); }
  if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, ...readiness() });
  if (!authorized(req)) return json(res, 403, { error: 'Desktop bridge request rejected' });

  if (url.pathname.startsWith('/api/review/')) {
    const edited = editReviewBoard(swarm, req.method, url.pathname, await body(req));
    const {code, ...result} = edited;
    return json(res, code, {...result, state: stateView()});
  }
  if (req.method === 'GET' && url.pathname === '/api/state') return json(res, 200, stateView());
  if (req.method === 'GET' && url.pathname === '/api/events') {
    const since = Number(url.searchParams.get('since') || 0);
    return json(res, 200, { events: events.filter(e => e.cursor > since).slice(-200), cursor: eventCursor });
  }
  if (req.method === 'POST' && url.pathname === '/api/reload') {
    startupError = null;
    await ensureRuntime({ force: true });
    return json(res, swarm ? 200 : 503, stateView());
  }
  if (req.method === 'POST' && url.pathname === '/api/chat') {
    const input = await body(req);
    insist(typeof input.text === 'string' && input.text.trim(), 'Chat text is required');
    const active = await ensureRuntime();
    if (!active) return json(res, 503, { error: readinessError ?? startupError ?? 'Runtime not ready', state: stateView() });
    const text = input.agentId ? `@${input.agentId} ${input.text.trim()}` : input.text.trim();
    pushEvent('desktop.user_message', { text: clip(input.text, 4000), agentId: input.agentId ?? null });
    const result = await active.dispatch(text, { onToken: token => pushEvent('desktop.token', { token }, 'Admin', 'admin') });
    return json(res, 200, { result, state: stateView() });
  }
  if (req.method === 'POST' && url.pathname === '/api/stop') {
    if (swarm) for (const r of swarm.runtimes.values()) if (r.busy) r.stop();
    return json(res, 200, { ok: true });
  }
  if (req.method === 'GET' && url.pathname === '/api/hunts') {
    insist(swarm, 'Runtime not ready');
    return json(res, 200, { hunts: swarm.sharedWorkspace.listHunts().map(withEditToken), cards: swarm.sharedWorkspace.listHuntCards() });
  }
  if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'hunts' && parts[2] && parts[3] === 'run') {
    insist(swarm, 'Runtime not ready');
    const result = await swarm.runHuntBoard(parts[2], { source: 'desktop' });
    return json(res, 200, { result, state: stateView() });
  }
  if (req.method === 'POST' && url.pathname === '/api/focus') {
    const input = await body(req); insist(swarm, 'Runtime not ready');
    const profile = swarm.focusAgent(input.agentId ?? input.name);
    return json(res, 200, { profile, state: stateView() });
  }
  if (req.method === 'POST' && url.pathname === '/api/template') {
    const input = await body(req); insist(swarm, 'Runtime not ready');
    const result = swarm.applyTemplate(input.template);
    return json(res, 200, { result, state: stateView() });
  }
  if (req.method === 'PATCH' && parts[0] === 'api' && parts[1] === 'agents' && parts[2]) {
    const input = await body(req); insist(swarm, 'Runtime not ready');
    const allowed = {};
    for (const k of ['name','role','profession','instructions','model','enabled','tools']) if (Object.hasOwn(input, k)) allowed[k] = input[k];
    const profile = swarm.updateAgent(parts[2], allowed);
    return json(res, 200, { profile, state: stateView() });
  }
  if (req.method === 'POST' && url.pathname === '/api/agents') {
    const input = await body(req); insist(swarm, 'Runtime not ready');
    const profile = swarm.addAgent(input);
    return json(res, 201, { profile, state: stateView() });
  }
  if (req.method === 'DELETE' && parts[0] === 'api' && parts[1] === 'agents' && parts[2]) {
    insist(swarm, 'Runtime not ready');
    const removed = swarm.removeAgent(parts[2]);
    return json(res, 200, { removed, state: stateView() });
  }
  if (req.method === 'GET' && url.pathname === '/api/memory') {
    const q = url.searchParams.get('q') ?? '';
    return json(res, 200, { items: knowledge?.memories(q) ?? [] });
  }
  if (req.method === 'POST' && url.pathname === '/api/memory') {
    const input = await body(req); insist(knowledge, 'Knowledge store not ready');
    const item = knowledge.remember(input.text, { source: 'desktop-operator', approved: true });
    return json(res, 201, { item, state: stateView() });
  }
  if (req.method === 'DELETE' && parts[0] === 'api' && parts[1] === 'memory' && parts[2]) {
    insist(knowledge, 'Knowledge store not ready');
    return json(res, 200, { removed: knowledge.forget(parts[2]), state: stateView() });
  }
  if (req.method === 'POST' && parts[0] === 'api' && parts[1] === 'approvals' && parts[2]) {
    const input = await body(req); const row = approvalQueue.get(parts[2]);
    if (!row) return json(res, 404, { error: 'Approval is no longer pending' });
    row.finish(Boolean(input.approved));
    return json(res, 200, { ok: true, state: stateView() });
  }
  if (req.method === 'POST' && url.pathname === '/api/credentials') {
    const input = await body(req, 16_384);
    const allowed = new Set(['AI_GATEWAY_API_KEY','OPENROUTER_API_KEY','EUTRYA_COMPATIBLE_API_KEY']);
    insist(allowed.has(input.name), 'Unsupported credential name');
    insist(typeof input.value === 'string' && input.value.trim(), 'Credential value is required');
    const envFile = path.join(path.dirname(configFile), '.env');
    saveSecret(envFile, input.name, input.value.trim());
    process.env[input.name] = input.value.trim();
    pushEvent('desktop.credential_saved', { name: input.name });
    await ensureRuntime({ force: true });
    return json(res, swarm ? 200 : 503, stateView());
  }
  if (req.method === 'PATCH' && url.pathname === '/api/settings') {
    const input = await body(req); insist(config, 'Config not loaded');
    const next = { ...config };
    const safe = ['mainProvider','mainModel','maxSteps','maxCalls','maxOutputTokens','timeoutMs','retries','autoWrite','allowExec','jevCompaction','jevZeroDataRetention','maxKnownCostUsd'];
    for (const k of safe) if (Object.hasOwn(input, k)) next[k] = input[k];
    validateConfig(next);
    atomicJson(configFile, next);
    config = next;
    await ensureRuntime({ force: true });
    return json(res, swarm ? 200 : 503, stateView());
  }
  return json(res, 404, { error: 'Not found' });
}

const server = http.createServer((req, res) => {
  Promise.resolve(dispatchRoute(req, res)).catch(err => {
    const code = Number(err.statusCode) || 400;
    pushEvent('desktop.request_error', { method: req.method, url: req.url, error: err.message });
    json(res, code, { error: redact(err.message), state: stateView() });
  });
});

server.listen(requestedPort, host, () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : requestedPort;
  console.log(`EUTRYA_BRIDGE_READY ${port}`);
});

async function shutdown() {
  server.close();
  for (const row of approvalQueue.values()) row.finish(false);
  try { await swarm?.close(); } catch {}
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
process.once('SIGHUP', shutdown);
