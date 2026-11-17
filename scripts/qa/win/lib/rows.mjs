// Result rows for the Windows QA harness.
//
// Every row writes <QA_RESULTS_DIR>/<ID>/result.json:
//   { id, title, expected, actual, result: pass|fail|blocked, evidence, notes, ... }
// plus whatever evidence files the row saves next to it. A row never throws
// out of runRow(): an exception becomes a "fail" (or "blocked" for a Blocked
// error), so one broken row cannot abort the job.
import fs from 'node:fs'
import path from 'node:path'

export const RESULTS = path.resolve(
  process.env.QA_RESULTS_DIR || path.join(process.cwd(), 'results', 'windows'),
)

/** Throw this when a row cannot run (a prerequisite is missing), not when the product fails. */
export class Blocked extends Error {}

export function rowDir(id) {
  const d = path.join(RESULTS, id)
  fs.mkdirSync(d, { recursive: true })
  return d
}

export function writeRow(r) {
  const d = rowDir(r.id)
  const out = {
    id: r.id,
    title: r.title,
    expected: r.expected,
    actual: r.actual ?? '',
    result: r.result,
    evidence: r.evidence ?? [],
    notes: r.notes ?? '',
    platform: 'windows',
    finished_at: new Date().toISOString(),
    ...(r.details ? { details: r.details } : {}),
  }
  fs.writeFileSync(path.join(d, 'result.json'), JSON.stringify(out, null, 2))
  const tag = `[${String(r.result).toUpperCase()}]`
  console.log(`${tag} ${r.id} ${r.title} :: ${String(out.actual).slice(0, 400)}`)
  return out
}

const timeout = (ms, id) =>
  new Promise((_, rej) =>
    setTimeout(() => rej(new Error(`row ${id} timed out after ${ms} ms`)), ms),
  )

/**
 * Run one row. `fn(ctx)` returns { result, actual, notes?, details? }.
 * ctx.file(name) -> absolute path in the row folder (and records it as evidence).
 * ctx.note(text)  -> appends to notes.
 */
export async function runRow(def, fn) {
  const dir = rowDir(def.id)
  const evidence = []
  const notes = []
  const ctx = {
    id: def.id,
    dir,
    file(name) {
      if (!evidence.includes(name)) evidence.push(name)
      return path.join(dir, name)
    },
    note(t) {
      if (t) notes.push(String(t))
    },
    writeJson(name, obj) {
      fs.writeFileSync(ctx.file(name), JSON.stringify(obj, null, 2))
    },
    writeText(name, text) {
      fs.writeFileSync(ctx.file(name), String(text ?? ''))
    },
  }
  let res
  try {
    res = await Promise.race([fn(ctx), timeout(def.timeoutMs ?? 240_000, def.id)])
    if (!res || !['pass', 'fail', 'blocked'].includes(res.result)) {
      throw new Error(`row returned no valid result: ${JSON.stringify(res)}`)
    }
  } catch (e) {
    res = {
      result: e instanceof Blocked ? 'blocked' : 'fail',
      actual: `${e instanceof Blocked ? 'blocked' : 'error'}: ${e?.message ?? e}`,
    }
    if (!(e instanceof Blocked) && e?.stack) ctx.note(e.stack.split('\n').slice(0, 4).join(' / '))
  }
  // Keep only evidence files that exist.
  const ev = evidence.filter((n) => fs.existsSync(path.join(dir, n)))
  return writeRow({
    ...def,
    ...res,
    evidence: ev,
    notes: [...notes, res.notes].filter(Boolean).join(' | '),
  })
}

/** A row that cannot run because an earlier step failed. */
export function blockedRow(def, reason) {
  return writeRow({ ...def, result: 'blocked', actual: `blocked: ${reason}`, evidence: [] })
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export async function waitFor(fn, { timeoutMs = 30_000, intervalMs = 1000, what = 'condition' } = {}) {
  const end = Date.now() + timeoutMs
  let last
  while (Date.now() < end) {
    try {
      const v = await fn()
      if (v) return v
    } catch (e) {
      last = e
    }
    await sleep(intervalMs)
  }
  throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}${last ? ` (last error: ${last.message})` : ''}`)
}

/** Matches the upstream name in any spelling a user could see. */
export const BRAND_RE = /browser\s?os/gi

/** Each "BrowserOS" hit with 40 chars of context on each side. */
export function brandHits(text, max = 50) {
  const hits = []
  const s = String(text ?? '')
  for (const m of s.matchAll(BRAND_RE)) {
    const a = Math.max(0, m.index - 40)
    const b = Math.min(s.length, m.index + m[0].length + 40)
    hits.push(s.slice(a, b).replace(/\s+/g, ' '))
    if (hits.length >= max) break
  }
  return hits
}
