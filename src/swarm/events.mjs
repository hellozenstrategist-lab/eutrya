import { insist, uid } from '../util.mjs';

export const SWARM_EVENTS = Object.freeze({
  TASK_ASSIGNED: 'TASK_ASSIGNED',
  RESEARCH_REQUIRED: 'RESEARCH_REQUIRED',
  IMPLEMENTATION_REQUIRED: 'IMPLEMENTATION_REQUIRED',
  LEGAL_REVIEW_REQUIRED: 'LEGAL_REVIEW_REQUIRED',
  FINANCIAL_ANALYSIS_REQUIRED: 'FINANCIAL_ANALYSIS_REQUIRED',
  CANDIDATE_RESULT: 'CANDIDATE_RESULT',
  BLOCKED: 'BLOCKED',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED',
  TASK_COMPLETE: 'TASK_COMPLETE',
  DIRECT_MESSAGE: 'DIRECT_MESSAGE'
});

export const EVENT_DEFAULT_ROUTING = Object.freeze({
  RESEARCH_REQUIRED: 'researcher',
  IMPLEMENTATION_REQUIRED: 'engineer',
  LEGAL_REVIEW_REQUIRED: 'legal',
  FINANCIAL_ANALYSIS_REQUIRED: 'finance',
  CANDIDATE_RESULT: 'admin',
  BLOCKED: 'admin'
});

export class SwarmEventBus {
  constructor() {
    this.handlers = new Map();
    this.eventLog = [];
  }

  on(eventType, handler) {
    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Set());
    }
    this.handlers.get(eventType).add(handler);
    return () => this.off(eventType, handler);
  }

  off(eventType, handler) {
    this.handlers.get(eventType)?.delete(handler);
  }

  async emit(event) {
    insist(event && typeof event === 'object', 'Event must be an object');
    insist(event.type && typeof event.type === 'string', 'Event type is required');
    const record = {
      id: `ev-${uid().slice(0, 8)}`,
      type: event.type,
      from: event.from || 'system',
      to: event.to || EVENT_DEFAULT_ROUTING[event.type] || 'admin',
      payload: event.payload ?? {},
      at: new Date().toISOString()
    };
    this.eventLog.push(record);
    if (this.eventLog.length > 500) this.eventLog.shift();

    const specificHandlers = this.handlers.get(record.type) ?? [];
    const wildcardHandlers = this.handlers.get('*') ?? [];
    const all = [...specificHandlers, ...wildcardHandlers];

    for (const h of all) {
      try {
        await Promise.resolve(h(record));
      } catch (err) {
        console.error(`Swarm event handler error for ${record.type}:`, err);
      }
    }
    return record;
  }

  history({ limit = 50, type = null } = {}) {
    let list = this.eventLog;
    if (type) list = list.filter(e => e.type === type);
    return list.slice(-limit);
  }
}
