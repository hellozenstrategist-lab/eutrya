import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { Eutrya } from '../runtime.mjs';
import { Toolbox } from '../tools.mjs';
import { Store, workspaceBucket } from '../store.mjs';
import { GatewayCortex, availableModels } from '../providers/gateway.mjs';
import { GatewayJev } from '../providers/jev.mjs';
import { DemoCortex, MockJev } from '../providers/mock.mjs';
import { SharedWorkspace } from './workspace.mjs';
import { SwarmEventBus, SWARM_EVENTS, EVENT_DEFAULT_ROUTING } from './events.mjs';
import { DEFAULT_PROFILES, TEMPLATES, validateProfile, createDefaultSwarmConfig } from './profile.mjs';
import { insist, uid, clip, redactor } from '../util.mjs';
import { createAdaptive } from '../../extensions/eutrya-adaptive-extension/src/index.mjs';
import { createChatStreamer } from '../../extensions/eutrya-adaptive-extension/src/chat-stream.mjs';
import { createCodexSubscriptionStreamer } from '../providers/codex-subscription.mjs';

export class NativeSwarm {
  constructor({
    config,
    workspace,
    demo = false,
    approve = async () => false,
    onEvent = () => {},
    redact = redactor()
  }) {
    this.config = config;
    this.workspace = fs.realpathSync(workspace);
    this.demo = demo;
    this.approve = approve;
    this.onEvent = onEvent;
    this.redact = redact;

    this.swarmDir = path.join(workspaceBucket(config.sessionRoot, this.workspace), 'swarm');
    fs.mkdirSync(this.swarmDir, { recursive: true, mode: 0o700 });

    this.sharedWorkspace = new SharedWorkspace({ workspaceDir: this.workspace });
    this.sharedWorkspace.load(this.swarmDir);

    this.eventBus = new SwarmEventBus();
    this.profiles = new Map();
    this.runtimes = new Map();
    this.activeAgentId = 'admin';

    this.loadProfiles();
    this.setupEventHandlers();
    this.initAdaptive();
  }

  initAdaptive() {
    try {
      const adaptiveDir = path.join(this.swarmDir, 'adaptive');
      fs.mkdirSync(adaptiveDir, { recursive: true, mode: 0o700 });

      const agentsConfig = {};
      for (const [id, prof] of this.profiles.entries()) {
        agentsConfig[id] = {
          enabled: prof.enabled,
          role: prof.role,
          manualOnly: false,
          allowedEvents: ['TASK_ASSIGNED', 'REVIEW_REQUIRED'],
          canDelegate: id === 'admin' || id === 'operator',
          allowedTemplates: ['helper', 'analyst', 'verifier']
        };
      }

      if (!process.env.AI_GATEWAY_API_KEY) {
        for (const p of [path.join(os.homedir(), '.config', 'eutrya', 'env'), path.join(os.homedir(), '.config', 'eutrya', '.env')]) {
          if (fs.existsSync(p)) {
            try {
              for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
                const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
                if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["\x27](.*)["\x27]$/, '$1');
              }
            } catch {}
          }
        }
      }

      const key = (this.config.mainKeyEnv ? process.env[this.config.mainKeyEnv] : (this.config.mainProvider === 'openrouter' ? process.env.OPENROUTER_API_KEY : process.env.AI_GATEWAY_API_KEY)) || '';
      let streamText;
      if(this.demo) {
        streamText=async ({onToken})=>{const text='Offline demo answer.';onToken(text);return {text};};
      } else if(this.config.mainProvider==='chatgpt') {
        streamText=createCodexSubscriptionStreamer({model:this.config.mainModel,timeoutMs:this.config.timeoutMs});
      } else if(!key) {
        streamText=null;
      } else {
        streamText=createChatStreamer({
          provider: this.config.mainProvider ?? 'vercel',
          model: this.config.mainModel,
          apiKey: key,
          baseUrl: this.config.mainBaseUrl || undefined
        });
      }

      const jevAdapter = {
        source: this.demo ? 'mock' : 'jev',
        model: this.config.jevModel,
        evaluate: async ({ state, questions, signal }) => {
          const jev = this.demo ? new MockJev() : new GatewayJev(this.config);
          const result = await jev.evaluate(state, questions, signal);
          return {
            answers: result.data,
            usage: result.usage ?? {},
            model: result.model ?? this.config.jevModel
          };
        }
      };

      this.adaptive = createAdaptive({
        directory: adaptiveDir,
        scope: {
          userId: 'operator',
          workspaceId: path.basename(this.workspace),
          conversationId: this.activeTemplate
        },
        allowMocks: this.demo,
        config: {
          agents: agentsConfig,
          templates: {
            helper: { enabled: true, role: 'Temporary helper for a bounded subtask', canDelegate: false, allowedTemplates: [] },
            analyst: { enabled: true, role: 'Temporary analyst for data synthesis', canDelegate: false, allowedTemplates: [] },
            verifier: { enabled: true, role: 'Temporary verifier for test assertion', canDelegate: false, allowedTemplates: [] }
          }
        },
        jev: jevAdapter,
        streamText,
        swarm: {
          runResident: async ({ agentId, task, permissions, signal, assertCurrent }) => {
            assertCurrent?.();
            const runtime = this.getRuntime(agentId);
            const abort = () => runtime.stop();
            signal?.addEventListener('abort', abort, { once: true });
            try {
              const result = await this.runSubtask(agentId, task);
              assertCurrent?.();
              return result;
            } finally {
              signal?.removeEventListener('abort', abort);
            }
          },
          runSubagent: async ({ templateId, instanceId, task, permissions, signal, assertCurrent }) => {
            return await this.runTemporarySubagent({ templateId, instanceId, task, permissions, signal, assertCurrent });
          }
        },
        onCorrection: ({ record, preferences }) => {
          for (const rt of this.runtimes.values()) {
            rt.steer(`User preference correction: ${record.raw}`);
          }
        },
        onEvent: event => {
          this.onEvent({ type: 'adaptive.event', data: event });
        }
      });
    } catch {
      this.adaptive = null;
    }
  }

  loadProfiles() {
    const configFile = path.join(this.swarmDir, 'swarm-config.json');
    let loaded = null;
    if (fs.existsSync(configFile)) {
      try {
        loaded = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      } catch {}
    }
    const swarmConfig = loaded ?? createDefaultSwarmConfig();
    this.activeTemplate = swarmConfig.activeTemplate ?? 'default';
    this.primaryAgent = swarmConfig.primaryAgent ?? 'admin';

    for (const [id, prof] of Object.entries(swarmConfig.agents ?? DEFAULT_PROFILES)) {
      try {
        const validated = validateProfile(prof);
        this.profiles.set(id, validated);
        this.sharedWorkspace.initAgent(id, { name: validated.name, role: validated.role });
      } catch (err) {
        console.error(`Skipping invalid profile ${id}:`, err.message);
      }
    }

    if (!this.profiles.has('admin') && this.profiles.size > 0) {
      this.primaryAgent = Array.from(this.profiles.keys())[0];
    }
    this.activeAgentId = this.primaryAgent;
    this.saveConfig();
  }

  saveConfig() {
    try {
      const configFile = path.join(this.swarmDir, 'swarm-config.json');
      const data = {
        activeTemplate: this.activeTemplate,
        primaryAgent: this.primaryAgent,
        agents: Object.fromEntries(this.profiles.entries())
      };
      fs.writeFileSync(configFile, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
      this.sharedWorkspace.save(this.swarmDir);
    } catch {}
  }

  setupEventHandlers() {
    // When a task is assigned, wake the target agent
    this.eventBus.on(SWARM_EVENTS.TASK_ASSIGNED, async event => {
      const targetId = event.to;
      if (this.profiles.has(targetId)) {
        await this.runSubtask(targetId, event.payload.task, {
          taskId: event.payload.taskId,
          fromAgent: event.from
        });
      }
    });

    // When a specialist review or analysis is required
    for (const ev of [
      SWARM_EVENTS.RESEARCH_REQUIRED,
      SWARM_EVENTS.IMPLEMENTATION_REQUIRED,
      SWARM_EVENTS.LEGAL_REVIEW_REQUIRED,
      SWARM_EVENTS.FINANCIAL_ANALYSIS_REQUIRED,
      SWARM_EVENTS.REVIEW_REQUIRED
    ]) {
      this.eventBus.on(ev, async event => {
        const targetId = event.to || EVENT_DEFAULT_ROUTING[ev] || 'admin';
        if (this.profiles.has(targetId)) {
          await this.runSubtask(targetId, event.payload.task || event.payload.message, {
            taskId: event.payload.taskId,
            fromAgent: event.from
          });
        }
      });
    }
  }

  getAgent(id) {
    return this.profiles.get(id) ?? null;
  }

  listAgents() {
    return Array.from(this.profiles.values());
  }

  renameAgent(id, newName) {
    const prof = this.profiles.get(id);
    insist(prof, `Agent not found: ${id}`);
    prof.name = clip(String(newName).trim(), 64);
    this.sharedWorkspace.initAgent(id, { name: prof.name, role: prof.role });
    this.saveConfig();
    return prof;
  }

  updateAgent(id, updates = {}) {
    const prof = this.profiles.get(id);
    insist(prof, `Agent not found: ${id}`);
    if (updates.name) prof.name = clip(String(updates.name).trim(), 64);
    if (updates.role) prof.role = clip(String(updates.role).trim(), 128);
    if (updates.profession) prof.profession = clip(String(updates.profession).trim(), 128);
    if (updates.instructions) prof.instructions = clip(String(updates.instructions).trim(), 8000);
    if ('model' in updates) prof.model = updates.model;
    if (Array.isArray(updates.tools)) prof.tools = updates.tools.map(String);
    if (typeof updates.enabled === 'boolean') prof.enabled = updates.enabled;
    const validated = validateProfile(prof);
    this.profiles.set(id, validated);
    this.sharedWorkspace.initAgent(id, { name: validated.name, role: validated.role });
    this.saveConfig();
    return validated;
  }

  addAgent(profile) {
    const validated = validateProfile(profile);
    insist(!this.profiles.has(validated.id), `Agent ID ${validated.id} already exists`);
    this.profiles.set(validated.id, validated);
    this.sharedWorkspace.initAgent(validated.id, { name: validated.name, role: validated.role });
    this.saveConfig();
    return validated;
  }

  removeAgent(id) {
    insist(this.profiles.has(id), `Agent not found: ${id}`);
    insist(this.profiles.size > 1, 'Cannot remove the only remaining agent in the swarm');
    if (this.primaryAgent === id) {
      const remaining = Array.from(this.profiles.keys()).filter(k => k !== id);
      this.primaryAgent = remaining[0];
      if (this.activeAgentId === id) this.activeAgentId = this.primaryAgent;
    }
    this.profiles.delete(id);
    this.runtimes.delete(id);
    this.sharedWorkspace.agentStatuses.delete(id);
    this.saveConfig();
    return true;
  }

  applyTemplate(templateName) {
    insist(Object.hasOwn(TEMPLATES, templateName), `Unknown template: ${templateName}. Available: ${Object.keys(TEMPLATES).join(', ')}`);
    const template = TEMPLATES[templateName];
    this.profiles.clear();
    this.runtimes.clear();
    this.sharedWorkspace.agentStatuses.clear();
    this.activeTemplate = templateName;
    for (const [id, prof] of Object.entries(template)) {
      const validated = validateProfile(prof);
      this.profiles.set(id, validated);
      this.sharedWorkspace.initAgent(id, { name: validated.name, role: validated.role });
    }
    this.primaryAgent = this.profiles.has('admin') ? 'admin' : (this.profiles.has('ceo') ? 'ceo' : Array.from(this.profiles.keys())[0]);
    this.activeAgentId = this.primaryAgent;
    this.saveConfig();
    return this.listAgents();
  }

  // Get or lazily create an Eutrya runtime for a specific agent
  getRuntime(agentId) {
    const prof = this.profiles.get(agentId);
    insist(prof, `Agent profile ${agentId} not found`);
    insist(prof.enabled, `Agent ${prof.name} is currently disabled`);

    if (this.runtimes.has(agentId)) {
      return this.runtimes.get(agentId);
    }

    const agentSessionDir = path.join(this.swarmDir, 'agents', agentId);
    fs.mkdirSync(agentSessionDir, { recursive: true, mode: 0o700 });

    const targetSessionId = `session-${agentId}`;
    const expectedDir = path.join(workspaceBucket(agentSessionDir, this.workspace), targetSessionId);
    const existing = fs.existsSync(path.join(expectedDir, 'state.json'));

    const store = new Store(agentSessionDir, this.workspace, {
      id: targetSessionId,
      existing,
      redact: this.redact
    });

    const agentConfig = {
      ...this.config,
      mainModel: prof.model || this.config.mainModel
    };

    const cortex = this.demo ? new DemoCortex() : new GatewayCortex(agentConfig);
    const jev = this.demo ? new MockJev() : new GatewayJev(agentConfig);

    const toolbox = new Toolbox({
      workspace: this.workspace,
      store,
      config: agentConfig,
      approve: this.approve,
      redact: this.redact,
      sharedWorkspace: this.sharedWorkspace,
      swarm: this,
      agentId,
      allowedTools: prof.tools
    });

    const runtime = new Eutrya({
      store,
      cortex,
      jev,
      toolbox,
      config: agentConfig,
      onEvent: row => {
        this.onEvent({ ...row, agent: prof.name, agentId });
      },
      redact: this.redact,
      profile: prof,
      sharedWorkspace: this.sharedWorkspace,
      swarm: this,
      adaptive: this.adaptive,
      compactionScope:{profileId:this.activeTemplate,userId:'local-operator',sessionId:store.state.id,agentId}
    });

    this.runtimes.set(agentId, runtime);
    return runtime;
  }

  async setDefaultModel(model) {
    return this.setProviderAndModel(this.config.mainProvider, model);
  }

  async setProviderAndModel(provider, model) {
    insist(['vercel','chatgpt','openrouter','compatible','ollama'].includes(provider), 'Unsupported model provider');
    insist(typeof model === 'string' && model.length > 0 && model.length <= 200 && !/\s/.test(model), 'Provide one provider/model ID');
    insist(!model.startsWith('typesafe-ai/'), 'Jev belongs in the evaluator slot, not the text model slot');
    insist(Array.from(this.runtimes.values()).every(r => !r.busy), 'Wait for running agents to become idle before changing models');

    if (this.adaptive) await this.adaptive.close();
    this.adaptive = null;
    this.config.mainProvider = provider;
    this.config.mainModel = model;

    for (const [agentId, runtime] of this.runtimes.entries()) {
      const profile = this.profiles.get(agentId);
      const selected = profile?.model || model;
      runtime.config.mainProvider = provider;
      runtime.config.mainModel = selected;
      runtime.cortex = this.demo ? new DemoCortex() : new GatewayCortex(runtime.config);
      runtime.state.engine = {
        ...(runtime.state.engine ?? {}),
        mainModel: selected,
        mainProvider: provider
      };
      runtime.state.revision++;
      runtime.store.save();
    }

    this.initAdaptive();
    for (const runtime of this.runtimes.values()) runtime.adaptive = this.adaptive;
    return { provider, model };
  }

  modelStatus() {
    return {
      provider: this.config.mainProvider,
      defaultModel: this.config.mainModel,
      jevModel: this.config.jevModel,
      agents: Array.from(this.profiles.values()).map(profile => ({
        id: profile.id,
        name: profile.name,
        model: profile.model || this.config.mainModel,
        override: Boolean(profile.model)
      }))
    };
  }

  notifyDelegation({ from, to, task, taskId }) {
    this.eventBus.emit({
      type: SWARM_EVENTS.TASK_ASSIGNED,
      from,
      to,
      payload: { task, taskId }
    });
  }

  // Execute a subtask delegated to a specialist
  async runSubtask(agentId, taskText, { taskId = null, fromAgent = 'admin' } = {}) {
    const prof = this.profiles.get(agentId);
    if (!prof || !prof.enabled) return null;

    this.sharedWorkspace.setAgentStatus(agentId, 'WORKING', taskText);
    this.onEvent({
      type: 'swarm.agent_status',
      data: { agent: prof.name, agentId, status: 'WORKING', task: taskText }
    });

    try {
      const runtime = this.getRuntime(agentId);
      runtime.startTask(taskText);
      await runtime.run();

      const answer = runtime.state.answer || runtime.state.summary || 'Task completed';
      if (taskId) {
        this.sharedWorkspace.updateTask(taskId, {
          status: 'completed',
          result: answer
        });
      }

      this.sharedWorkspace.setAgentStatus(agentId, 'IDLE');
      this.sharedWorkspace.save(this.swarmDir);

      // Publish candidate result back to delegator
      await this.eventBus.emit({
        type: SWARM_EVENTS.CANDIDATE_RESULT,
        from: agentId,
        to: fromAgent,
        payload: {
          taskId,
          result: answer,
          status: runtime.state.status
        }
      });

      return answer;
    } catch (err) {
      this.sharedWorkspace.setAgentStatus(agentId, 'BLOCKED', err.message);
      this.sharedWorkspace.addBlocker({ agent: agentId, description: err.message });
      if (taskId) {
        this.sharedWorkspace.updateTask(taskId, {
          status: 'blocked',
          blockers: [err.message]
        });
      }
      this.sharedWorkspace.save(this.swarmDir);

      await this.eventBus.emit({
        type: SWARM_EVENTS.BLOCKED,
        from: agentId,
        to: fromAgent,
        payload: { taskId, error: err.message }
      });
      return null;
    }
  }

  async runTemporarySubagent({ templateId, instanceId, task, permissions = [], signal, assertCurrent }) {
    assertCurrent?.();
    const subagentRoot = path.join(this.swarmDir, 'subagents');
    fs.mkdirSync(subagentRoot, { recursive: true, mode: 0o700 });
    const store = new Store(subagentRoot, this.workspace, { id: instanceId, redact: this.redact });
    const safeTools = new Set(['list','read','search','browser','mkdir','write','edit','run','shell','note','recall','ask','finish']);
    const requested = permissions.filter(x => safeTools.has(x));
    const allowedTools = Array.from(new Set(['note','recall','ask','finish',...requested]));
    const profile = {
      id: instanceId,
      name: `Temporary ${templateId}`,
      role: `Bounded temporary ${templateId}`,
      profession: 'Temporary task specialist',
      instructions: 'Complete only the supplied bounded task. Do not expand permissions or claim unobserved success.',
      model: null,
      tools: allowedTools,
      enabled: true
    };
    const cortex = this.demo ? new DemoCortex() : new GatewayCortex(this.config);
    const jev = this.demo ? new MockJev() : new GatewayJev(this.config);
    const toolbox = new Toolbox({
      workspace: this.workspace,
      store,
      config: this.config,
      approve: this.approve,
      redact: this.redact,
      sharedWorkspace: this.sharedWorkspace,
      agentId: instanceId,
      allowedTools
    });
    const runtime = new Eutrya({
      store,
      cortex,
      jev,
      toolbox,
      config: this.config,
      redact: this.redact,
      profile,
      sharedWorkspace: this.sharedWorkspace,
      adaptive: this.adaptive,
      compactionScope:{profileId:this.activeTemplate,userId:'local-operator',sessionId:store.state.id,agentId:instanceId},
      onEvent: row => this.onEvent({ ...row, agent: profile.name, agentId: instanceId })
    });
    const abort = () => runtime.stop();
    signal?.addEventListener('abort', abort, { once: true });
    try {
      runtime.startTask(task);
      await runtime.run();
      assertCurrent?.();
      return {
        instanceId,
        templateId,
        status: runtime.state.status,
        answer: runtime.state.answer || runtime.state.summary || 'Completed'
      };
    } finally {
      signal?.removeEventListener('abort', abort);
      store.close();
    }
  }

  async selectProfileWithJev(taskText, signal) {
    const activeProfiles = Array.from(this.profiles.values()).filter(p => p.enabled);
    if (activeProfiles.length <= 1) return activeProfiles[0]?.id ?? 'admin';

    const criteria = {};
    for (const p of activeProfiles) {
      criteria[p.id] = `${p.name} (${p.role}): ${p.profession}`;
    }
    const questions = {
      lead_profile: {
        type: 'choice',
        instructions: 'Which security agent profile is best suited to lead this authorized task? Select admin for cross-workstream coordination, auditor for vulnerability discovery and code/security review, operator for controlled reproduction/tool execution/local validation, sentinel for independent verification/triage/scope and severity review, and analyst for threat modeling, architecture research, synthesis, and reporting.',
        criteria
      },
      orchestration_needed: {
        type: 'boolean',
        instructions: 'Does this task require orchestrating multiple specialists across distinct workstreams rather than being handled by a single specialist?',
        criteria: {
          true: 'Requires Admin multi-agent coordination.',
          false: 'Can be handled directly by the selected specialist.'
        }
      }
    };

    const taskState = {
      task: taskText,
      activeProfiles: activeProfiles.map(p => ({ id: p.id, name: p.name, role: p.role, profession: p.profession }))
    };

    const jev = this.demo ? new MockJev() : new GatewayJev(this.config);
    try {
      const result = await jev.evaluate(taskState, questions, signal);
      const data = result.data;
      if (data?.orchestration_needed?.probability >= 0.65 && this.profiles.has('admin')) {
        return 'admin';
      }
      if (data?.lead_profile?.choice && this.profiles.has(data.lead_profile.choice)) {
        return data.lead_profile.choice;
      }
    } catch {
      return this.primaryAgent || 'admin';
    }
    return this.primaryAgent || 'admin';
  }

  // Primary user dispatch entrypoint.
  // Supports direct messages with @AgentName ... or default Admin routing.
  async dispatch(userInput, { onToken = null } = {}) {
    insist(typeof userInput === 'string' && userInput.trim().length > 0, 'User input required');
    const text = userInput.trim();

    let targetAgentId = null;
    let actualTask = text;

    // Check for direct mention: @Auditor ... or @sentinel ...
    const mentionMatch = text.match(/^@([a-zA-Z0-9_-]+)\s+([\s\S]+)$/);
    if (mentionMatch) {
      const requested = mentionMatch[1].toLowerCase();
      // Match by ID or Name
      const found = Array.from(this.profiles.values()).find(
        p => p.id.toLowerCase() === requested || p.name.toLowerCase() === requested
      );
      if (found) {
        targetAgentId = found.id;
        actualTask = mentionMatch[2].trim();
      }
    }

    // If no direct mention, use Jev to decide which profile should lead or handle the task
    if (!targetAgentId) {
      if (this.activeAgentId === this.primaryAgent) {
        // Fast tool-free response lane check before entering full multi-agent planning
        const requiresTools = /(?:write|edit|create\s+file|delete|run|npm|test|bash|shell|exec|search\s+in|list\s+dir|browse|fetch\s+url)/i.test(actualTask);
        const highStakes = /(?:security|vulnerability|exploit|audit|authorization|access control|smart contract|web3|scope|triage|severity|production|credential|secret)/i.test(actualTask);
        const requiresVerification = /(?:verify|independent|checker|triage|reproduce|false positive|duplicate|severity)/i.test(actualTask);
        const flags = {
          requiresTools,
          highStakes,
          requiresVerification,
          forceWork: !this.adaptive
        };

        if (this.adaptive && !flags.forceWork && !flags.requiresTools && !flags.highStakes && !flags.requiresVerification) {
          try {
            const fastResult = await this.adaptive.replies.maybeReply(
              {
                task: actualTask,
                context: `Workspace: ${this.workspace}. Active Swarm: ${Array.from(this.profiles.keys()).join(', ')}`,
                flags
              },
              {
                onToken: token => {
                  if (onToken) onToken(token);
                  else process.stdout.write(token);
                }
              }
            );

            if (fastResult?.handled) {
              if (!onToken) process.stdout.write('\n');
              this.sharedWorkspace.postMessage({ from: 'admin', to: 'user', content: fastResult.text });
              this.sharedWorkspace.save(this.swarmDir);
              return {
                agent: 'Admin',
                agentId: 'admin',
                status: 'ANSWERED',
                answer: fastResult.text,
                fastLane: true,
                verification: fastResult.verification
              };
            }
          } catch (err) {
            // Fall through to full deliberation if fast-lane is declined or errors
          }
        }

        targetAgentId = await this.selectProfileWithJev(actualTask);
      } else {
        targetAgentId = this.activeAgentId;
      }
    }

    const prof = this.profiles.get(targetAgentId);
    insist(prof, `Agent ${targetAgentId} not found in the swarm`);

    this.sharedWorkspace.setAgentStatus(targetAgentId, 'WORKING', actualTask);
    this.sharedWorkspace.postMessage({ from: 'user', to: targetAgentId, content: actualTask });

    try {
      const runtime = this.getRuntime(targetAgentId);
      runtime.startTask(actualTask);
      await runtime.run();

      const answer = runtime.state.answer || runtime.state.summary || 'Completed';
      this.sharedWorkspace.setAgentStatus(targetAgentId, 'IDLE');
      this.sharedWorkspace.postMessage({ from: targetAgentId, to: 'user', content: answer });
      this.sharedWorkspace.save(this.swarmDir);

      return {
        agent: prof.name,
        agentId: targetAgentId,
        status: runtime.state.status,
        answer,
        meter: runtime.state.meter
      };
    } catch (err) {
      this.sharedWorkspace.setAgentStatus(targetAgentId, 'BLOCKED', err.message);
      this.sharedWorkspace.save(this.swarmDir);
      throw err;
    }
  }

  // Switch direct conversation focus
  focusAgent(nameOrId) {
    const q = String(nameOrId).toLowerCase().trim();
    const found = Array.from(this.profiles.values()).find(
      p => p.id.toLowerCase() === q || p.name.toLowerCase() === q
    );
    insist(found, `Agent not found: ${nameOrId}`);
    this.activeAgentId = found.id;
    return found;
  }

  // Visual status matrix of the organization
  statusMatrix() {
    const statuses = this.sharedWorkspace.getAllAgentStatuses();
    const activeTasks = this.sharedWorkspace.listTasks().filter(t => t.status !== 'completed');
    const blockers = this.sharedWorkspace.listBlockers({ unresolvedOnly: true });

    return {
      activeTemplate: this.activeTemplate,
      primaryAgent: this.primaryAgent,
      activeFocus: this.activeAgentId,
      agents: statuses,
      activeTasks,
      blockers
    };
  }

  async close() {
    if (this.adaptive) {
      try { await this.adaptive.close(); } catch {}
    }
    for (const r of this.runtimes.values()) {
      try { r.store.close(); } catch {}
    }
    this.sharedWorkspace.save(this.swarmDir);
  }

  recordOutcome(input) {
    return this.adaptive?.recordOutcome(input);
  }
}
