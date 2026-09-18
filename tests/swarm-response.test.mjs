import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchFlags, finalRunResponse, isGenericCompletionText } from '../src/swarm/swarm.mjs';

test('generic completion labels are not substantive chat answers', () => {
  for (const text of ['Completed','complete','Done','finished','Successful.']) {
    assert.equal(isGenericCompletionText(text), true, text);
  }
  assert.equal(isGenericCompletionText('Completed scope review; two blockers remain.'), false);
});

test('bug bounty and hunt prompts bypass the tool-free fast lane', () => {
  for (const text of [
    'start hunting now',
    'hunt the Obyte Immunefi program',
    'begin bug bounty research',
    'check this Bugcrowd scope',
    'pentest the authorized target'
  ]) {
    const flags=dispatchFlags(text);
    assert.equal(flags.highStakes, true, text);
  }
  assert.equal(dispatchFlags('start hunting now').requiresTools, true);
});

test('runtime response prefers substantive answer and summary', () => {
  assert.equal(finalRunResponse({status:'ANSWERED',answer:'Found two scoped leads.',summary:'x'}),'Found two scoped leads.');
  assert.equal(finalRunResponse({status:'ANSWERED',answer:'Completed',summary:'Scope mapped; hunt board created.'}),'Scope mapped; hunt board created.');
});

test('runtime response surfaces pause and input reasons instead of saying Completed', () => {
  assert.equal(
    finalRunResponse({status:'PAUSED',answer:null,summary:'Completed',reason:'Reached burst limit'}),
    'PAUSED: Reached burst limit'
  );
  assert.equal(
    finalRunResponse({status:'NEEDS_INPUT',answer:null,summary:'',reason:'Please provide the target account.'}),
    'Please provide the target account.'
  );
});

test('hunt routing without narrative gets a useful hunt-specific fallback', () => {
  const text=finalRunResponse({
    status:'ANSWERED',
    answer:'Completed',
    summary:'Done',
    observations:[{action:{type:'hunt_route'},result:{}}]
  });
  assert.match(text,/Hunt routing ran/);
  assert.match(text,/Open Hunts/);
  assert.notEqual(text,'Completed');
});
