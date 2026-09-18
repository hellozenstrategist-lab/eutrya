import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NativeSwarm } from '../src/swarm/swarm.mjs';
import { SharedWorkspace } from '../src/swarm/workspace.mjs';
import { SwarmEventBus, SWARM_EVENTS } from '../src/swarm/events.mjs';
import { DEFAULT_PROFILES, TEMPLATES, validateProfile } from '../src/swarm/profile.mjs';
import { validateAction } from '../src/schema.mjs';
import { loadConfig } from '../src/config.mjs';

function setupSwarmTest(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eutrya-swarm-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = loadConfig(undefined, { sessionRoot: path.join(root, 'state'), mainModel: 'mock/text' });
  const swarm = new NativeSwarm({
    config,
    workspace: root,
    demo: true
  });
  t.after(() => swarm.close());
  return { root, config, swarm };
}

test('Native Swarm initializes with the five default persistent agent profiles', t => {
  const { swarm } = setupSwarmTest(t);
  const agents = swarm.listAgents();
  assert.equal(agents.length, 5);

  const ids = agents.map(a => a.id).sort();
  assert.deepEqual(ids, ['admin', 'engineer', 'finance', 'legal', 'researcher']);

  const admin = swarm.getAgent('admin');
  assert.equal(admin.name, 'Admin');
  assert.equal(admin.role, 'Chief of Staff & Swarm Orchestrator');

  const engineer = swarm.getAgent('engineer');
  assert.equal(engineer.name, 'Engineer');
  assert.match(engineer.profession, /Software Engineering/);

  const legal = swarm.getAgent('legal');
  assert.equal(legal.name, 'Legal');
  assert.match(legal.profession, /Legal Research/);

  const finance = swarm.getAgent('finance');
  assert.equal(finance.name, 'Finance');
  assert.match(finance.profession, /Financial Modeling/);

  const researcher = swarm.getAgent('researcher');
  assert.equal(researcher.name, 'Researcher');
  assert.match(researcher.profession, /Deep Research/);
});

test('Swarm profiles support renaming, updating, adding, and removing agents', t => {
  const { swarm } = setupSwarmTest(t);

  // Rename
  const renamed = swarm.renameAgent('engineer', 'LeadBuilder');
  assert.equal(renamed.name, 'LeadBuilder');
  assert.equal(swarm.getAgent('engineer').name, 'LeadBuilder');

  // Update
  const updated = swarm.updateAgent('finance', { role: 'CFO & Capital Allocator' });
  assert.equal(updated.role, 'CFO & Capital Allocator');

  // Add agent
  const added = swarm.addAgent({
    id: 'security',
    name: 'Security Analyst',
    role: 'Application Security Engineer',
    profession: 'Vulnerability Analysis & Fuzzing',
    instructions: 'Audit code for security vulnerabilities, memory safety, and logic bugs.',
    tools: ['list', 'read', 'search', 'note', 'finish'],
    enabled: true
  });
  assert.equal(added.id, 'security');
  assert.equal(swarm.listAgents().length, 6);

  // Remove agent
  const removed = swarm.removeAgent('security');
  assert.equal(removed, true);
  assert.equal(swarm.listAgents().length, 5);
  assert.equal(swarm.getAgent('security'), null);
});

test('Swarm supports switching to organization templates', t => {
  const { swarm } = setupSwarmTest(t);

  // Switch to startup template
  const startupAgents = swarm.applyTemplate('startup');
  assert.equal(swarm.activeTemplate, 'startup');
  const names = startupAgents.map(a => a.id).sort();
  assert.deepEqual(names, ['ceo', 'engineer', 'finance', 'growth', 'product']);

  // Switch to engineering template
  const engAgents = swarm.applyTemplate('engineering');
  assert.equal(swarm.activeTemplate, 'engineering');
  const engNames = engAgents.map(a => a.id).sort();
  assert.deepEqual(engNames, ['architect', 'backend', 'frontend', 'qa', 'researcher']);

  // Switch back to default
  swarm.applyTemplate('default');
  assert.equal(swarm.activeTemplate, 'default');
  assert.equal(swarm.listAgents().length, 5);
});

test('SharedWorkspace manages tasks, findings, decisions, and blockers', () => {
  const ws = new SharedWorkspace();
  ws.initAgent('admin', { name: 'Admin', role: 'Chief of Staff' });
  ws.initAgent('engineer', { name: 'Engineer', role: 'Systems Engineer' });

  // Tasks
  const task = ws.createTask({
    title: 'Implement Jev cognitive layer',
    description: 'Ensure evaluation runs under all actions',
    assignedTo: 'engineer',
    createdBy: 'admin'
  });
  assert.ok(task.id.startsWith('task-'));
  assert.equal(task.status, 'backlog');

  ws.updateTask(task.id, { status: 'in_progress' });
  assert.equal(ws.getTask(task.id).status, 'in_progress');

  // Findings
  const finding = ws.publishFinding({
    author: 'engineer',
    topic: 'Architecture verification',
    content: 'Jev evaluator runs deterministically on all action selections',
    evidence: ['o1', 'o2']
  });
  assert.ok(finding.id.startsWith('find-'));
  assert.equal(ws.listFindings().length, 1);

  // Decisions
  const decision = ws.recordDecision({
    author: 'admin',
    title: 'Adopt asynchronous targeted events',
    rationale: 'Avoids waking every agent on every message'
  });
  assert.ok(decision.id.startsWith('dec-'));
  assert.equal(ws.listDecisions().length, 1);

  // Blockers
  const blocker = ws.addBlocker({
    agent: 'engineer',
    description: 'Missing API key'
  });
  assert.equal(ws.listBlockers().length, 1);
  ws.resolveBlocker(blocker.id);
  assert.equal(ws.listBlockers({ unresolvedOnly: true }).length, 0);

  // Summary for context injection
  const summary = ws.summary();
  assert.ok(Array.isArray(summary.activeTasks));
  assert.ok(Array.isArray(summary.recentFindings));
});

test('SwarmEventBus dispatches targeted events without broadcasting to all agents', async () => {
  const bus = new SwarmEventBus();
  const received = [];

  bus.on(SWARM_EVENTS.TASK_ASSIGNED, ev => {
    received.push(ev);
  });

  bus.on(SWARM_EVENTS.LEGAL_REVIEW_REQUIRED, ev => {
    received.push(ev);
  });

  await bus.emit({
    type: SWARM_EVENTS.TASK_ASSIGNED,
    from: 'admin',
    to: 'engineer',
    payload: { task: 'Verify code' }
  });

  await bus.emit({
    type: SWARM_EVENTS.LEGAL_REVIEW_REQUIRED,
    from: 'admin',
    to: 'legal',
    payload: { message: 'Check terms' }
  });

  assert.equal(received.length, 2);
  assert.equal(received[0].to, 'engineer');
  assert.equal(received[1].to, 'legal');
});

test('Swarm actions pass strict schema validation', () => {
  assert.doesNotThrow(() => validateAction({
    type: 'delegate',
    to: 'engineer',
    task: 'Investigate technical feasibility'
  }));

  assert.doesNotThrow(() => validateAction({
    type: 'send_message',
    to: 'finance',
    message: 'Estimate the token cost of this run'
  }));

  assert.doesNotThrow(() => validateAction({
    type: 'publish_finding',
    topic: 'Unit Economics',
    content: 'Estimated cost is $0.002 per task'
  }));

  assert.doesNotThrow(() => validateAction({
    type: 'record_decision',
    title: 'Migrate to Native Swarm',
    rationale: 'Multi-agent specialist organization'
  }));

  assert.doesNotThrow(() => validateAction({
    type: 'update_task',
    taskId: 'task-1',
    status: 'completed'
  }));

  assert.doesNotThrow(() => validateAction({
    type: 'consult_swarm',
    query: 'all'
  }));

  // Rejects invalid types or missing required fields
  assert.throws(() => validateAction({ type: 'delegate', to: 'engineer' }));
  assert.throws(() => validateAction({ type: 'update_task', taskId: 't1', status: 'invalid_status' }));
});

test('Direct conversation with @Agent routes to that specialist', async t => {
  const { swarm } = setupSwarmTest(t);

  // Focus directly on Engineer
  const focused = swarm.focusAgent('engineer');
  assert.equal(focused.id, 'engineer');
  assert.equal(swarm.activeAgentId, 'engineer');

  // Direct dispatch with @mention
  const result = await swarm.dispatch('@Legal Review this regulatory constraint');
  assert.equal(result.agent, 'Legal');
  assert.equal(result.agentId, 'legal');
});

test('Jev cognitive layer evaluates and selects which profile to use for unmentioned tasks', async t => {
  const { swarm } = setupSwarmTest(t);

  // Technical task evaluated by Jev -> routes to Engineer
  const techAgent = await swarm.selectProfileWithJev('Fix the bug in the TypeScript build pipeline');
  assert.equal(techAgent, 'engineer');

  // Legal/contract task evaluated by Jev -> routes to Legal
  const legalAgent = await swarm.selectProfileWithJev('Audit contract clause for liability and regulatory compliance');
  assert.equal(legalAgent, 'legal');

  // Financial task evaluated by Jev -> routes to Finance
  const financeAgent = await swarm.selectProfileWithJev('Model the unit economics and profit margin under $10M revenue');
  assert.equal(financeAgent, 'finance');

  // Cross-functional orchestration task evaluated by Jev -> routes to Admin
  const adminAgent = await swarm.selectProfileWithJev('Coordinate team across multiple workstreams to launch a new product');
  assert.equal(adminAgent, 'admin');

  // Dispatch without @mention routes through Jev cognitive profile evaluation
  const dispatched = await swarm.dispatch('Audit contract for regulatory compliance');
  assert.equal(dispatched.agentId, 'legal');
  assert.equal(dispatched.agent, 'Legal');
});
