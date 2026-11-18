import crypto from 'node:crypto'
import fs from 'node:fs'

/* Bump when the settings below change. A file Astro wrote with an older
   version is written again at the next start (its secret_key kept); a file
   Astro did not write is never touched. */
export const SETTINGS_VERSION = 2
const MARK = '# astro-searxng-settings:'

/* Wikipedia and Wikidata refuse to load without a contact URL (log: "engine
   requires general.contact_url"); it goes into their User-Agent. */
export const CONTACT_URL = 'https://github.com/Blueturboguy07/Astro/issues'

/* Engines that need no API key. With few engines, one upstream that throttles
   this IP (CAPTCHA, HTTP 429) empties every result (F-088: 7 of 8 engines
   suspended on one Mac); more independent engines make a block degrade
   results instead. */
export const KEYLESS_ENGINES = [
  'duckduckgo',
  'brave',
  'startpage',
  'mojeek',
  'qwant',
  'bing',
  'yahoo',
  'presearch',
  'wikipedia',
  'wikidata',
  'wolframalpha',
]

/* `formats: [json]` is the load-bearing line: without it the JSON API that
   search.ts calls returns 403.

   Suspension times: SearXNG's defaults (CAPTCHA 1 h, Cloudflare CAPTCHA
   15 days) are for public instances. On one person's computer an engine
   suspended that long leaves search empty for the rest of the day, so the
   times here are minutes. The request timeout is short so a slow engine
   does not hold the whole answer. */
export function settingsYaml(secret: string): string {
  const engines = KEYLESS_ENGINES.map(
    (name) => `  - name: ${name}\n    disabled: false`,
  ).join('\n')
  return `${MARK} ${SETTINGS_VERSION}
use_default_settings: true

general:
  instance_name: 'browseros'
  contact_url: '${CONTACT_URL}'

search:
  autocomplete: 'google'
  formats:
    - html
    - json
  ban_time_on_fail: 5
  max_ban_time_on_fail: 30
  suspended_times:
    SearxEngineAccessDenied: 120
    SearxEngineCaptcha: 300
    SearxEngineTooManyRequests: 60
    cf_SearxEngineCaptcha: 1800
    cf_SearxEngineAccessDenied: 600
    recaptcha_SearxEngineCaptcha: 1800

server:
  secret_key: '${secret}'
  limiter: false
  public_instance: false

outgoing:
  request_timeout: 5.0
  max_request_timeout: 8.0

engines:
${engines}
`
}

const newSecret = () => crypto.randomBytes(32).toString('hex')

export function writeSettings(file: string): void {
  fs.writeFileSync(file, settingsYaml(newSecret()))
}

/* Returns what it did, for tests and logs. */
export function ensureSettings(file: string): 'written' | 'updated' | 'kept' {
  let old: string
  try {
    old = fs.readFileSync(file, 'utf8')
  } catch {
    writeSettings(file)
    return 'written'
  }
  if (old.startsWith(`${MARK} ${SETTINGS_VERSION}\n`)) return 'kept'
  if (!/instance_name:\s*'browseros'/.test(old)) return 'kept'
  const secret =
    old.match(/secret_key:\s*'([0-9a-f]{32,})'/)?.[1] ?? newSecret()
  fs.writeFileSync(file, settingsYaml(secret))
  return 'updated'
}
