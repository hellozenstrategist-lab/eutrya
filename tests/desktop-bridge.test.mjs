import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function port() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const p = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return p;
}

async function waitReady(child) {
  return new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error(`bridge did not become ready: ${text}`)), 7000);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      text += chunk;
      const m = text.match(/EUTRYA_BRIDGE_READY\s+(\d+)/);
      if (m) { clearTimeout(timer); resolve(Number(m[1])); }
    });
    child.once('exit', code => { clearTimeout(timer); reject(new Error(`bridge exited early: ${code}`)); });
  });
}

async function call(base, url, init = {}) {
  const response = await fetch(base + url, {
    ...init,
    headers: { 'X-Eutrya-Desktop': '1', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) }
  });
  const body = await response.json();
  assert.equal(response.ok, true, JSON.stringify(body));
  return body;
}

test('desktop bridge exposes current security swarm and shared hunt state', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eutrya-desktop-'));
  const configHome = path.join(dir, 'config');
  const workspace = path.join(dir, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  const p = await port();
  const child = spawn(process.execPath, [path.join(ROOT, 'desktop/server.mjs'), '--demo', '--port', String(p), '--workspace', workspace], {
    cwd: ROOT,
    env: { ...process.env, EUTRYA_CONFIG_HOME: configHome },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  t.after(() => { child.kill('SIGTERM'); fs.rmSync(dir, { recursive: true, force: true }); });
  const actualPort = await waitReady(child);
  const base = `http://127.0.0.1:${actualPort}`;

  const health = await fetch(base + '/health').then(r => r.json());
  assert.equal(health.ready, true);
  assert.equal(health.mode, 'demo');
  assert.equal(health.bridgeVersion, '0.4.2');

  const state = await call(base, '/api/state');
  assert.equal(state.swarm.profiles.length, 5);
  assert.deepEqual(state.swarm.profiles.map(x => x.id).sort(), ['admin','analyst','auditor','operator','sentinel']);
  assert.equal(state.swarm.matrix.primaryAgent, 'admin');
  assert.ok(Array.isArray(state.swarm.workspace.hunts));
  assert.ok(Array.isArray(state.swarm.workspace.huntCards));

  const chat = await call(base, '/api/chat', { method: 'POST', body: JSON.stringify({ text: 'hello' }) });
  assert.equal(chat.result.agentId, 'admin');
  assert.match(chat.result.answer, /Offline demo answer/);

  const memory = await call(base, '/api/memory', { method: 'POST', body: JSON.stringify({ text: 'desktop bridge test' }) });
  assert.ok(memory.state.memory.items.some(x => x.text === 'desktop bridge test'));

  const focus = await call(base, '/api/focus', { method: 'POST', body: JSON.stringify({ agentId: 'auditor' }) });
  assert.equal(focus.state.swarm.matrix.activeFocus, 'auditor');

  const hunts = await call(base, '/api/hunts');
  assert.deepEqual(hunts.hunts, []);
  assert.deepEqual(hunts.cards, []);
});
