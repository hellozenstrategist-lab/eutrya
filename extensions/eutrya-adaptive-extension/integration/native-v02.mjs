import { createChatStreamer } from '../src/chat-stream.mjs';
import { assert } from '../src/core.mjs';

/**
 * Inspected against Eutrya Native 0.2.0. The user's later swarm stays behind host callbacks.
 * No SDK imports, config overwrites, provider substitutions, or monkeypatches.
 */
export function createNativeAdapters(runtime,{streamText=null,extraTextBody={}}={}) {
  assert(typeof runtime?.call==='function' && typeof runtime?.jev?.evaluate==='function','Expected Eutrya runtime.call and typed jev.evaluate(state, questions, signal)');
  const config=runtime.config;
  const provider=config.mainProvider??'vercel';
  if(!streamText) {
    const keys={openrouter:'OPENROUTER_API_KEY',vercel:'AI_GATEWAY_API_KEY',compatible:'EUTRYA_COMPATIBLE_API_KEY',ollama:''};
    const env=runtime.cortex?.env??process.env,keyEnv=config.mainKeyEnv||keys[provider];
    streamText=createChatStreamer({provider,model:config.mainModel,apiKey:runtime.cortex?.overrideKey??(keyEnv?env[keyEnv]:'')??'',baseUrl:config.mainBaseUrl||null,fetchImpl:runtime.cortex?.fetch??fetch,extraBody:extraTextBody});
  }
  return {
    jev:{source:runtime.jev.source,model:config.jevModel,async evaluate({state,questions,signal}) {
      let metadata;
      const answers=await runtime.call('jev.adaptive',{state,questions},async s=>{const result=await runtime.jev.evaluate(state,questions,s);metadata=result;return result;},signal);
      return {answers,usage:metadata?.usage??{},model:metadata?.model??config.jevModel};
    }},
    async streamText({messages,maxOutputTokens,signal,onToken}) {
      let metadata;
      const result=await runtime.call('cortex.fast',{messages,maxOutputTokens},async s=>{
        metadata=await streamText({messages,maxOutputTokens,signal:s,onToken});
        return {data:{text:metadata.text},usage:metadata.usage??{},model:metadata.model??config.mainModel,generationId:metadata.generationId??null};
      },signal);
      return {text:result.text,usage:metadata?.usage??{},model:metadata?.model??config.mainModel};
    }
  };
}

/** Keep all native eligibility/permission/completion gates. Only rerank eligible rows. */
export function createNativeSelector(extension,baseSelect,contextForDecision) {
  assert(typeof baseSelect==='function' && typeof contextForDecision==='function','Provide the existing selector and trusted context function');
  return function select(...args) {
    const base=baseSelect(...args),keys=contextForDecision(...args);
    return extension.decisions.chooseNative(base,keys);
  };
}

/** Forward saved preferences into the full-work prompt without replacing its existing context. */
export function adaptiveContext(extension,existingContext='') {
  const p=extension.status().learning.preferences;
  return {existingContext,adaptivePreferences:{verbosity:p.verbosity,answerFirst:p.answerFirst,correctionNotes:p.notes},authority:'Preferences only: no additional permissions and no changes to task evidence.'};
}
