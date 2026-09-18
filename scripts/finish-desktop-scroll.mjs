import fs from 'node:fs';
import assert from 'node:assert/strict';
const file='desktop/web/hunts.js';
let s=fs.readFileSync(file,'utf8');
const replace=(needle,value)=>{assert.equal(s.split(needle).length,2,`Missing unique marker: ${needle.slice(0,80)}`);s=s.replace(needle,value)};
replace('<section class="hunt-residents" aria-label="Live agent assignments">','<nav class="hunt-column-jumps" aria-label="Jump to Kanban column">${columns.map(col=>`<button type="button" data-hunt-jump="${col}">${labels[col]} <b>${m.groups[col].length}</b></button>`).join(\'\')}</nav>\n      <section class="hunt-residents" aria-label="Live agent assignments">');
replace("await request('POST',`/api/review/hunts/${encodeURIComponent(h.id)}/cards`,{title:v.title,objective:v.objective,priority:v.priority,preferredRoles:v.role?[v.role]:[],dependsOn:v.dependency?[v.dependency]:[],expectedToken:h.editToken})","const added=await request('POST',`/api/review/hunts/${encodeURIComponent(h.id)}/cards`,{title:v.title,objective:v.objective,priority:v.priority,preferredRoles:v.role?[v.role]:[],dependsOn:v.dependency?[v.dependency]:[],expectedToken:h.editToken})\n        window.EutryaStudio.state.huntRevealCard=added.card.id");
replace("await request('PATCH',`/api/review/cards/${encodeURIComponent(card.id)}`,{expectedToken:card.editToken,note:v.note,...(action!=='note'?{status:action}:{})})","await request('PATCH',`/api/review/cards/${encodeURIComponent(card.id)}`,{expectedToken:card.editToken,note:v.note,...(action!=='note'?{status:action}:{})})\n      window.EutryaStudio.state.huntRevealCard=card.id");
replace("    const s=window.EutryaStudio.state\n    document.querySelectorAll('[data-hunt-card]')",`    const s=window.EutryaStudio.state
    const board=document.querySelector('.hunt-kanban'), boardId=s.selectedHunt||'none'
    s.huntScrollPositions??={}
    const jump=column=>{if(board&&column)board.scrollLeft+=column.getBoundingClientRect().left-board.getBoundingClientRect().left}
    if(board){
      board.scrollLeft=s.huntScrollPositions[boardId]||0
      board.addEventListener('scroll',()=>{s.huntScrollPositions[boardId]=board.scrollLeft},{passive:true})
      const reveal=s.huntRevealCard
      if(reveal){
        const card=[...board.querySelectorAll('[data-hunt-card]')].find(el=>el.dataset.huntCard===reveal)
        if(card)jump(card.closest('[data-hunt-column]'))
        delete s.huntRevealCard
      }
    }
    document.querySelectorAll('[data-hunt-jump]').forEach(el=>el.addEventListener('click',()=>{
      const column=[...document.querySelectorAll('[data-hunt-column]')].find(c=>c.dataset.huntColumn===el.dataset.huntJump)
      jump(column)
    }))
    document.querySelectorAll('[data-hunt-card]')`);
fs.writeFileSync(file,s);
fs.appendFileSync('desktop/web/css/hunts.css','\n.hunt-column-jumps{display:flex;gap:7px;flex-wrap:wrap;margin:16px 0}.hunt-column-jumps button{font:11px/1.5 monospace;min-height:32px;padding:5px 10px;border:1px solid #bfc8b6;border-radius:3px;background:#f4f4eb;color:#344c3d;cursor:pointer}.hunt-column-jumps b{margin-left:6px;font-weight:400;color:#72816a}.hunt-column-jumps button:hover{background:#e3e9d9}\n');
console.log('Kanban scroll preservation and keyboard column navigation added.');
