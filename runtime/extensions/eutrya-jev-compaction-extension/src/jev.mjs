import {assert} from './util.mjs';

/** Preferred Eutrya bridge: reuses its installed SDK, key, retry policy and budget. */
export function nativeJevAsker(runtime) {
  assert(typeof runtime?.call==='function'&&typeof runtime?.jev?.evaluate==='function','ADAPTER','Expected runtime.call and typed runtime.jev.evaluate');
  return {source:runtime.jev.source,async ask(state,questions,signal) {
    const answers=await runtime.call('jev.compaction',{state,questions},s=>runtime.jev.evaluate(state,questions,s),signal);
    return {answers};
  }};
}
/** Bridge to the already-installed adaptive pack or another metered typed evaluator. */
export function typedJevAsker(jev) {
  assert(typeof jev?.evaluate==='function','ADAPTER','Expected a typed evaluate({state,questions,signal}) adapter');
  return {source:jev.source,async ask(state,questions,signal) {
    const result=await jev.evaluate({state,questions,signal});
    assert(result&&typeof result.answers==='object','ANSWER','Typed evaluator did not return answers');return result;
  }};
}
