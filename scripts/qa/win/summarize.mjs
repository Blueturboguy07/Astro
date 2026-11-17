// Collect every results/windows/<ID>/result.json into summary.json and
// summary.md, and append the table to the GitHub job summary.
import fs from 'node:fs'
import path from 'node:path'
import { RESULTS } from './lib/rows.mjs'

const rows = []
for (const d of fs.existsSync(RESULTS) ? fs.readdirSync(RESULTS) : []) {
  const f = path.join(RESULTS, d, 'result.json')
  if (!fs.existsSync(f)) continue
  try {
    rows.push(JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')))
  } catch (e) {
    rows.push({ id: d, title: '(unreadable result.json)', result: 'fail', actual: e.message })
  }
}
const order = (id) => id.replace(/(\d+)/g, (n) => n.padStart(4, '0'))
rows.sort((a, b) => order(a.id).localeCompare(order(b.id)))
const count = (r) => rows.filter((x) => x.result === r).length
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
const md = [
  `# Astro Windows QA, phase 1`,
  '',
  `pass ${count('pass')} · fail ${count('fail')} · blocked ${count('blocked')} · total ${rows.length}`,
  '',
  '| ID | Title | Result | Actual |',
  '|---|---|---|---|',
  ...rows.map((r) => `| ${r.id} | ${esc(r.title)} | ${r.result} | ${esc(r.actual).slice(0, 300)} |`),
  '',
].join('\n')
fs.writeFileSync(path.join(RESULTS, 'summary.json'), JSON.stringify(rows, null, 2))
fs.writeFileSync(path.join(RESULTS, 'summary.md'), md)
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md)
console.log(md)
