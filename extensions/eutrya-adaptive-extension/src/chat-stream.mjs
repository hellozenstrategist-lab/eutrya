import { assert, checkAbort, integer, text } from './core.mjs';

const BASES={openrouter:'https://openrouter.ai/api/v1',vercel:'https://ai-gateway.vercel.sh/v1',ollama:'http://127.0.0.1:11434/v1'};
/** Zero-dependency SSE text adapter. No SDK changes, tools, retries, or model defaults. */
export function createChatStreamer({provider,model,apiKey='',baseUrl=null,fetchImpl=fetch,extraBody={}}) {
  assert(['openrouter','vercel','ollama','compatible'].includes(provider),'Unsupported streaming provider');text(model,'text model',200);
  assert(!model.startsWith('typesafe-ai/'),'Jev is not a chat-completions model');
  if(['openrouter','vercel'].includes(provider)){text(apiKey,'provider key',2000);assert(!baseUrl||baseUrl===BASES[provider],'Named provider endpoint cannot be redirected');}
  const base=new URL((baseUrl&&baseUrl.length>0)?baseUrl:BASES[provider]);
  assert(!base.username&&!base.password&&!base.search&&!base.hash,'Invalid base URL');
  assert(base.protocol==='https:'||(base.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(base.hostname)),'HTTP is allowed only on loopback');
  const banned=['messages','stream','stream_options','model','tools','tool_choice','functions','function_call','max_tokens','max_completion_tokens'];
  assert(extraBody&&typeof extraBody==='object'&&!Array.isArray(extraBody)&&Object.keys(extraBody).every(x=>!banned.includes(x)),'extraBody cannot override execution or streaming contract');
  return async function stream({messages,maxOutputTokens,signal,onToken}) {
    integer(maxOutputTokens,'maxOutputTokens',32,4096);assert(typeof onToken==='function','onToken required');checkAbort(signal);
    const result=await fetchImpl(base.href.replace(/\/$/,'')+'/chat/completions',{
      method:'POST',redirect:'error',signal,headers:{'Content-Type':'application/json',Accept:'text/event-stream',...(apiKey?{Authorization:`Bearer ${apiKey}`}:{})},
      body:JSON.stringify({...extraBody,model,messages,max_tokens:maxOutputTokens,stream:true,stream_options:{include_usage:true}})
    });
    assert(result.ok,`Text provider HTTP ${result.status}; response body and credentials omitted`);
    assert(result.headers.get('content-type')?.includes('text/event-stream'),'Text provider did not return SSE');
    assert(result.body,'Missing stream body');
    const reader=result.body.getReader(),decoder=new TextDecoder();let buffer='',eventLines=[],output='',done=false,finished=false,totalBytes=0;let usage={},generationId=null;
    function event() {
      const data=eventLines.filter(x=>x==='data'||x.startsWith('data:')).map(x=>x==='data'?'':x.slice(5).replace(/^ /,'')).join('\n');eventLines=[];
      if(!data)return;
      if(data==='[DONE]'){done=true;return;}
      let obj;try{obj=JSON.parse(data);}catch{throw new Error('Malformed SSE JSON; no text was executed');}
      assert(!obj.error,'Text provider sent a streaming error');
      if(obj.id)generationId=obj.id;
      if(obj.usage){const u=obj.usage;usage={inputTokens:u.prompt_tokens,outputTokens:u.completion_tokens,...(typeof u.cost==='number'?{costUsd:u.cost}:{})};}
      for(const c of obj.choices??[]) {
        assert(c.index===undefined||c.index===0,'Multiple completion choices are not supported');
        assert(!c.error,'Completion stream failed');
        assert(!c.delta?.tool_calls?.length&&!c.delta?.function_call,'Native tool call rejected in tool-free lane');
        if(c.finish_reason!==null&&c.finish_reason!==undefined){assert(c.finish_reason==='stop','Text reply ended incompletely or requested a tool');finished=true;}
        const piece=c.delta?.content;
        if(piece!==null&&piece!==undefined){assert(typeof piece==='string','Non-text delta rejected');assert(!done,'Text after stream terminator');const safe=piece.replace(/[\x00-\x08\x0b-\x1f\x7f]/g,'');output+=safe;assert(output.length<=64000,'Stream output cap exceeded');checkAbort(signal);onToken(safe);}
        // Provider reasoning fields are intentionally not emitted or retained.
      }
    }
    function consume(final=false) {
      let newline;
      while((newline=buffer.indexOf('\n'))!==-1) {
        let line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);if(line.endsWith('\r'))line=line.slice(0,-1);
        if(line==='')event();else if(!line.startsWith(':'))eventLines.push(line);
      }
      if(final){if(buffer){eventLines.push(buffer.replace(/\r$/,''));buffer='';}if(eventLines.length)event();}
      assert(buffer.length<262144&&eventLines.join('\n').length<262144,'SSE event cap exceeded');
    }
    try {
      while(true){checkAbort(signal);const part=await reader.read();if(part.done)break;totalBytes+=part.value.byteLength;assert(totalBytes<2000000,'SSE byte cap exceeded');buffer+=decoder.decode(part.value,{stream:true});consume();if(done)break;}
      buffer+=decoder.decode();consume(true);assert(done&&finished&&output.trim(),'Stream ended without complete stop and DONE markers');
      return {text:output,usage,model,generationId};
    }finally{try{await reader.cancel();}catch{}reader.releaseLock();}
  };
}
