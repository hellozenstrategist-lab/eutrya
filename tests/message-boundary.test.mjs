import test from 'node:test';
import assert from 'node:assert/strict';
import { SharedWorkspace } from '../src/swarm/workspace.mjs';

test('agent-to-user generic completion labels are never persisted as chat answers', () => {
  const ws=new SharedWorkspace();
  for(const value of ['Completed','Done','Finished.','Successful']) {
    const msg=ws.postMessage({from:'admin',to:'user',content:value});
    assert.notEqual(msg.content,value);
    assert.match(msg.content,/without a substantive response/i);
  }
});

test('substantive agent messages and user messages are preserved', () => {
  const ws=new SharedWorkspace();
  const good=ws.postMessage({from:'admin',to:'user',content:'Completed scope mapping; three cards are ready.'});
  assert.equal(good.content,'Completed scope mapping; three cards are ready.');

  const user=ws.postMessage({from:'user',to:'admin',content:'Completed'});
  assert.equal(user.content,'Completed');
});
