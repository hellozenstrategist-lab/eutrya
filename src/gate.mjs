import { digest, uid, insist } from './util.mjs';

export function semanticState(s) {
  return {id:s.id,workspace:s.workspace,revision:s.revision,task:s.task,directives:s.directives,
    summary:s.summary,hypotheses:s.hypotheses,unknowns:s.unknowns,lastMode:s.lastMode,
    observations:s.observations,notebook:s.notebook,research:s.research??null,environment:s.environment};
}
export class DecisionGate {
  #issued=new Map();
  constructor({clock=Date.now,ttlMs=300000}={}) { this.clock=clock; this.ttlMs=ttlMs; }
  issue(state,candidate,decision) {
    insist(decision && decision.selected===candidate.id && ['jev','mock'].includes(decision.source), 'A matching evaluation decision is required');
    const ticket=Object.freeze({nonce:uid(),stateHash:digest(semanticState(state)),candidateHash:digest(candidate),
      expiresAt:this.clock()+this.ttlMs,source:decision.source,decisionId:decision.id});
    this.#issued.set(ticket.nonce,ticket); return ticket;
  }
  assert(state,candidate,ticket) {
    insist(ticket && this.#issued.get(ticket.nonce)===ticket,'Missing, forged, replayed, or previous-process decision ticket');
    insist(ticket.expiresAt>=this.clock(),'Decision ticket expired; reevaluation required');
    insist(ticket.stateHash===digest(semanticState(state)),'Stale decision: state changed');
    insist(ticket.candidateHash===digest(candidate),'Proposal changed after evaluation');
  }
  consume(state,candidate,ticket) { this.assert(state,candidate,ticket); this.#issued.delete(ticket.nonce); }
  revokeAll() { this.#issued.clear(); }
}
