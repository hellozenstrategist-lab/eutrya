import { createHash } from 'node:crypto';

export class CompactionError extends Error {
  constructor(code, message, options) { super(message, options); this.name='CompactionError'; this.code=code; }
}
export function assert(value, code, message) { if (!value) throw new CompactionError(code,message); }
export function canonical(value) {
  const seen=new Set();
  function walk(v) {
    if(v===null || typeof v==='string' || typeof v==='boolean') return v;
    if(typeof v==='number' && Number.isFinite(v)) return v;
    assert(v && typeof v==='object','INVALID_JSON','Expected finite, acyclic JSON data');
    assert(!seen.has(v),'INVALID_JSON','Circular JSON is not supported');
    assert(Array.isArray(v) || Object.getPrototypeOf(v)===Object.prototype || Object.getPrototypeOf(v)===null,'INVALID_JSON','Expected plain JSON objects');
    seen.add(v);
    let out;
    if(Array.isArray(v)) out=v.map(walk);
    else { out=Object.create(null); for(const k of Object.keys(v).sort()) out[k]=walk(v[k]); }
    seen.delete(v);return out;
  }
  return JSON.stringify(walk(value));
}
export const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
export const clone=value=>JSON.parse(canonical(value));
export function aborted(signal) { if(signal?.aborted) throw signal.reason ?? new DOMException('Aborted','AbortError'); }
export async function timed(fn, ms, parent) {
  aborted(parent);
  const controller=new AbortController();
  let timer, abortListener;
  const failed=new Promise((_,reject)=>{
    abortListener=()=>{const err=parent.reason??new DOMException('Aborted','AbortError');controller.abort(err);reject(err);};
    parent?.addEventListener('abort',abortListener,{once:true});
    timer=setTimeout(()=>{const err=new CompactionError('TIMEOUT','Jev compaction deadline exceeded; original context retained');controller.abort(err);reject(err);},ms);
  });
  try { return await Promise.race([Promise.resolve().then(()=>fn(controller.signal)),failed]); }
  finally {clearTimeout(timer);parent?.removeEventListener('abort',abortListener);if(!controller.signal.aborted)controller.abort();}
}
export function scopeKey(scope) {
  assert(scope && typeof scope==='object','SCOPE','A trusted host scope is required');
  for(const key of ['profileId','userId','sessionId','agentId']) {
    assert(typeof scope[key]==='string' && scope[key].length>0 && scope[key].length<=500,'SCOPE',`Missing or invalid scope.${key}`);
  }
  return hash(scope);
}
