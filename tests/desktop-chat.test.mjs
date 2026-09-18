import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function loadModel() {
  const source = fs.readFileSync(new URL('../desktop/web/ui/model.js', import.meta.url), 'utf8');
  const sandbox = {
    window: {},
    location: { hash: '' },
    localStorage: { getItem: () => null, setItem: () => {} },
    console
  };
  vm.runInNewContext(source, sandbox, { filename: 'model.js' });
  return sandbox.window.EutryaStudio;
}

test('optimistic chat outbox clears when the same persisted message appears', () => {
  const M = loadModel();
  const now = Date.now();
  M.state.outbox = 'hello pls hunt bug';
  M.state.outboxAt = now;

  M.accept({
    readiness: { ready: true, mode: 'live' },
    swarm: {
      workspace: {
        messages: [{
          id: 'msg-1',
          from: 'user',
          to: 'admin',
          content: 'hello pls hunt bug',
          timestamp: new Date(now + 100).toISOString()
        }]
      }
    },
    config: {}
  });

  assert.equal(M.state.outbox, null);
  assert.equal(M.state.outboxAt, 0);
});

test('an older identical message does not suppress a newly sent duplicate', () => {
  const M = loadModel();
  const now = Date.now();
  M.state.outbox = 'same text';
  M.state.outboxAt = now;

  M.accept({
    readiness: { ready: true, mode: 'live' },
    swarm: {
      workspace: {
        messages: [{
          id: 'msg-old',
          from: 'user',
          to: 'admin',
          content: 'same text',
          timestamp: new Date(now - 60_000).toISOString()
        }]
      }
    },
    config: {}
  });

  assert.equal(M.state.outbox, 'same text');
  assert.equal(M.state.outboxAt, now);
});

test('different persisted text does not clear optimistic outbox', () => {
  const M = loadModel();
  const now = Date.now();
  M.state.outbox = 'new message';
  M.state.outboxAt = now;

  M.accept({
    readiness: { ready: true, mode: 'live' },
    swarm: {
      workspace: {
        messages: [{
          id: 'msg-other',
          from: 'user',
          to: 'admin',
          content: 'different message',
          timestamp: new Date(now + 100).toISOString()
        }]
      }
    },
    config: {}
  });

  assert.equal(M.state.outbox, 'new message');
});
