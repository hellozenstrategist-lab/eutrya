import fs from 'node:fs';
import path from 'node:path';
import { uid, insist, clip } from '../util.mjs';

export const AGENT_STATUSES = Object.freeze(['IDLE', 'THINKING', 'WORKING', 'WAITING', 'BLOCKED', 'REVIEWING']);
export const TASK_STATUSES = Object.freeze(['backlog', 'in_progress', 'review', 'blocked', 'completed']);
export const HUNT_STATUSES = Object.freeze(['active', 'paused', 'completed']);
export const HUNT_CARD_STATUSES = Object.freeze(['intake', 'ready', 'active', 'review', 'blocked', 'done', 'parked']);
export const HUNT_PRIORITIES = Object.freeze(['critical', 'high', 'medium', 'low']);

export class SharedWorkspace {
  constructor({ workspaceDir = null } = {}) {
    this.workspaceDir = workspaceDir;
    this.tasks = new Map();
    this.hunts = new Map();
    this.huntCards = new Map();
    this.findings = [];
    this.decisions = [];
    this.artifacts = [];
    this.messages = [];
    this.evidence = [];
    this.openQuestions = [];
    this.blockers = [];
    this.agentStatuses = new Map();
  }

  // --- Agent Status ---
  initAgent(id, { name, role } = {}) {
    this.agentStatuses.set(id, {
      id,
      name: name ?? id,
      role: role ?? 'Specialist',
      status: 'IDLE',
      currentTask: null,
      lastActive: new Date().toISOString()
    });
  }

  setAgentStatus(agentId, status, currentTask = null) {
    insist(AGENT_STATUSES.includes(status), `Invalid agent status: ${status}`);
    const current = this.agentStatuses.get(agentId) ?? { id: agentId, name: agentId, role: 'Specialist' };
    this.agentStatuses.set(agentId, {
      ...current,
      status,
      currentTask,
      lastActive: new Date().toISOString()
    });
  }

  getAgentStatus(agentId) {
    return this.agentStatuses.get(agentId) ?? null;
  }

  getAllAgentStatuses() {
    return Array.from(this.agentStatuses.values());
  }

  // --- Tasks ---
  createTask({ title, description = '', assignedTo = 'admin', createdBy = 'user' }) {
    insist(title && typeof title === 'string', 'Task title must be a nonempty string');
    const id = `task-${uid().slice(0, 8)}`;
    const task = {
      id,
      title: clip(title.trim(), 500),
      description: clip(description.trim(), 2000),
      assignedTo,
      createdBy,
      status: 'backlog',
      result: null,
      blockers: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.tasks.set(id, task);
    return task;
  }

  updateTask(id, { status, result = null, blockers = null } = {}) {
    const task = this.tasks.get(id);
    insist(task, `Task not found: ${id}`);
    if (status) {
      insist(TASK_STATUSES.includes(status), `Invalid task status: ${status}`);
      task.status = status;
    }
    if (result !== null && result !== undefined) {
      task.result = clip(String(result), 4000);
    }
    if (Array.isArray(blockers)) {
      task.blockers = blockers.map(b => clip(String(b), 500));
    }
    task.updatedAt = new Date().toISOString();
    return task;
  }

  getTask(id) {
    return this.tasks.get(id) ?? null;
  }

  listTasks(filter = {}) {
    let list = Array.from(this.tasks.values());
    if (filter.status) list = list.filter(t => t.status === filter.status);
    if (filter.assignedTo) list = list.filter(t => t.assignedTo === filter.assignedTo);
    return list;
  }

  // --- Hunt Boards ---
  createHunt({ title, pageUrl, rules = '', scope = [], exclusions = [], testingRules = [], createdBy = 'admin' }) {
    insist(title && typeof title === 'string', 'Hunt title must be a nonempty string');
    insist(typeof pageUrl === 'string' && /^https?:\/\//i.test(pageUrl), 'Hunt pageUrl must be http or https');
    const id = `hunt-${uid().slice(0, 8)}`;
    const hunt = {
      id,
      title: clip(title.trim(), 300),
      pageUrl: clip(pageUrl.trim(), 2048),
      rules: clip(String(rules), 12000),
      scope: Array.isArray(scope) ? scope.slice(0, 80).map(x => clip(String(x), 300)) : [],
      exclusions: Array.isArray(exclusions) ? exclusions.slice(0, 80).map(x => clip(String(x), 300)) : [],
      testingRules: Array.isArray(testingRules) ? testingRules.slice(0, 80).map(x => clip(String(x), 500)) : [],
      status: 'active',
      createdBy: String(createdBy || 'admin'),
      cardIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.hunts.set(id, hunt);
    return hunt;
  }

  getHunt(id) {
    return this.hunts.get(id) ?? null;
  }

  listHunts({ status = null } = {}) {
    let rows = Array.from(this.hunts.values());
    if (status) rows = rows.filter(h => h.status === status);
    return rows.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  updateHunt(id, { status = null } = {}) {
    const hunt = this.hunts.get(id);
    insist(hunt, `Hunt not found: ${id}`);
    if (status) {
      insist(HUNT_STATUSES.includes(status), `Invalid hunt status: ${status}`);
      hunt.status = status;
    }
    hunt.updatedAt = new Date().toISOString();
    return hunt;
  }

  createHuntCard({ huntId, title, objective, priority = 'medium', preferredRoles = [], dependsOn = [], createdBy = 'admin' }) {
    const hunt = this.hunts.get(huntId);
    insist(hunt, `Hunt not found: ${huntId}`);
    insist(hunt.status === 'active', 'Cannot add cards to a non-active hunt');
    insist(title && typeof title === 'string', 'Hunt card title is required');
    insist(objective && typeof objective === 'string', 'Hunt card objective is required');
    insist(HUNT_PRIORITIES.includes(priority), `Invalid hunt priority: ${priority}`);
    const id = `card-${uid().slice(0, 8)}`;
    const card = {
      id,
      huntId,
      title: clip(title.trim(), 400),
      objective: clip(objective.trim(), 5000),
      priority,
      preferredRoles: Array.isArray(preferredRoles) ? [...new Set(preferredRoles.map(String))].slice(0, 8) : [],
      dependsOn: Array.isArray(dependsOn) ? [...new Set(dependsOn.map(String))].slice(0, 20) : [],
      status: dependsOn.length ? 'intake' : 'ready',
      assignedTo: null,
      worker: null,
      reviewer: null,
      workerResult: null,
      reviewResult: null,
      blockers: [],
      routeHistory: [],
      attempts: 0,
      createdBy: String(createdBy || 'admin'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.huntCards.set(id, card);
    hunt.cardIds.push(id);
    hunt.updatedAt = card.updatedAt;
    return card;
  }

  getHuntCard(id) {
    return this.huntCards.get(id) ?? null;
  }

  listHuntCards({ huntId = null, status = null, assignedTo = null } = {}) {
    let rows = Array.from(this.huntCards.values());
    if (huntId) rows = rows.filter(c => c.huntId === huntId);
    if (status) rows = rows.filter(c => c.status === status);
    if (assignedTo) rows = rows.filter(c => c.assignedTo === assignedTo);
    const rank = { critical: 0, high: 1, medium: 2, low: 3 };
    return rows.sort((a,b) => (rank[a.priority] - rank[b.priority]) || a.createdAt.localeCompare(b.createdAt));
  }

  dependenciesSatisfied(card) {
    return card.dependsOn.every(id => this.huntCards.get(id)?.status === 'done');
  }

  refreshHuntReadiness(huntId) {
    const changed=[];
    for(const card of this.listHuntCards({huntId})) {
      if(card.status==='intake' && this.dependenciesSatisfied(card)) {
        card.status='ready';
        card.updatedAt=new Date().toISOString();
        changed.push(card.id);
      }
    }
    if(changed.length) {
      const hunt=this.hunts.get(huntId);
      if(hunt) hunt.updatedAt=new Date().toISOString();
    }
    return changed;
  }

  updateHuntCard(id, patch = {}) {
    const card = this.huntCards.get(id);
    insist(card, `Hunt card not found: ${id}`);
    if (patch.status !== undefined) {
      insist(HUNT_CARD_STATUSES.includes(patch.status), `Invalid hunt card status: ${patch.status}`);
      card.status = patch.status;
    }
    for (const key of ['assignedTo','worker','reviewer']) {
      if (patch[key] !== undefined) card[key] = patch[key] === null ? null : String(patch[key]);
    }
    if (patch.workerResult !== undefined) card.workerResult = patch.workerResult === null ? null : clip(String(patch.workerResult), 12000);
    if (patch.reviewResult !== undefined) card.reviewResult = patch.reviewResult === null ? null : clip(String(patch.reviewResult), 12000);
    if (Array.isArray(patch.blockers)) card.blockers = patch.blockers.map(x => clip(String(x), 800)).slice(0, 20);
    if (patch.routeEvent) {
      card.routeHistory.push({
        agent: String(patch.routeEvent.agent),
        stage: String(patch.routeEvent.stage),
        source: String(patch.routeEvent.source || 'jev'),
        probability: Number.isFinite(patch.routeEvent.probability) ? patch.routeEvent.probability : null,
        at: new Date().toISOString()
      });
      card.routeHistory = card.routeHistory.slice(-30);
    }
    if (patch.incrementAttempts) card.attempts++;
    card.updatedAt = new Date().toISOString();
    const hunt = this.hunts.get(card.huntId);
    if (hunt) hunt.updatedAt = card.updatedAt;
    return card;
  }

  huntBoard(huntId = null) {
    const hunt = huntId ? this.hunts.get(huntId) : this.listHunts({ status: 'active' })[0] ?? this.listHunts()[0] ?? null;
    if (!hunt) return null;
    return {
      hunt,
      cards: this.listHuntCards({ huntId: hunt.id }),
      agents: this.getAllAgentStatuses()
    };
  }

  // --- Findings ---
  publishFinding({ author, topic, content, evidence = [], verified = false }) {
    insist(topic && typeof topic === 'string', 'Finding topic is required');
    insist(content && typeof content === 'string', 'Finding content is required');
    const finding = {
      id: `find-${uid().slice(0, 8)}`,
      author: String(author || 'anonymous'),
      topic: clip(topic.trim(), 200),
      content: clip(content.trim(), 4000),
      evidence: Array.isArray(evidence) ? evidence.map(String) : [],
      verified: Boolean(verified),
      at: new Date().toISOString()
    };
    this.findings.push(finding);
    return finding;
  }

  listFindings(topic = null) {
    if (!topic) return [...this.findings];
    return this.findings.filter(f => f.topic.toLowerCase().includes(topic.toLowerCase()));
  }

  // --- Decisions ---
  recordDecision({ author, title, rationale, alternatives = [] }) {
    insist(title && typeof title === 'string', 'Decision title is required');
    insist(rationale && typeof rationale === 'string', 'Decision rationale is required');
    const decision = {
      id: `dec-${uid().slice(0, 8)}`,
      author: String(author || 'admin'),
      title: clip(title.trim(), 300),
      rationale: clip(rationale.trim(), 4000),
      alternatives: Array.isArray(alternatives) ? alternatives.map(a => clip(String(a), 500)) : [],
      at: new Date().toISOString()
    };
    this.decisions.push(decision);
    return decision;
  }

  listDecisions() {
    return [...this.decisions];
  }

  // --- Artifacts ---
  recordArtifact({ path: filePath, creator, description = '', hash = null }) {
    insist(filePath && typeof filePath === 'string', 'Artifact path is required');
    const artifact = {
      id: `art-${uid().slice(0, 8)}`,
      path: String(filePath),
      creator: String(creator || 'unknown'),
      description: clip(String(description), 1000),
      hash: hash ? String(hash) : null,
      at: new Date().toISOString()
    };
    this.artifacts.push(artifact);
    return artifact;
  }

  listArtifacts() {
    return [...this.artifacts];
  }

  // --- Messages ---
  postMessage({ from, to, event, content, replyTo = null }) {
    insist(from && to && content, 'Message from, to, and content are required');
    const msg = {
      id: `msg-${uid().slice(0, 8)}`,
      from: String(from),
      to: String(to),
      event: String(event || 'DIRECT_MESSAGE'),
      content: clip(String(content).trim(), 4000),
      replyTo: replyTo ? String(replyTo) : null,
      timestamp: new Date().toISOString()
    };
    this.messages.push(msg);
    return msg;
  }

  listMessages({ agent = null, limit = 50 } = {}) {
    let msgs = this.messages;
    if (agent) {
      msgs = msgs.filter(m => m.from === agent || m.to === agent || m.to === 'all');
    }
    return msgs.slice(-limit);
  }

  // --- Blockers ---
  addBlocker({ agent, description }) {
    insist(agent && description, 'Blocker agent and description are required');
    const b = {
      id: `blk-${uid().slice(0, 8)}`,
      agent: String(agent),
      description: clip(String(description).trim(), 1000),
      resolved: false,
      at: new Date().toISOString()
    };
    this.blockers.push(b);
    return b;
  }

  resolveBlocker(id) {
    const b = this.blockers.find(x => x.id === id);
    if (b) {
      b.resolved = true;
      b.resolvedAt = new Date().toISOString();
    }
    return b ?? null;
  }

  listBlockers({ unresolvedOnly = true } = {}) {
    if (unresolvedOnly) return this.blockers.filter(b => !b.resolved);
    return [...this.blockers];
  }

  // --- Memory Snapshot for Model Context ---
  summary() {
    const activeTasks = Array.from(this.tasks.values()).filter(t => t.status !== 'completed');
    const completedTasks = Array.from(this.tasks.values()).filter(t => t.status === 'completed');
    const recentFindings = this.findings.slice(-6);
    const recentDecisions = this.decisions.slice(-4);
    const activeBlockers = this.blockers.filter(b => !b.resolved);
    const statuses = Array.from(this.agentStatuses.values());
    const activeHunts = this.listHunts({ status: 'active' }).slice(0, 3);
    const huntCards = activeHunts.flatMap(h => this.listHuntCards({ huntId: h.id }).filter(c => !['done','parked'].includes(c.status)).slice(0, 12));

    return {
      agents: statuses.map(s => `${s.name} (${s.role}): ${s.status}${s.currentTask ? ' - "' + clip(s.currentTask, 60) + '"' : ''}`),
      activeTasks: activeTasks.map(t => `[${t.id}] ${t.title} (assigned: ${t.assignedTo}, status: ${t.status})`),
      completedTasks: completedTasks.slice(-5).map(t => `[${t.id}] ${t.title} -> ${clip(t.result ?? 'Done', 100)}`),
      recentFindings: recentFindings.map(f => `${f.topic} (by ${f.author}): ${clip(f.content, 120)}`),
      recentDecisions: recentDecisions.map(d => `${d.title} (by ${d.author}): ${clip(d.rationale, 100)}`),
      activeBlockers: activeBlockers.map(b => `${b.agent} BLOCKED: ${b.description}`),
      activeHunts: activeHunts.map(h => `[${h.id}] ${h.title} (${h.status}) ${h.pageUrl}`),
      huntCards: huntCards.map(c => `[${c.id}] ${c.title} (${c.status}, priority: ${c.priority}, assigned: ${c.assignedTo ?? 'unassigned'})`)
    };
  }

  serialize() {
    return {
      tasks: Array.from(this.tasks.entries()),
      hunts: Array.from(this.hunts.entries()),
      huntCards: Array.from(this.huntCards.entries()),
      findings: this.findings,
      decisions: this.decisions,
      artifacts: this.artifacts,
      messages: this.messages,
      evidence: this.evidence,
      openQuestions: this.openQuestions,
      blockers: this.blockers,
      agentStatuses: Array.from(this.agentStatuses.entries())
    };
  }

  restore(data) {
    if (!data || typeof data !== 'object') return;
    if (Array.isArray(data.tasks)) this.tasks = new Map(data.tasks);
    if (Array.isArray(data.hunts)) this.hunts = new Map(data.hunts);
    if (Array.isArray(data.huntCards)) this.huntCards = new Map(data.huntCards);
    if (Array.isArray(data.findings)) this.findings = data.findings;
    if (Array.isArray(data.decisions)) this.decisions = data.decisions;
    if (Array.isArray(data.artifacts)) this.artifacts = data.artifacts;
    if (Array.isArray(data.messages)) this.messages = data.messages;
    if (Array.isArray(data.evidence)) this.evidence = data.evidence;
    if (Array.isArray(data.openQuestions)) this.openQuestions = data.openQuestions;
    if (Array.isArray(data.blockers)) this.blockers = data.blockers;
    if (Array.isArray(data.agentStatuses)) this.agentStatuses = new Map(data.agentStatuses);
  }

  save(dir) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      const file = path.join(dir, 'shared-workspace.json');
      fs.writeFileSync(file, JSON.stringify(this.serialize(), null, 2) + '\n', { mode: 0o600 });
    } catch {}
  }

  load(dir) {
    try {
      const file = path.join(dir, 'shared-workspace.json');
      if (fs.existsSync(file)) {
        const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
        this.restore(raw);
      }
    } catch {}
  }
}
