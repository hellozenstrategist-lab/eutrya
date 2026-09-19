import test from 'node:test';
import assert from 'node:assert/strict';
import { EventFeed } from '../src/event-feed.mjs';

test('event feed pages backward and forward without losing live events',()=>{
  const feed=new EventFeed({limit:100,pageSize:5});
  for(let i=1;i<=12;i++)feed.push(`event-${i}`);
  assert.equal(feed.live,true);
  assert.deepEqual(feed.snapshot().lines,['event-8','event-9','event-10','event-11','event-12']);

  feed.scrollUp();
  assert.equal(feed.live,false);
  assert.deepEqual(feed.snapshot().lines,['event-3','event-4','event-5','event-6','event-7']);

  feed.push('event-13');
  assert.equal(feed.live,false);
  assert.deepEqual(feed.snapshot().lines,['event-3','event-4','event-5','event-6','event-7']);

  feed.scrollDown();
  assert.equal(feed.live,false);
  assert.deepEqual(feed.snapshot().lines,['event-8','event-9','event-10','event-11','event-12']);

  feed.scrollDown();
  assert.equal(feed.live,true);
  assert.deepEqual(feed.snapshot().lines,['event-9','event-10','event-11','event-12','event-13']);
});

test('event feed top and bottom navigation are bounded',()=>{
  const feed=new EventFeed({limit:100,pageSize:5});
  for(let i=1;i<=9;i++)feed.push(`line-${i}`);
  feed.top();
  assert.equal(feed.live,false);
  assert.deepEqual(feed.snapshot().lines,['line-1','line-2','line-3','line-4','line-5']);
  feed.scrollUp();
  assert.deepEqual(feed.snapshot().lines,['line-1','line-2','line-3','line-4','line-5']);
  feed.bottom();
  assert.equal(feed.live,true);
  assert.deepEqual(feed.snapshot().lines,['line-5','line-6','line-7','line-8','line-9']);
});

test('event feed keeps a bounded scrollback and adjusts a browsed viewport when old lines expire',()=>{
  const feed=new EventFeed({limit:50,pageSize:5});
  for(let i=1;i<=50;i++)feed.push(`old-${i}`);
  feed.top();
  assert.deepEqual(feed.snapshot().lines,['old-1','old-2','old-3','old-4','old-5']);
  for(let i=1;i<=5;i++)feed.push(`new-${i}`);
  assert.deepEqual(feed.snapshot().lines,['old-6','old-7','old-8','old-9','old-10']);
  assert.equal(feed.total,50);
});

test('render labels live and scrollback state clearly',()=>{
  const feed=new EventFeed({limit:100,pageSize:5});
  feed.push('alpha\nbeta');
  assert.match(feed.render(),/LIVE/);
  feed.top();
  assert.match(feed.render(),/SCROLLBACK/);
  assert.match(feed.render(),/PageUp\/PageDown/);
});
