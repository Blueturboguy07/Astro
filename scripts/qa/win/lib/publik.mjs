// The agent extension's storage, reached through its MV3 service worker.
//
// Later (signed-in) phases use injectPublikCredential() to put a publik
// credential into chrome.storage.local BEFORE the gate runs: inject, quit,
// start the same profile again; the gate then reads the credential
// (lib/publik/publik.ts readCredential -> GET /wallet) instead of
// provisioning a new install. Never log the value.
import { evalInTarget, listTargets } from './cdp.mjs'
import { APP_URL, EXT_ORIGIN } from './astro.mjs'
import { waitFor } from './rows.mjs'

async function findWorker(cdp) {
  const t = await listTargets(cdp)
  return t.find((x) => x.type === 'service_worker' && x.url.startsWith(EXT_ORIGIN)) ?? null
}

/** The agent's service-worker target. Opens an app page to wake a lazy worker. */
export async function extensionWorker(session, { timeoutMs = 30_000 } = {}) {
  let sw = await findWorker(session.cdp)
  if (sw) return sw
  const page = await session.context.newPage()
  try {
    await page.goto(`${APP_URL}#/home`, { timeout: 30_000 }).catch(() => null)
    sw = await waitFor(() => findWorker(session.cdp), { timeoutMs, what: 'agent service worker target' })
  } finally {
    await page.close().catch(() => null)
  }
  return sw
}

export async function extStorageGet(session, keys) {
  const sw = await extensionWorker(session)
  return evalInTarget(sw.webSocketDebuggerUrl, `chrome.storage.local.get(${JSON.stringify(keys)})`)
}

export async function extStorageSet(session, items) {
  const sw = await extensionWorker(session)
  return evalInTarget(sw.webSocketDebuggerUrl, `chrome.storage.local.set(${JSON.stringify(items)}).then(() => true)`)
}

export async function extStorageRemove(session, keys) {
  const sw = await extensionWorker(session)
  return evalInTarget(sw.webSocketDebuggerUrl, `chrome.storage.local.remove(${JSON.stringify(keys)}).then(() => true)`)
}

/**
 * Write a publik credential (the JSON of lib/publik/publik.ts PublikCredential:
 * { key, base_url, install_id, claim_url }) and, optionally, the plan choice
 * ('publik' | 'own_key'). WXT's "local:publik-credential" is the
 * chrome.storage.local key "publik-credential". Restart the profile afterwards.
 */
export async function injectPublikCredential(session, credential, choice = null) {
  const items = { 'publik-credential': credential }
  if (choice) items['publik-choice'] = choice
  await extStorageSet(session, items)
  const back = await extStorageGet(session, ['publik-credential'])
  return Boolean(back?.['publik-credential']?.key)
}
