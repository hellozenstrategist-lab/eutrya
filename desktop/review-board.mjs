import { createHash, randomUUID } from 'node:crypto';

// Metadata only. This module never calls a model, scheduler, target, or tool executor.
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function record(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Expected an object');
  return value;
}
function keys(value, allowed) {
  record(value);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`Unsupported field: ${key}`);
}
function text(value, name, max, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(`Invalid ${name}`);
  return value.trim();
}
function strings(value, name, max = 300, count = 80) {
  if (!Array.isArray(value) || value.length > count) fail(`Invalid ${name}`);
  return [...new Set(value.map(v => text(v, name, max)))];
}
function pageUrl(value) {
  let url;
  try { url = new URL(text(value, 'program page', 2048)); } catch { fail('Enter an http or https program page URL'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) fail('Invalid program page URL');
  return url.href;
}
export function editToken(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
export function withEditToken(value) { return { ...value, editToken: editToken(value) }; }
export function reviewBoardView(workspace) {
  return { hunts: workspace.listHunts().map(withEditToken), cards: workspace.listHuntCards().map(withEditToken) };
}
function fresh(value, expected) {
  if (typeof expected !== 'string' || expected !== editToken(value)) fail('This record changed. Refresh and review the latest version before saving.', 409);
}

export function editReviewBoard(swarm, method, pathname, input) {
  if (!pathname.startsWith('/api/review/')) return null;
  if (!swarm) fail('Runtime not ready', 503);
  const ws = swarm.sharedWorkspace;
  record(input);
  let result, code = 200;
  if (method === 'POST' && pathname === '/api/review/hunts') {
    keys(input, ['title', 'pageUrl', 'rules', 'scope', 'exclusions', 'testingRules']);
    if (ws.listHunts().length >= 200) fail('Board limit reached');
    const values = {
      title: text(input.title, 'title', 300), pageUrl: pageUrl(input.pageUrl),
      rules: text(input.rules, 'rules', 12000), scope: strings(input.scope, 'scope'),
      exclusions: strings(input.exclusions, 'exclusions'), testingRules: strings(input.testingRules, 'testing rules', 500),
      createdBy: 'desktop-operator'
    };
    const hunt = ws.createHunt(values);
    ws.updateHunt(hunt.id, { status: 'paused' });
    result = { hunt: withEditToken(hunt) };
    code = 201;
  } else {
    const match = pathname.match(/^\/api\/review\/(hunts|cards)\/([a-zA-Z0-9_-]{1,64})(?:\/(cards|status))?$/);
    if (!match) fail('Unknown review endpoint', 404);
    const [, type, id, operation] = match;
    if (type === 'hunts') {
      const hunt = ws.getHunt(id);
      if (!hunt) fail('Hunt not found', 404);
      if (method === 'POST' && operation === 'cards') {
        keys(input, ['title', 'objective', 'priority', 'preferredRoles', 'dependsOn', 'expectedToken']);
        fresh(hunt, input.expectedToken);
        if (hunt.status !== 'paused') fail('Pause the board before adding manual cards', 409);
        if (ws.listHuntCards({ huntId: id }).some(c => c.assignedTo)) fail('Wait for assigned work to stop before adding cards', 409);
        if (ws.listHuntCards({ huntId: id }).length >= 500) fail('Card limit reached');
        const title = text(input.title, 'title', 400), objective = text(input.objective, 'objective', 5000);
        if (!['critical', 'high', 'medium', 'low'].includes(input.priority)) fail('Invalid priority');
        const roles = strings(input.preferredRoles, 'preferred roles', 32, 8);
        if (roles.some(role => !swarm.profiles.has(role))) fail('Unknown preferred role');
        const dependencies = strings(input.dependsOn, 'dependencies', 64, 20);
        if (dependencies.some(dep => ws.getHuntCard(dep)?.huntId !== id)) fail('Dependencies must belong to this board');
        const now = new Date().toISOString();
        const card = {
          id: `card-${randomUUID().replaceAll('-', '')}`, huntId: id, title, objective,
          priority: input.priority, preferredRoles: roles, dependsOn: dependencies,
          status: 'parked', assignedTo: null, worker: null, reviewer: null,
          workerResult: null, reviewResult: null, blockers: [], routeHistory: [], attempts: 0,
          createdBy: 'desktop-operator', createdAt: now, updatedAt: now
        };
        ws.huntCards.set(card.id, card);
        hunt.cardIds.push(card.id);
        hunt.updatedAt = now;
        result = { card: withEditToken(card), hunt: withEditToken(hunt) };
        code = 201;
      } else if (method === 'PATCH' && operation === 'status') {
        keys(input, ['status', 'expectedToken']);
        fresh(hunt, input.expectedToken);
        if (!['active', 'paused'].includes(input.status) || hunt.status === 'completed') fail('Invalid board transition');
        ws.updateHunt(id, { status: input.status });
        if (input.status === 'paused') {
          for (const card of ws.listHuntCards({ huntId: id })) {
            const runtime = card.assignedTo ? swarm.runtimes.get(card.assignedTo) : null;
            if (runtime?.busy) runtime.stop();
          }
        }
        result = { hunt: withEditToken(hunt), executionStarted: false };
      } else fail('Unknown review endpoint', 404);
    } else if (method === 'PATCH' && !operation) {
      keys(input, ['expectedToken', 'note', 'status']);
      const card = ws.getHuntCard(id);
      if (!card) fail('Card not found', 404);
      fresh(card, input.expectedToken);
      const note = input.note === undefined ? undefined : text(input.note, 'review note', 8000, false);
      if (input.status !== undefined) {
        if (!['parked', 'blocked'].includes(input.status)) fail('Runtime work stages cannot be set from the review UI');
        if (card.assignedTo || ['active', 'review', 'done'].includes(card.status)) fail('Running or completed work cannot be moved manually', 409);
        if (input.status === 'blocked' && !note) fail('Explain the blocker in a review note');
      }
      if (note !== undefined) {
        card.humanNotes = note;
        card.humanReviewedAt = new Date().toISOString();
      }
      const patch = input.status === undefined ? {} : { status: input.status };
      if (input.status === 'blocked') patch.blockers = [note];
      ws.updateHuntCard(id, patch);
      result = { card: withEditToken(card) };
    } else fail('Unknown review endpoint', 404);
  }
  ws.save(swarm.swarmDir);
  return { code, ...result };
}
