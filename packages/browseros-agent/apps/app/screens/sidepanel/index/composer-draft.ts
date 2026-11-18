/* The side panel composer's unsent text, kept outside the component: if
 * anything re-mounts the chat (the gate, a reload of the panel document),
 * the person's half-typed prompt comes back (SIDEPANEL-INPUT-CLEARS).
 * sessionStorage is per side-panel document; the module copy covers a
 * blocked storage. Sending clears it. */

const DRAFT_KEY = 'astro:sidepanel-composer-draft'

type DraftStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

let memoryDraft = ''

function sessionStore(): DraftStore | null {
  try {
    return globalThis.sessionStorage ?? null
  } catch {
    return null
  }
}

export function readComposerDraft(
  store: DraftStore | null = sessionStore(),
): string {
  try {
    return store?.getItem(DRAFT_KEY) ?? memoryDraft
  } catch {
    return memoryDraft
  }
}

export function writeComposerDraft(
  text: string,
  store: DraftStore | null = sessionStore(),
): void {
  memoryDraft = text
  try {
    if (text) store?.setItem(DRAFT_KEY, text)
    else store?.removeItem(DRAFT_KEY)
  } catch {}
}
