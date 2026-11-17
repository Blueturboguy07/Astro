import { describe, expect, it } from 'bun:test'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/* Astro 0.2.4 QA, F-079: no BrowserOS docs, survey or product link may ship
   in the extension. A host below may appear only where ALLOWED_IN_SOURCE /
   ALLOWED_IN_BUILD names it, with the reason. */

const APP_ROOT = join(import.meta.dir, '../..')
const BUILT = join(APP_ROOT, 'dist/chrome-mv3')

const UPSTREAM_HOST =
  /(?:[a-z0-9*-]+\.)*browseros\.(?:com|ai)|jtbd-agent[a-z0-9.-]*|(?:dub\.sh|git\.new|discord\.gg)\/[A-Za-z0-9_-]+/gi

const ALLOWED_IN_SOURCE: Record<string, { hosts: string[]; reason: string }> = {
  'lib/browseros-api-url.ts': {
    hosts: ['api.browseros.com'],
    reason:
      'default account API; used only when a build names one (Astro names none, F-011)',
  },
  'lib/voice/transcribe-audio.ts': {
    hosts: ['llm.browseros.com'],
    reason: 'voice transcription service; decision pending (F-011 d)',
  },
  'lib/constants/productWebHost.ts': {
    hosts: ['browseros.com'],
    reason: 'manifest web_accessible_resources for the legacy agent bridge',
  },
}

const ALLOWED_IN_BUILD: Record<string, string> = {
  'api.browseros.com':
    'account API default, built-in provider placeholder, manifest externally_connectable and the auth content script match',
  '*.api.browseros.com': 'manifest externally_connectable',
  'browseros.com': 'manifest web_accessible_resources (legacy agent bridge)',
  '*.browseros.com': 'manifest web_accessible_resources (legacy agent bridge)',
  'llm.browseros.com': 'voice transcription (F-011 d)',
}

const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  '.output',
  '.wxt',
  'generated',
  '__tests__',
])
const SOURCE_EXT = /\.(ts|tsx|js|mjs|html|css|json)$/
const BUILD_EXT = /\.(js|mjs|html|css|json)$/

function walk(dir: string, ext: RegExp, skip: Set<string>): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (!skip.has(name)) out.push(...walk(path, ext, skip))
    } else if (ext.test(name) && !/\.(test|spec)\.[jt]sx?$/.test(name)) {
      out.push(path)
    }
  }
  return out
}

/** Hosts inside string literals only: comments may name upstream. */
export function hostsInLiterals(text: string): string[] {
  const hosts: string[] = []
  const literal = /'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g
  for (const lit of text.match(literal) ?? []) {
    for (const host of lit.match(UPSTREAM_HOST) ?? []) {
      hosts.push(host.toLowerCase())
    }
  }
  return hosts
}

describe('upstream hosts in the extension (F-079)', () => {
  it('finds hosts in string literals but not in comments', () => {
    expect(
      hostsInLiterals(
        '// docs.browseros.com\nconst a = \'https://docs.browseros.com/x\'\nconst b = "https://jtbd-agent.fly.dev"\nconst c = `https://dub.sh/browseros-usage-limit`',
      ),
    ).toEqual([
      'docs.browseros.com',
      'jtbd-agent.fly.dev',
      'dub.sh/browseros-usage-limit',
    ])
  })

  it('source: only allow-listed files name an upstream host', () => {
    const found: string[] = []
    for (const file of walk(APP_ROOT, SOURCE_EXT, SKIP_DIRS)) {
      const rel = relative(APP_ROOT, file)
      if (rel === 'package.json' || rel.startsWith('dist')) continue
      const allowed = ALLOWED_IN_SOURCE[rel]?.hosts ?? []
      for (const host of hostsInLiterals(readFileSync(file, 'utf-8'))) {
        if (!allowed.includes(host)) found.push(`${rel}: ${host}`)
      }
    }
    expect(found).toEqual([])
  })

  /* The built extension, when it is there (always after build:agent).
     ASTRO_REQUIRE_BUILT_SCAN=1 makes a missing build a failure. */
  it('build: only allow-listed hosts in dist/chrome-mv3', () => {
    if (!existsSync(BUILT)) {
      expect(Bun.env.ASTRO_REQUIRE_BUILT_SCAN).not.toBe('1')
      return
    }
    const found = new Set<string>()
    for (const file of walk(BUILT, BUILD_EXT, new Set())) {
      const text = readFileSync(file, 'utf-8')
      for (const host of text.match(UPSTREAM_HOST) ?? []) {
        const h = host.toLowerCase()
        if (!(h in ALLOWED_IN_BUILD)) {
          found.add(`${relative(BUILT, file)}: ${h}`)
        }
      }
    }
    expect([...found]).toEqual([])
  })
})
