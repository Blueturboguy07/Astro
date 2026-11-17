// Parse a Chrome --log-net-log file into requests and hosts. Tolerates a
// file cut short by a killed browser (events are one JSON object per line).
import fs from 'node:fs'

const normHost = (h) =>
  String(h)
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/\/.*$/, '')
    .replace(/^\[|\](?=:|$)/g, '')
    .replace(/:\d+$/, '')
    .toLowerCase()

export const isLocal = (h) => /^(127\.|localhost$|::1$|0\.0\.0\.0$)/.test(h)

export function parseNetLog(file, { splitAt = Number.POSITIVE_INFINITY } = {}) {
  const txt = fs.readFileSync(file, 'utf8')
  const m = /"events"\s*:\s*\[/.exec(txt)
  if (!m) throw new Error(`no "events" array in ${file} (${txt.length} bytes)`)
  const head = txt.slice(0, m.index).replace(/^\s*\{\s*"constants"\s*:/, '').trim().replace(/,$/, '')
  const constants = JSON.parse(head)
  const typeName = Object.fromEntries(Object.entries(constants.logEventTypes ?? {}).map(([k, v]) => [v, k]))
  const errName = Object.fromEntries(Object.entries(constants.netError ?? {}).map(([k, v]) => [v, k]))
  const tick = Number(constants.timeTickOffset ?? 0)

  const bySrc = new Map()
  const dns = new Map() // host -> { first, errors:Set }
  let events = 0
  for (const raw of txt.slice(m.index + m[0].length).split('\n')) {
    const line = raw.trim().replace(/^,/, '').replace(/,$/, '')
    if (!line.startsWith('{')) continue
    let ev
    try {
      ev = JSON.parse(line)
    } catch {
      continue
    }
    events++
    const t = Number(ev.time) + tick
    const name = typeName[ev.type] ?? String(ev.type)
    const p = ev.params ?? {}
    const sid = ev.source?.id
    let s = bySrc.get(sid)
    if (!s) {
      s = { first: t }
      bySrc.set(sid, s)
    }
    if (typeof p.url === 'string' && !s.url && /^(https?|wss?):\/\//i.test(p.url)) {
      s.url = p.url
      s.first = t
      s.method = p.method
    }
    if (name === 'HTTP_TRANSACTION_READ_RESPONSE_HEADERS' && Array.isArray(p.headers) && p.headers[0]) {
      const code = /^HTTP\/[\d.]+\s+(\d{3})/.exec(p.headers[0])
      if (code) s.status = Number(code[1])
    }
    if (typeof p.net_error === 'number' && p.net_error < 0) s.netError = errName[p.net_error] ?? String(p.net_error)
    if (name.startsWith('HOST_RESOLVER') && typeof p.host === 'string') {
      const h = normHost(p.host)
      if (!dns.has(h)) dns.set(h, { first: t, errors: new Set() })
      s.dnsHost = h
    }
    if (s.dnsHost && typeof p.net_error === 'number' && p.net_error < 0) dns.get(s.dnsHost)?.errors.add(errName[p.net_error] ?? String(p.net_error))
  }

  const requests = []
  for (const s of bySrc.values()) {
    if (!s.url) continue
    let host = ''
    try {
      host = new URL(s.url).hostname.toLowerCase().replace(/^\[|\]$/g, '')
    } catch {
      continue
    }
    requests.push({ url: s.url, host, method: s.method, status: s.status ?? null, netError: s.netError ?? null, t: s.first, phase: s.first <= splitAt ? 'idle' : 'after' })
  }
  requests.sort((a, b) => a.t - b.t)

  const hosts = new Map()
  const touch = (h, t, extra = {}) => {
    if (!h) return
    let x = hosts.get(h)
    if (!x) {
      x = { host: h, first: t, phases: new Set(), statuses: new Set(), errors: new Set(), urls: [], local: isLocal(h), viaDnsOnly: true }
      hosts.set(h, x)
    }
    x.first = Math.min(x.first, t)
    x.phases.add(t <= splitAt ? 'idle' : 'after')
    if (extra.status) x.statuses.add(extra.status)
    if (extra.netError) x.errors.add(extra.netError)
    if (extra.url) {
      x.viaDnsOnly = false
      if (x.urls.length < 8 && !x.urls.includes(extra.url)) x.urls.push(extra.url)
    }
  }
  for (const r of requests) touch(r.host, r.t, { status: r.status, netError: r.netError, url: r.url })
  for (const [h, d] of dns) {
    touch(h, d.first)
    for (const e of d.errors) hosts.get(h).errors.add(e)
  }
  const hostList = [...hosts.values()]
    .map((x) => ({ ...x, phases: [...x.phases], statuses: [...x.statuses], errors: [...x.errors] }))
    .sort((a, b) => a.first - b.first)
  return { events, requests, hosts: hostList, timeTickOffset: tick }
}
