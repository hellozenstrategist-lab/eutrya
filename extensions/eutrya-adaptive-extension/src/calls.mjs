import { assert, audit, checkAbort, emit, timed, uid } from './core.mjs';

export class ProviderCalls {
  constructor({store,jev,onEvent,allowMocks=false}) {
    assert(jev && typeof jev.evaluate==='function','A Jev evaluator adapter is required');
    assert(jev.source==='jev'||(allowMocks&&jev.source==='mock'),'Live mode requires Jev; mock mode must be explicitly enabled');
    assert(typeof jev.model==='string'&&jev.model.length>0,'Evaluator identity is required');
    this.store=store;this.jev=jev;this.onEvent=onEvent;
  }
  async run(kind,input,fn,timeout,signal) {
    checkAbort(signal);const key=uid('call');const started=performance.now();
    this.store.update(s=>{
      assert(JSON.stringify(input).length<=s.config.limits.maxPromptChars,'Adaptive provider input is too large');
      assert(s.meter.calls<s.config.limits.maxProviderCalls,'Adaptive provider-attempt cap reached');
      s.meter.calls++;s.meter[kind.startsWith('jev.')?'jevCalls':'textCalls']++;s.meter.unpricedCalls++;
      audit(s,'provider.started',{key,kind,source:kind.startsWith('jev.')?this.jev.source:'host-text'});
    });
    emit(this.onEvent,'adaptive.provider.start',{key,kind});
    try {
      const result=await timed(fn,timeout,signal);checkAbort(signal);
      const u=result?.usage??{};
      this.store.update(s=>{
        for(const k of ['inputTokens','outputTokens'])if(typeof u[k]==='number'&&Number.isFinite(u[k])&&u[k]>=0)s.meter[k]+=u[k];
        if(typeof u.costUsd==='number'&&Number.isFinite(u.costUsd)&&u.costUsd>=0){s.meter.knownCostUsd+=u.costUsd;s.meter.unpricedCalls--;}
        audit(s,'provider.completed',{key,kind,elapsedMs:Math.round(performance.now()-started)});
      });
      emit(this.onEvent,'adaptive.provider.end',{key,kind,elapsedMs:Math.round(performance.now()-started)});return result;
    } catch(e) {
      this.store.update(s=>audit(s,'provider.failed',{key,kind,errorType:e.name??'Error'}));
      emit(this.onEvent,'adaptive.provider.error',{key,kind,errorType:e.name??'Error'});throw e;
    }
  }
  async evaluate(kind,state,questions,signal,timeout=this.store.read().config.fast.routeTimeoutMs) {
    const result=await this.run(`jev.${kind}`,{state,questions},s=>this.jev.evaluate({state,questions,signal:s}),timeout,signal);
    assert(result?.answers && typeof result.answers==='object','Evaluator adapter must return {answers, usage?}; no fallback was used');
    return result.answers;
  }
}
