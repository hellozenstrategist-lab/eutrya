import { integer, insist } from './util.mjs';

const lights = value => Array.from({length:4},(_,i)=>Boolean(value & (1<<i)));
export const bits = lamps => lamps.reduce((n,on,i)=>n|(on?1<<i:0),0);
export function makePuzzle(seed=1) {
  integer(seed,'seed',1,2147483647);
  let rng=seed;
  const rand=()=>{rng^=rng<<13; rng^=rng>>>17; rng^=rng<<5; return rng>>>0;};
  // A randomly transformed basis ensures the hidden switch mapping is solvable.
  const masks=[1,2,4,8];
  for(let i=0;i<16;i++) {const a=rand()%4; let b=rand()%4; if(a===b)b=(b+1)%4; masks[a]^=masks[b];}
  return {kind:'switchboard-v1',seed,masks,value:rand()%15,presses:0};
}
export function lookPuzzle(environment) {
  insist(environment?.kind==='switchboard-v1','No switchboard is attached');
  return {lamps:lights(environment.value),switches:[0,1,2,3],goal:'Make all four lamps lit. The wiring is unknown. Each press changes the board.',presses:environment.presses};
}
export function pressPuzzle(environment,index) {
  integer(index,'switch',0,3);
  const before=lookPuzzle(environment);
  environment.value^=environment.masks[index]; environment.presses++;
  return {switch:index,before:before.lamps,after:lights(environment.value),presses:environment.presses};
}
export function verifyPuzzle(environment) { return environment?.kind==='switchboard-v1' && environment.value===15; }
export const PUZZLE_TASK='Solve the attached switchboard. Discover how its four switches affect the lamps and make all four lamps light up. Use observations, not access to the hidden implementation. Finish only when the visible board satisfies the goal.';
