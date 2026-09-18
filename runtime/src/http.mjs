import { insist } from './util.mjs';
export function safeServiceUrl(value,{local=false}={}) {
  const url=new URL(value);
  insist(!url.username&&!url.password&&!url.hash&&!url.search,'Service URL must not contain credentials, a query, or a fragment');
  const loopback=['localhost','127.0.0.1','[::1]'].includes(url.hostname);
  insist(url.protocol==='https:'||(local&&loopback&&url.protocol==='http:'),'Use HTTPS, or explicit localhost HTTP for a local service');
  return url.toString().replace(/\/$/,'');
}
export async function boundedText(response,maxBytes=1000000) {
  insist(Number(response.headers?.get?.('content-length')||0)<=maxBytes,'Response exceeds size limit');
  if(!response.body?.getReader){const t=await response.text();insist(Buffer.byteLength(t)<=maxBytes,'Response exceeds size limit');return t;}
  const reader=response.body.getReader();const chunks=[];let size=0;
  try {while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;insist(size<=maxBytes,'Response exceeds size limit');chunks.push(value);}}
  catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
  return Buffer.concat(chunks).toString('utf8');
}
export async function jsonRequest(url,{fetchImpl=fetch,signal,timeoutMs=45000,maxBytes=1000000,...init}={}) {
  const deadline=AbortSignal.timeout(timeoutMs);
  const response=await fetchImpl(url,{...init,redirect:'error',signal:signal?AbortSignal.any([signal,deadline]):deadline});
  if(!response.ok){const e=new Error(`Service returned HTTP ${response.status}`);e.statusCode=response.status;e.retryAfter=response.headers?.get?.('retry-after');await response.body?.cancel?.().catch(()=>{});throw e;}
  const text=await boundedText(response,maxBytes);return text?JSON.parse(text):{};
}
export function chunks(text,limit=3500){
  const chars=Array.from(String(text));const result=[];
  for(let i=0;i<chars.length;i+=limit)result.push(chars.slice(i,i+limit).join(''));
  return result.length?result:['(empty response)'];
}
export function sleep(ms,signal){
  if(signal?.aborted)return Promise.reject(new DOMException('Aborted','AbortError'));
  return new Promise((resolve,reject)=>{const abort=()=>{clearTimeout(t);reject(new DOMException('Aborted','AbortError'));};const t=setTimeout(()=>{signal?.removeEventListener('abort',abort);resolve();},ms);signal?.addEventListener('abort',abort,{once:true});});
}
