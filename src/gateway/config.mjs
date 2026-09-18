import path from 'node:path';
import { readJson } from '../local-state.mjs';
import { insist, integer } from '../util.mjs';
export const PLATFORMS=['telegram','discord','slack','matrix','signal','whatsapp','webhook'];
export function gatewayDefaults(dataRoot){return {version:1,workspaceRoot:path.join(dataRoot,'gateway-workspaces'),stateRoot:path.join(dataRoot,'gateway'),
  maxConcurrent:2,maxRoutes:32,maxQueue:100,maxProviderCallsPerDay:1000,requestsPerMinute:12,
  allowExec:false,platforms:Object.fromEntries(PLATFORMS.map(p=>[p,{enabled:false,allowedUsers:[],allowedChats:[],requireMention:true}]))};}
export function validateGateway(c){
  insist(c.version===1,'Unsupported gateway config version');
  insist(path.isAbsolute(c.workspaceRoot)&&path.isAbsolute(c.stateRoot),'Gateway roots must be absolute');
  for(const [k,lo,hi] of [['maxConcurrent',1,8],['maxRoutes',1,200],['maxQueue',1,1000],['maxProviderCallsPerDay',1,100000],['requestsPerMinute',1,120]])integer(c[k],k,lo,hi);
  insist(typeof c.allowExec==='boolean','allowExec must be a boolean');
  for(const [name,p]of Object.entries(c.platforms)){
    insist(PLATFORMS.includes(name),'Unsupported native messaging adapter: '+name);
    insist(typeof p.enabled==='boolean'&&typeof p.requireMention==='boolean','Platform flags must be booleans');
    for(const k of ['allowedUsers','allowedChats'])insist(Array.isArray(p[k])&&p[k].every(x=>typeof x==='string'&&x.length>0&&x.length<=256&&x!=='*'),'Use explicit string IDs, never a wildcard');
    if(p.enabled)insist(p.allowedUsers.length>0,`${name}: allowedUsers must not be empty`);
  }
  return c;
}
export function loadGateway(file,dataRoot){const base=gatewayDefaults(dataRoot),raw=readJson(file,{});const merged={...base,...raw,platforms:{...base.platforms,...raw.platforms}};return validateGateway(merged);}
