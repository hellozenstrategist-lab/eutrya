import { text } from './core.mjs';
/** Call only on the authenticated user's CLI/message stream; never tool output. */
export async function handleAdaptiveCommand(extension,principal,line) {
  text(line,'command',4096);
  if(line==='/adaptive status')return {handled:true,result:extension.status()};
  if(line==='/adaptive freeze'){extension.controls.freeze(principal,true);return {handled:true,result:'Learning frozen; saved preferences remain active.'};}
  if(line==='/adaptive thaw'){extension.controls.freeze(principal,false);return {handled:true,result:'Verified-outcome learning resumed.'};}
  if(line.startsWith('/feedback '))return {handled:true,result:extension.controls.correct(principal,{text:line.slice(10)})};
  if(line.startsWith('/adaptive forget ')){extension.controls.forget(principal,line.slice(17).trim());return {handled:true,result:'Correction removed.'};}
  if(line.startsWith('/adaptive config '))return {handled:true,result:extension.controls.configure(principal,JSON.parse(line.slice(17)))};
  return {handled:false};
}

/**
 * Recognizes a deliberately narrow set of stand-alone corrections without an extra LLM.
 * Other prose remains a normal task. Use /feedback for arbitrary persistent guidance.
 */
export function capturePlainCorrection(extension,principal,line) {
  if(typeof line!=='string'||line.length>200)return {handled:false};
  const normalized=line.trim().toLowerCase().replace(/[.!]+$/,'');
  const pattern=/^(?:please )?(?:be concise|keep it short|answer first|stop overthinking|stop overexplaining|more detail(?: please)?|go deeper|walk me through it|(?:this|that|your answer) (?:is|was) too (?:long|verbose|slow)|(?:this|it) is taking too long|lead with the answer)$/;
  if(!pattern.test(normalized))return {handled:false};
  return {handled:true,result:extension.controls.correct(principal,{text:line})};
}
