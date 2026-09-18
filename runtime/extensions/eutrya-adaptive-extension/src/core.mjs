import { createHash, randomUUID } from 'node:crypto';

export function assert(condition, message) { if (!condition) throw new Error(message); }
export function text(value, name, max = 8000) {
  assert(typeof value === 'string' && value.trim().length > 0 && value.length <= max, `${name} must contain 1..${max} characters`);
  return value.trim();
}
export function id(value, name = 'id') {
  assert(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/.test(value) && !['__proto__','constructor','prototype'].includes(value), `Invalid ${name}`);
  return value;
}
export function number(value, name, min, max) {
  assert(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max, `${name} must be a finite number in ${min}..${max}`);
  return value;
}
export function integer(value, name, min, max) { number(value,name,min,max); assert(Number.isInteger(value), `${name} must be an integer`); return value; }
export function plain(value, name = 'object') {
  assert(value !== null && typeof value === 'object' && !Array.isArray(value) && [Object.prototype,null].includes(Object.getPrototypeOf(value)), `Expected plain ${name}`);
  return value;
}
export const clone = value => structuredClone(value);
export function canonical(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') { assert(Number.isFinite(value),'Non-finite JSON number'); return JSON.stringify(value); }
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  plain(value);
  return '{' + Object.keys(value).sort().map(k => { assert(!['__proto__','constructor','prototype'].includes(k),'Unsafe object key'); return JSON.stringify(k)+':'+canonical(value[k]); }).join(',') + '}';
}
export const hash = value => createHash('sha256').update(canonical(value)).digest('hex');
export const uid = prefix => `${prefix}_${randomUUID()}`;
export const lexical = (a,b) => a < b ? -1 : a > b ? 1 : 0;
export const bounded = (x,min,max) => Math.max(min,Math.min(max,x));
export const round = x => Math.round(x * 1e9) / 1e9;
export function checkAbort(signal) { signal?.throwIfAborted(); }
export async function timed(fn, ms, signal) {
  checkAbort(signal);
  const controller = new AbortController();
  const combined = signal ? AbortSignal.any([signal,controller.signal]) : controller.signal;
  let timer;
  const timeout = new Promise((_,reject) => { timer = setTimeout(() => { const e = new Error(`Operation deadline exceeded (${ms} ms); no automatic retry`); e.name='TimeoutError'; controller.abort(e); reject(e); }, ms); });
  let rejectAbort;
  const aborted = new Promise((_,reject) => { rejectAbort = () => reject(combined.reason ?? new DOMException('Aborted','AbortError')); combined.addEventListener('abort',rejectAbort,{once:true}); });
  try { return await Promise.race([Promise.resolve().then(() => fn(combined)),timeout,aborted]); }
  finally { clearTimeout(timer); combined.removeEventListener('abort',rejectAbort); }
}
export function probability(answer) {
  assert(answer?.type === 'boolean','Expected Jev boolean answer');
  return number(answer.probability,'Jev probability',0,1);
}
export function choice(answer, options) {
  assert(answer?.type === 'choice' && options.includes(answer.choice),'Invalid Jev choice');
  plain(answer.probabilities);
  assert(Object.keys(answer.probabilities).length === options.length && options.every(k => Object.hasOwn(answer.probabilities,k)),'Incomplete Jev choice distribution');
  const sum = options.reduce((n,k) => n+number(answer.probabilities[k],`probability.${k}`,0,1),0);
  assert(Math.abs(sum-1) <= 0.015,'Jev probabilities must sum to one');
  const p = Object.fromEntries(options.map(k => [k,answer.probabilities[k]/sum]));
  assert(p[answer.choice]+1e-6 >= Math.max(...Object.values(p)),'Jev choice disagrees with distribution');
  return {choice:answer.choice,probabilities:p};
}
export function owner(scope, actor) {
  assert(actor?.kind === 'authenticated-user' && actor.id === scope.userId, 'Only the authenticated owning user can change preferences or admin rules');
}
export function audit(state,type,data={}) {
  state.audit.push({seq:state.nextAudit++,at:new Date().toISOString(),type,...clone(data)});
  state.audit=state.audit.slice(-256);
}
export function emit(fn,type,data={}) { try { fn?.({type,...clone(data)}); } catch {} }
