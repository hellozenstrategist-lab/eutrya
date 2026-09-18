import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createChatStreamer } from '../src/chat-stream.mjs';
const encoder=new TextEncoder();
const data=obj=>'data: '+JSON.stringify(obj)+'\n\n';
const content=t=>({id:'test-generation',choices:[{index:0,delta:{content:t},finish_reason:null}]});
const stop=()=>({choices:[{index:0,delta:{},finish_reason:'stop'}]});
const payload=()=>': heartbeat\n\n'+data(content('Hello '))+data(content('世界'))+data(stop())+data({choices:[],usage:{prompt_tokens:10,completion_tokens:2,cost:0.0001}})+'data: [DONE]\n\n';
function fetcher(raw,{status=200,type='text/event-stream',size=3}={}) {
  const bytes=encoder.encode(raw);return async()=>new Response(new ReadableStream({start(c){for(let i=0;i<bytes.length;i+=size)c.enqueue(bytes.slice(i,i+size));c.close();}}),{status,headers:{'content-type':type}});
}
async function run(raw,options={}) {
  const streamer=createChatStreamer({provider:'openrouter',model:'provider/model',apiKey:'fixture-key',fetchImpl:fetcher(raw),...options});let out='';const result=await streamer({messages:[{role:'user',content:'hello'}],maxOutputTokens:64,onToken:t=>out+=t});return {out,result};
}
test('SSE handles byte-split Unicode, comments, usage and DONE',async()=>{const {out,result}=await run(payload());assert.equal(out,'Hello 世界');assert.equal(result.text,out);assert.equal(result.usage.costUsd,0.0001);});
test('SSE supports CRLF delimiters',async()=>{assert.equal((await run(payload().replaceAll('\n','\r\n'))).out,'Hello 世界');});
test('SSE malformed JSON fails explicitly',async()=>{await assert.rejects(()=>run('data: NOT-JSON\n\n'),/Malformed/);});
test('SSE ignores reasoning text rather than emitting it',async()=>{const raw=data({choices:[{index:0,delta:{reasoning:'private'},finish_reason:null}]})+payload();assert.equal((await run(raw)).out,'Hello 世界');});
test('SSE native tool call is rejected without dispatch',async()=>{await assert.rejects(()=>run(data({choices:[{delta:{tool_calls:[{function:{name:'run'}}]}}]})+payload()),/Native tool call/);});
test('SSE missing DONE is incomplete even after a stop marker',async()=>{await assert.rejects(()=>run(data(content('Partial'))+data(stop())),/without complete/);});
test('SSE DONE without finish reason is incomplete',async()=>{await assert.rejects(()=>run(data(content('Partial'))+'data: [DONE]\n\n'),/without complete/);});
test('SSE length finish reason fails instead of pretending complete',async()=>{await assert.rejects(()=>run(data(content('Partial'))+data({choices:[{delta:{},finish_reason:'length'}]})+'data: [DONE]\n\n'),/incompletely/);});
test('SSE error frame is not an answer',async()=>{await assert.rejects(()=>run(data({error:{message:'fixture error'}})),/streaming error/);});
test('provider request cannot override tool-free contract',()=>{assert.throws(()=>createChatStreamer({provider:'openrouter',model:'p/m',apiKey:'key',extraBody:{tools:[{}]}}),/override/);});
test('provider endpoint restrictions prevent accidental credential forwarding',()=>{assert.throws(()=>createChatStreamer({provider:'vercel',model:'p/m',apiKey:'key',baseUrl:'https://other.invalid/v1'}),/redirected/);assert.throws(()=>createChatStreamer({provider:'compatible',model:'p/m',baseUrl:'http://not-loopback.invalid/v1'}),/loopback/);});
test('Jev cannot be sent to chat-completions endpoint',()=>{assert.throws(()=>createChatStreamer({provider:'vercel',model:'typesafe-ai/jev',apiKey:'key'}),/not a chat/);});
test('HTTP error does not print remote body or API key',async()=>{const fake=fetcher('secret-key',{status:401,type:'text/plain'});await assert.rejects(()=>run('',{fetchImpl:fake}),e=>e.message.includes('401')&&!e.message.includes('secret-key'));});
test('real loopback HTTP transport streams using original provider fields',async t=>{
  let received;const server=createServer(async(req,res)=>{let body='';for await(const x of req)body+=x;received={url:req.url,body:JSON.parse(body)};res.writeHead(200,{'content-type':'text/event-stream'});res.end(payload());});server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>new Promise(resolve=>server.close(resolve)));
  const stream=createChatStreamer({provider:'compatible',baseUrl:`http://127.0.0.1:${server.address().port}/v1`,model:'fixture-model'});let out='';await stream({messages:[{role:'user',content:'hello'}],maxOutputTokens:64,onToken:t=>out+=t});assert.equal(out,'Hello 世界');assert.equal(received.url,'/v1/chat/completions');assert.equal(received.body.stream,true);assert.equal(received.body.tools,undefined);assert.equal(received.body.max_tokens,64);
});

test('stream strips terminal control bytes before forwarding text',async()=>{
  const raw=data(content('Hello\u001b[31m\u0007'))+data(stop())+'data: [DONE]\n\n';const {out}=await run(raw);assert.equal(out,'Hello[31m');assert.equal(out.includes('\u001b'),false);
});
