export function parseContextBudget(input) {
  const raw=String(input??'').trim().toLowerCase();
  if(!raw) return null;
  const m=raw.match(/^(\d+(?:\.\d+)?)([km]?)$/);
  if(!m) throw new Error('Use /context N, /context 64k, or /context 0.1m');
  const value=Number(m[1]);
  const mult=m[2]==='k'?1000:m[2]==='m'?1000000:1;
  const chars=Math.round(value*mult);
  if(!Number.isInteger(chars) || chars<4000 || chars>200000) throw new Error('Context budget must be between 4k and 200k serialized characters');
  return chars;
}

export function parseAutoCompact(input) {
  const raw=String(input??'').trim().toLowerCase();
  if(!raw) return null;
  if(['on','true','yes','1','enable','enabled'].includes(raw)) return true;
  if(['off','false','no','0','disable','disabled'].includes(raw)) return false;
  throw new Error('Use /autocompact on or /autocompact off');
}
