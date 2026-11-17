// Minimal raw CDP client (Node 22 global WebSocket). Used where Playwright
// does not reach: the extension service worker, incognito targets, and
// browser-level commands. Playwright stays the tool for page work.

export async function listTargets(cdpPort) {
  const r = await fetch(`http://127.0.0.1:${cdpPort}/json/list`, { signal: AbortSignal.timeout(5000) })
  return r.json()
}

export async function browserWsUrl(cdpPort) {
  const r = await fetch(`http://127.0.0.1:${cdpPort}/json/version`, { signal: AbortSignal.timeout(5000) })
  const j = await r.json()
  return { ws: j.webSocketDebuggerUrl, version: j }
}

export async function cdpConnect(wsUrl, { timeoutMs = 10_000 } = {}) {
  const ws = new WebSocket(wsUrl)
  await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`CDP websocket open timed out: ${wsUrl}`)), timeoutMs)
    ws.addEventListener('open', () => {
      clearTimeout(t)
      resolve()
    })
    ws.addEventListener('error', (e) => {
      clearTimeout(t)
      reject(new Error(`CDP websocket error: ${e?.message ?? 'unknown'}`))
    })
  })
  let seq = 0
  const pending = new Map()
  const listeners = new Set()
  ws.addEventListener('message', (ev) => {
    let m
    try {
      m = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'))
    } catch {
      return
    }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id)
      pending.delete(m.id)
      if (m.error) p.reject(new Error(`${p.method}: ${m.error.message}`))
      else p.resolve(m.result)
    } else if (m.method) {
      for (const l of listeners) l(m)
    }
  })
  return {
    send(method, params = {}, sessionId, ms = 30_000) {
      const id = ++seq
      const msg = { id, method, params }
      if (sessionId) msg.sessionId = sessionId
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          pending.delete(id)
          reject(new Error(`${method} timed out after ${ms} ms`))
        }, ms)
        pending.set(id, {
          method,
          resolve: (v) => {
            clearTimeout(t)
            resolve(v)
          },
          reject: (e) => {
            clearTimeout(t)
            reject(e)
          },
        })
        ws.send(JSON.stringify(msg))
      })
    },
    on(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
    close() {
      try {
        ws.close()
      } catch {}
    },
  }
}

/** Evaluate an async expression in a target (page or service worker) and return its value. */
export async function evalInTarget(wsUrl, expression, { timeoutMs = 30_000 } = {}) {
  const c = await cdpConnect(wsUrl)
  try {
    const r = await c.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, undefined, timeoutMs)
    if (r.exceptionDetails) {
      throw new Error(`evaluate threw: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`)
    }
    return r.result?.value
  } finally {
    c.close()
  }
}

/** PNG screenshot of one target through its own websocket. */
export async function screenshotTarget(wsUrl) {
  const c = await cdpConnect(wsUrl)
  try {
    const r = await c.send('Page.captureScreenshot', { format: 'png' }, undefined, 30_000)
    return Buffer.from(r.data, 'base64')
  } finally {
    c.close()
  }
}
