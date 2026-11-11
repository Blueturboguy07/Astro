import { storage } from '@wxt-dev/storage'
import {
  onRuntimeMessage,
  RuntimeMessageType,
} from '@/lib/messaging/runtime/runtimeMessages'
import { applyChoice, syncProviders } from './providers'
import {
  ACTIVE_SESSION_ALARM,
  choiceStorage,
  ensureSignedIn,
  type GateAction,
  type GateUI,
  gateStorage,
  selfTest,
  sendEvent,
  startTelemetry,
} from './publik'

/* The gate, run by the background service worker. The worker owns the
 * install key: it alone calls POST /installs, GET /wallet and
 * POST /telemetry. The pages are the gate's UI: the worker writes the screen
 * to session storage (gateStorage), the gate page draws it, and a button
 * press comes back as a runtime message that resolves `show()`.
 *
 * A service worker stops after a few idle seconds and starts again on the
 * next event. So:
 *   - the gate's result for this browser session is in session storage.
 *     A restarted worker with "done" runs no gate again; a new browser
 *     start has empty session storage and runs it;
 *   - the poll writes a heartbeat to storage every 3 s (publik.ts), which
 *     keeps the worker awake while a screen waits for the person;
 *   - a press that reaches a fresh worker is queued and consumed by the
 *     next screen that has that button;
 *   - active_session is a chrome.alarms alarm, not a timer.
 */

let run: Promise<void> | null = null
let pending: { resolve: (action: GateAction) => void } | null = null
let queued: GateAction | null = null
let tabEnsured = false

const ui: GateUI = {
  show: (screen, signal) =>
    new Promise<GateAction>((resolve) => {
      pending = { resolve }
      gateStorage
        .setValue({ status: 'screen', screen, at: Date.now() })
        .catch(() => null)
      void ensureGateTab()
      signal.addEventListener(
        'abort',
        () => {
          if (pending?.resolve === resolve) pending = null
        },
        { once: true },
      )
      if (queued && screen.buttons.some((b) => b.action === queued)) {
        const action = queued
        queued = null
        pending = null
        resolve(action)
      }
    }),
  openUrl: (url) => {
    chrome.tabs.create({ url }).catch(() => null)
  },
}

/* The gate is the first page at browser start: when a screen needs the
   person and no app tab is open, open one. Never re-focus an existing one:
   the sign-in page the person just opened must keep the focus.

   The first start of a fresh profile opens Chrome's own new-tab page before
   the bundled extension is installed, so the new-tab override (app.html) has
   not applied to that tab and it shows the stock page. That tab is navigated
   to the gate, not left beside a second one. */
async function ensureGateTab(): Promise<void> {
  if (tabEnsured) return
  tabEnsured = true
  try {
    const app = chrome.runtime.getURL('app.html')
    const url = `${app}#/home`
    const tabs = await chrome.tabs.query({})
    if (
      tabs.some((t) => t.url?.startsWith(app) || t.pendingUrl?.startsWith(app))
    ) {
      return
    }
    const stockNewTab = tabs.find(
      (t) =>
        t.url?.startsWith('chrome://newtab') ||
        t.pendingUrl?.startsWith('chrome://newtab'),
    )
    if (stockNewTab?.id !== undefined) {
      await chrome.tabs.update(stockNewTab.id, { url, active: true })
      return
    }
    await chrome.tabs.create({ url, active: true })
  } catch {
    /* No tabs API here: the next page the person opens shows the gate. */
  }
}

function press(action: GateAction): void {
  if (pending) {
    const p = pending
    pending = null
    p.resolve(action)
    return
  }
  queued = action
  void runGate()
}

function runGate(): Promise<void> {
  if (run) return run
  run = (async () => {
    const state = await gateStorage.getValue()
    if (state?.status === 'done') {
      await startTelemetry() // the worker restarted inside a signed-in session
      return
    }
    await gateStorage.setValue({ status: 'checking', at: Date.now() })
    const gate = await ensureSignedIn(ui)
    await gateStorage.setValue({ status: 'done', at: Date.now() })
    await applyChoice(gate.choice)
  })()
  run.catch(() => {
    run = null
  })
  return run
}

async function activeSession(): Promise<void> {
  if ((await gateStorage.getValue())?.status === 'done') {
    await sendEvent('active_session')
  }
}

/* The integration before the module kept `local:publik-state`. Its one
   answer worth keeping is "Use my own key"; the rest is replaced by the gate. */
async function migrateOldState(): Promise<void> {
  try {
    const old = await storage.getItem<{ state?: string }>('local:publik-state')
    if (!old) return
    if (old.state === 'declined' && (await choiceStorage.getValue()) === null) {
      await choiceStorage.setValue('own_key')
    }
    await storage.removeItem('local:publik-state')
  } catch {}
}

/** Called once from the background entrypoint. */
export function startPublik(): void {
  onRuntimeMessage(RuntimeMessageType.publikGate, ({ data }) => {
    press(data.action)
  })
  onRuntimeMessage(RuntimeMessageType.publikWake, () => {
    void runGate()
  })
  onRuntimeMessage(RuntimeMessageType.publikSelfTest, async () => ({
    line: await selfTest(),
  }))
  onRuntimeMessage(RuntimeMessageType.publikSync, () => syncProviders())
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ACTIVE_SESSION_ALARM) void activeSession()
  })
  choiceStorage.watch((choice) => {
    void applyChoice(choice)
  })
  void migrateOldState().then(runGate)
}
