(() => {
  'use strict'

  class BackendClient {
    constructor() {
      this.baseUrl = null
      this.info = null
      this.connected = false
      this.lastError = null
      this.connecting = null
    }

    async invoke(command, args = {}) {
      const invoke = window.__TAURI__?.core?.invoke
      if (!invoke) return null
      return invoke(command, args)
    }

    async connect() {
      if (this.connecting) return this.connecting
      this.connecting = (async () => {
        try {
          const info = await this.invoke('bridge_info')
          if (info?.url) {
            this.info = info
            this.baseUrl = info.url
          } else {
            const q = new URLSearchParams(location.search).get('bridge')
            this.baseUrl = q || localStorage.getItem('eutrya.bridge') || 'http://127.0.0.1:32117'
          }
          for (let i = 0; i < 30; i++) {
            try {
              const health = await fetch(`${this.baseUrl}/health`, { cache: 'no-store' }).then(r => r.json())
              this.connected = Boolean(health?.ok)
              this.lastError = null
              return health
            } catch (err) {
              this.lastError = err.message
              await new Promise(r => setTimeout(r, 180))
            }
          }
        } finally {
          this.connecting = null
        }
        this.connected = false
        return null
      })()
      return this.connecting
    }

    async request(path, { method = 'GET', body = null } = {}) {
      if (!this.baseUrl) await this.connect()
      if (!this.baseUrl) throw new Error('Eutrya runtime bridge is unavailable')
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        cache: 'no-store',
        headers: {
          'X-Eutrya-Desktop': '1',
          ...(body !== null ? { 'Content-Type': 'application/json' } : {})
        },
        ...(body !== null ? { body: JSON.stringify(body) } : {})
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) {
        const error = new Error(payload?.error || `Runtime returned HTTP ${response.status}`)
        error.payload = payload
        throw error
      }
      this.connected = true
      this.lastError = null
      return payload
    }

    state() { return this.request('/api/state') }
    chat(text, agentId = null) { return this.request('/api/chat', { method: 'POST', body: { text, agentId } }) }
    reload() { return this.request('/api/reload', { method: 'POST', body: {} }) }
    stop() { return this.request('/api/stop', { method: 'POST', body: {} }) }
    focus(agentId) { return this.request('/api/focus', { method: 'POST', body: { agentId } }) }
    template(template) { return this.request('/api/template', { method: 'POST', body: { template } }) }
    updateAgent(id, patch) { return this.request(`/api/agents/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }) }
    addAgent(profile) { return this.request('/api/agents', { method: 'POST', body: profile }) }
    removeAgent(id) { return this.request(`/api/agents/${encodeURIComponent(id)}`, { method: 'DELETE' }) }
    remember(text) { return this.request('/api/memory', { method: 'POST', body: { text } }) }
    forget(id) { return this.request(`/api/memory/${encodeURIComponent(id)}`, { method: 'DELETE' }) }
    approve(id, approved) { return this.request(`/api/approvals/${encodeURIComponent(id)}`, { method: 'POST', body: { approved } }) }
    settings(patch) { return this.request('/api/settings', { method: 'PATCH', body: patch }) }
    credential(name, value) { return this.request('/api/credentials', { method: 'POST', body: { name, value } }) }

    async setWorkspace(workspace) {
      const info = await this.invoke('set_workspace', { workspace })
      if (!info?.url) throw new Error(info?.error || 'Could not switch workspace')
      this.info = info
      this.baseUrl = info.url
      this.connected = false
      await this.connect()
      return info
    }

    async restart() {
      const info = await this.invoke('restart_bridge')
      if (info?.url) {
        this.info = info
        this.baseUrl = info.url
        this.connected = false
        await this.connect()
      }
      return info
    }
  }

  window.EutryaBackend = new BackendClient()
})()
