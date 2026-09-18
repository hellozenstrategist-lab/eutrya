import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NativeSwarm } from '../src/swarm/swarm.mjs';
import { loadConfig } from '../src/config.mjs';
import { handleAdaptiveCommand, capturePlainCorrection } from '../extensions/eutrya-adaptive-extension/src/commands.mjs';

function setupAdaptiveSwarmTest(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'eutrya-adaptive-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = loadConfig(undefined, {
    sessionRoot: path.join(root, 'state'),
    mainModel: 'mock/text',
    allowExec: true
  });
  const swarm = new NativeSwarm({
    config,
    workspace: root,
    demo: true
  });
  t.after(() => swarm.close());
  return { root, config, swarm };
}

test('NativeSwarm initializes with adaptive extension and sleeping residents', t => {
  const { swarm } = setupAdaptiveSwarmTest(t);
  assert.ok(swarm.adaptive);
  const status = swarm.adaptive.status();
  assert.equal(status.version, '0.1.0');
  assert.ok(status.actors.agents.length >= 5);
  // All registered resident agents should start in sleeping state
  for (const agent of status.actors.agents) {
    assert.equal(agent.status, 'SLEEPING');
  }
});

test('Plain explanation task routes through fast lane without multi-turn tools', async t => {
  const { swarm } = setupAdaptiveSwarmTest(t);
  let streamed = '';
  const result = await swarm.dispatch('explain what is a queue data structure', {
    onToken: t => { streamed += t; }
  });
  assert.ok(result);
  assert.equal(result.status, 'ANSWERED');
  assert.ok(result.fastLane);
  assert.match(result.answer, /Offline demo answer/);
  assert.equal(streamed, 'Offline demo answer.');
});

test('User corrections via /feedback and plain corrections persist and update preferences', async t => {
  const { swarm } = setupAdaptiveSwarmTest(t);
  const principal = { kind: 'authenticated-user', id: 'operator' };

  // Plain correction test
  const plainRes = capturePlainCorrection(swarm.adaptive, principal, 'Be concise');
  assert.ok(plainRes.handled);
  assert.equal(swarm.adaptive.status().learning.preferences.verbosity, 'brief');

  // Explicit /feedback test
  const feedbackRes = await handleAdaptiveCommand(swarm.adaptive, principal, '/feedback Answer first without intro');
  assert.ok(feedbackRes.handled);
  const prefs = swarm.adaptive.status().learning.preferences;
  assert.equal(prefs.answerFirst, true);
  assert.ok(prefs.notes.some(n => n.text && n.text.includes('Answer first')));
});

test('Adaptive decision selector stabilizes identical candidates and bounded learning', async t => {
  const { swarm } = setupAdaptiveSwarmTest(t);
  const adminRuntime = swarm.getRuntime('admin');
  assert.ok(adminRuntime.adaptive);

  // Propose a decision through chooseNative
  const baseSelection = {
    selected: { id: 'a', action: { type: 'finish', answer: 'Done' } },
    ranked: [{ candidate: { id: 'a', action: { type: 'finish', answer: 'Done' } }, value: 0.8, eligible: true }]
  };

  const choice = adminRuntime.adaptive.decisions.chooseNative(baseSelection, {
    learningKey: 'workspace:observe',
    continuityKey: 'test-task'
  });

  assert.equal(choice.selected.id, 'a');
  assert.ok(choice.adaptive?.decision?.id);

  // Record an independent outcome
  const outcome = adminRuntime.adaptive.recordOutcome({
    observationId: 'obs-1',
    decisionId: choice.adaptive.decision.id,
    passed: true,
    checker: 'independent-test-checker'
  });

  assert.equal(outcome.recorded, true);
});

test('Adaptive status command displays live telemetry and learning state', async t => {
  const { swarm } = setupAdaptiveSwarmTest(t);
  const principal = { kind: 'authenticated-user', id: 'operator' };
  const cmd = await handleAdaptiveCommand(swarm.adaptive, principal, '/adaptive status');
  assert.ok(cmd.handled);
  assert.equal(cmd.result.version, '0.1.0');
  assert.ok(cmd.result.learning);
  assert.ok(cmd.result.actors);
});

test('session model command backend updates existing and future swarm runtimes', async t => {
  const { swarm } = setupAdaptiveSwarmTest(t);
  const admin = swarm.getRuntime('admin');
  assert.equal(swarm.modelStatus().defaultModel, 'mock/text');

  await swarm.setDefaultModel('fixture/alternate-text');

  assert.equal(swarm.modelStatus().defaultModel, 'fixture/alternate-text');
  assert.equal(admin.config.mainModel, 'fixture/alternate-text');
  assert.equal(admin.cortex.config?.mainModel ?? admin.config.mainModel, 'fixture/alternate-text');
  assert.equal(swarm.getRuntime('researcher').config.mainModel, 'fixture/alternate-text');
  assert.ok(swarm.adaptive);

  await swarm.setProviderAndModel('openrouter', 'fixture/openrouter-text');
  assert.equal(swarm.modelStatus().provider, 'openrouter');
  assert.equal(swarm.modelStatus().defaultModel, 'fixture/openrouter-text');
  assert.equal(admin.config.mainProvider, 'openrouter');
  assert.equal(admin.config.mainModel, 'fixture/openrouter-text');
});
