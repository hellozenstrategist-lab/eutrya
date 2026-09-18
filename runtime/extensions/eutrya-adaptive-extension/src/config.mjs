import { assert, clone, id, integer, number, plain } from './core.mjs';
export const DEFAULT_CONFIG = Object.freeze({
  fast: {enabled:true, routeThreshold:0.8, permissionThreshold:0.9, maxOutputTokens:384, maxContextChars:6000, routeTimeoutMs:10000, textTimeoutMs:45000, targetFirstTokenMs:5000},
  stability: {hysteresis:0.025, maxLearnedBias:0.06, minSamples:4, prior:3, enabled:true},
  activation: {threshold:0.8, maxConcurrent:4, maxDepth:2, maxChildren:3, maxRootActivations:16, timeoutMs:120000},
  learning: {enabled:true, maxRecords:512},
  limits: {maxProviderCalls:500, maxPromptChars:24000},
  agents: {},
  templates: {}
});
export function validateConfig(input = {}) {
  plain(input,'config');
  const out=clone(DEFAULT_CONFIG);
  for (const [key,value] of Object.entries(input)) {
    assert(Object.hasOwn(out,key),`Unknown config section ${key}`); plain(value,key);
    if (['agents','templates'].includes(key)) out[key]=clone(value);
    else for (const [k,v] of Object.entries(value)) { assert(Object.hasOwn(out[key],k),`Unknown config ${key}.${k}`); out[key][k]=v; }
  }
  for (const [k,v] of Object.entries(out.fast)) {
    if(k==='enabled') assert(typeof v==='boolean','fast.enabled must be boolean');
    else if(k.endsWith('Threshold')) number(v,k,0.5,1);
    else integer(v,k,k==='maxOutputTokens'?32:100,k==='maxOutputTokens'?4096:120000);
  }
  for (const [k,v] of Object.entries(out.stability)) {
    if(k==='enabled') assert(typeof v==='boolean','stability.enabled must be boolean');
    else if(k==='minSamples') integer(v,k,2,100);
    else if(k==='prior') number(v,k,1,100);
    else number(v,k,0,0.15);
  }
  number(out.activation.threshold,'activation.threshold',0.5,1);
  integer(out.activation.maxConcurrent,'maxConcurrent',1,32);
  integer(out.activation.maxDepth,'maxDepth',0,4);
  integer(out.activation.maxChildren,'maxChildren',0,16);
  integer(out.activation.maxRootActivations,'maxRootActivations',1,128);
  integer(out.activation.timeoutMs,'activation timeout',100,900000);
  assert(typeof out.learning.enabled==='boolean','learning.enabled must be boolean');
  integer(out.learning.maxRecords,'maxRecords',32,4096);
  integer(out.limits.maxProviderCalls,'maxProviderCalls',1,100000);
  integer(out.limits.maxPromptChars,'maxPromptChars',1000,100000);
  for (const section of ['agents','templates']) {
    assert(Object.keys(out[section]).length<=64,`Too many ${section}`);
    for (const [name,profile] of Object.entries(out[section])) {
      id(name,`${section} id`); plain(profile,'activation profile');
      const permitted=section==='agents'?['enabled','role','manualOnly','allowedEvents','canDelegate','allowedTemplates']:['enabled','role','canDelegate','allowedTemplates'];
      assert(Object.keys(profile).every(k=>permitted.includes(k)),`Unknown ${section} profile field`);
      assert(typeof profile.enabled==='boolean',`${name}.enabled is required`);
      assert(typeof profile.role==='string' && profile.role.length<=500,`${name}.role is required and bounded`);
      assert(typeof profile.canDelegate==='boolean',`${name}.canDelegate is required`);
      assert(Array.isArray(profile.allowedTemplates) && profile.allowedTemplates.length<=32,`${name}.allowedTemplates is required`);
      profile.allowedTemplates.forEach(x=>id(x,'template id'));
      if(section==='agents') {
        assert(typeof profile.manualOnly==='boolean',`${name}.manualOnly is required`);
        assert(Array.isArray(profile.allowedEvents) && profile.allowedEvents.length<=32,`${name}.allowedEvents is required`);
        profile.allowedEvents.forEach(x=>id(x,'event'));
      }
    }
  }
  for (const section of ['agents','templates']) for(const profile of Object.values(out[section])) for(const key of profile.allowedTemplates) assert(Object.hasOwn(out.templates,key),`Unknown delegation template ${key}`);
  return out;
}
export function mergeConfig(current,patch) {
  plain(patch,'config patch'); const next=clone(current);
  for(const [k,v] of Object.entries(patch)) {
    assert(Object.hasOwn(next,k),`Unknown config section ${k}`); plain(v);
    next[k]=['agents','templates'].includes(k)?clone(v):{...next[k],...v};
  }
  return validateConfig(next);
}
