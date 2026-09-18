import fs from 'node:fs';
import path from 'node:path';
import { insist, clip } from './util.mjs';


const PRIVATE_PARTS=new Set(['.git','.ssh','.aws','.azure','.config','.local','.eutrya','node_modules','.venv','venv']);
function safeResearchPath(root,relativePath){
  insist(typeof relativePath==='string'&&relativePath.length>0&&!relativePath.includes('\0')&&!path.isAbsolute(relativePath),'Use a relative workspace path');
  const parts=relativePath.split(/[\\/]/);insist(!parts.some(p=>p==='..'||PRIVATE_PARTS.has(p)||p.startsWith('.env')),'Outside-workspace, private, or excluded path');
  const full=path.resolve(root,relativePath);insist(full===root||full.startsWith(root+path.sep),'Path escapes workspace');
  let current=root;for(const part of parts.filter(x=>x&&x!=='.')){current=path.join(current,part);insist(fs.existsSync(current),'Path does not exist');insist(!fs.lstatSync(current).isSymbolicLink(),'Symlinks are not allowed');}
  return full;
}

const CODE_EXTENSIONS=new Set(['.sol','.vy','.move','.rs','.ts','.tsx','.js','.jsx']);
const SKIP_DIRS=new Set(['.git','node_modules','dist','build','out','coverage','.cache','.next','target','artifacts','cache']);
const CONTROL_CALLS=new Set(['if','for','while','switch','require','assert','revert','return','emit','new','delete','unchecked','assembly','keccak256','abi','super','this']);

function lineAt(text,index){return text.slice(0,index).split('\n').length;}
function relative(root,file){return path.relative(root,file).split(path.sep).join('/');}
function readCode(file){
  const st=fs.statSync(file);insist(st.isFile(),'Not a regular code file');insist(st.size<=2_000_000,'Code file exceeds 2 MiB');
  const data=fs.readFileSync(file);insist(!data.includes(0),'Binary code files are not supported');return data.toString('utf8');
}
function walk(root,start,maxFiles=500){
  const queue=[start],files=[];
  while(queue.length&&files.length<maxFiles){
    const cur=queue.shift();const st=fs.lstatSync(cur);if(st.isSymbolicLink())continue;
    if(st.isDirectory()){
      for(const d of fs.readdirSync(cur,{withFileTypes:true}).slice(0,1200)){
        if(d.isSymbolicLink()||SKIP_DIRS.has(d.name))continue;queue.push(path.join(cur,d.name));
      }
    }else if(st.isFile()&&st.size<=2_000_000&&CODE_EXTENSIONS.has(path.extname(cur).toLowerCase()))files.push(cur);
  }
  return files;
}
function balancedBlock(text,open){
  let depth=0,quote=null,escape=false,lineComment=false,blockComment=false;
  for(let i=open;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(lineComment){if(c==='\n')lineComment=false;continue;}
    if(blockComment){if(c==='*'&&n==='/'){blockComment=false;i++;}continue;}
    if(quote){if(escape){escape=false;continue;}if(c==='\\'){escape=true;continue;}if(c===quote)quote=null;continue;}
    if(c==='/'&&n==='/'){lineComment=true;i++;continue;}if(c==='/'&&n==='*'){blockComment=true;i++;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}if(c==='{')depth++;else if(c==='}'){depth--;if(depth===0)return i;}
  }
  return -1;
}
function solidityFunctions(text){
  const out=[];
  const re=/\b(function\s+([A-Za-z_$][\w$]*)|constructor|receive|fallback|modifier\s+([A-Za-z_$][\w$]*))\s*(\([^;{}]*\))?\s*([^;{}]*)([;{])/g;
  let m;
  while((m=re.exec(text))){
    const raw=m[1],name=m[2]??m[3]??raw;const declarationStart=m.index;const open=m[6]==='{'?re.lastIndex-1:-1;const end=open>=0?balancedBlock(text,open):-1;
    const declaration=text.slice(declarationStart,open>=0?open+1:re.lastIndex).replace(/\s+/g,' ').trim();
    const tail=(m[5]??'').replace(/\s+/g,' ').trim();
    const visibility=['external','public','internal','private'].find(v=>new RegExp(`\\b${v}\\b`).test(tail))??'unspecified';
    const mutability=['view','pure','payable'].find(v=>new RegExp(`\\b${v}\\b`).test(tail))??'nonpayable';
    const modifierTokens=tail.split(/\s+/).map(x=>x.replace(/\(.*/,'')).filter(Boolean).filter(x=>!['external','public','internal','private','view','pure','payable','virtual','override','returns','memory','calldata','storage'].includes(x)&&!/^[({]/.test(x));
    out.push({name,kind:raw.startsWith('modifier')?'modifier':'function',line:lineAt(text,declarationStart),endLine:end>=0?lineAt(text,end):lineAt(text,re.lastIndex),visibility,mutability,modifiers:[...new Set(modifierTokens)].slice(0,12),declaration,start:declarationStart,open,end:end>=0?end:re.lastIndex});
    if(end>=0)re.lastIndex=end+1;
  }
  return out;
}
function genericFunctions(text){
  const out=[];const patterns=[/\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g,/\b(?:pub\s+)?fn\s+([A-Za-z_][\w]*)\s*\([^)]*\)[^{;]*\{/g,/\bfun\s+([A-Za-z_][\w]*)\s*\([^)]*\)[^{;]*\{/g];
  for(const re of patterns){let m;while((m=re.exec(text))){const open=text.indexOf('{',m.index),end=open>=0?balancedBlock(text,open):-1;out.push({name:m[1],kind:'function',line:lineAt(text,m.index),endLine:end>=0?lineAt(text,end):lineAt(text,re.lastIndex),visibility:/\bpub(?:lic)?\b/.test(m[0])?'public':'unspecified',mutability:'unspecified',modifiers:[],declaration:clip(m[0].replace(/\s+/g,' '),500),start:m.index,open,end:end>=0?end:re.lastIndex});if(end>=0)re.lastIndex=end+1;}}
  return out;
}
function functionsFor(file,text){return path.extname(file).toLowerCase()==='.sol'?solidityFunctions(text):genericFunctions(text);}
function contractsFor(text){const out=[];const re=/\b(abstract\s+contract|contract|interface|library)\s+([A-Za-z_][\w]*)\b/g;let m;while((m=re.exec(text)))out.push({kind:m[1],name:m[2],line:lineAt(text,m.index)});return out;}
function enclosing(functions,line){return functions.find(f=>line>=f.line&&line<=f.endLine)?.name??null;}
function inspectFunction(file,text,symbol){
  const functions=functionsFor(file,text);const f=functions.find(x=>x.name===symbol);if(!f)return null;
  const body=f.open>=0&&f.end>f.open?text.slice(f.open+1,f.end):'';
  const calls=[];const callRe=/\b([A-Za-z_$][\w$]*)\s*\(/g;let m;
  while((m=callRe.exec(body))){const name=m[1];if(!CONTROL_CALLS.has(name)&&name!==symbol&&!calls.includes(name))calls.push(name);if(calls.length>=40)break;}
  const memberCalls=[];const member=/\b([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)\s*\(/g;
  while((m=member.exec(body))){const value=`${m[1]}.${m[2]}`;if(!memberCalls.includes(value))memberCalls.push(value);if(memberCalls.length>=30)break;}
  const writes=[];const writeRe=/\b([A-Za-z_$][\w$]*(?:\[[^\]\n]+\])?)\s*(\+\+|--|\+=|-=|\*=|\/=|%=|=(?!=))/g;
  while((m=writeRe.exec(body))){const target=m[1].replace(/\[[\s\S]*/,'');if(!['memory','calldata','storage'].includes(target)&&!writes.includes(target))writes.push(target);if(writes.length>=30)break;}
  const externalSignals=[];for(const marker of ['.call(','.delegatecall(','.staticcall(','.transfer(','.send(','safeTransfer(','safeTransferFrom('])if(body.includes(marker))externalSignals.push(marker.replace('(',''));
  return {path:null,name:f.name,kind:f.kind,line:f.line,endLine:f.endLine,visibility:f.visibility,mutability:f.mutability,modifiers:f.modifiers,declaration:f.declaration,calls,memberCalls,stateWrites:writes,externalSignals,bodyPreview:clip(body.replace(/\s+/g,' ').trim(),2400)};
}

export function codeSurface(root,relativePath='.'){
  const start=safeResearchPath(root,relativePath);const files=walk(root,start);const contracts=[],functions=[];
  for(const file of files){let text;try{text=readCode(file);}catch{continue;}const rel=relative(root,file);for(const c of contractsFor(text))if(contracts.length<160)contracts.push({...c,path:rel});for(const f of functionsFor(file,text))if(functions.length<400)functions.push({path:rel,name:f.name,line:f.line,endLine:f.endLine,visibility:f.visibility,mutability:f.mutability,modifiers:f.modifiers,kind:f.kind});}
  const externallyReachable=functions.filter(f=>['external','public'].includes(f.visibility)).slice(0,180);
  return {root:relativePath,filesScanned:files.length,contracts,externallyReachable,functions:functions.slice(0,240),truncated:files.length>=500||functions.length>=400};
}
export function codeSymbol(root,relativePath,query){
  const start=safeResearchPath(root,relativePath);const files=walk(root,start);const definitions=[],mentions=[];const word=new RegExp(`\\b${query.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\b`);
  for(const file of files){let text;try{text=readCode(file);}catch{continue;}const rel=relative(root,file),funcs=functionsFor(file,text);for(const f of funcs)if(f.name===query&&definitions.length<60)definitions.push({path:rel,kind:f.kind,name:f.name,line:f.line,endLine:f.endLine,visibility:f.visibility,modifiers:f.modifiers});for(const c of contractsFor(text))if(c.name===query&&definitions.length<60)definitions.push({path:rel,...c});if(mentions.length<80){const lines=text.split('\n');for(let i=0;i<lines.length&&mentions.length<80;i++)if(word.test(lines[i]))mentions.push({path:rel,line:i+1,enclosing:enclosing(funcs,i+1),text:clip(lines[i].trim(),360)});}}
  return {query,definitions,mentions,filesScanned:files.length,truncated:definitions.length>=60||mentions.length>=80};
}
export function codeReferences(root,relativePath,symbol){
  const r=codeSymbol(root,relativePath,symbol);return {symbol,references:r.mentions,definitions:r.definitions,enclosingFunctions:[...new Set(r.mentions.map(x=>x.enclosing).filter(Boolean))].slice(0,40),filesScanned:r.filesScanned,truncated:r.truncated};
}
export function codeInspect(root,relativePath,symbol){
  const file=safeResearchPath(root,relativePath);const text=readCode(file);const result=inspectFunction(file,text,symbol);insist(result,`Function or modifier ${symbol} not found in ${relativePath}`);result.path=relativePath;return result;
}
export function codeState(root,relativePath,symbol){
  const start=safeResearchPath(root,relativePath);const files=walk(root,start);const reads=[],writes=[];const word=new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}\\b`);
  for(const file of files){let text;try{text=readCode(file);}catch{continue;}const rel=relative(root,file),funcs=functionsFor(file,text),lines=text.split('\n');for(let i=0;i<lines.length;i++){const line=lines[i];if(!word.test(line))continue;const row={path:rel,line:i+1,enclosing:enclosing(funcs,i+1),text:clip(line.trim(),360)};if(new RegExp(`\\b${symbol.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')}(?:\\s*\\[[^\\]]+\\])?\\s*(?:\\+\\+|--|\\+=|-=|\\*=|/=|%=|=(?!=))`).test(line))writes.push(row);else reads.push(row);if(reads.length+writes.length>=120)return {symbol,writes,reads,truncated:true};}}
  return {symbol,writes,reads,truncated:false};
}
export function codeCompare(root,relativePath,symbols){
  const file=safeResearchPath(root,relativePath);const text=readCode(file);const compared=symbols.map(symbol=>{const r=inspectFunction(file,text,symbol);return r?{...r,path:relativePath}:{path:relativePath,name:symbol,missing:true};});return {path:relativePath,compared};
}
