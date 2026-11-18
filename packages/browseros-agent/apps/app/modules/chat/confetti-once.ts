/** What the glow content script answers (it fires the confetti only on the tab that glowed for this conversation). */
export interface GlowReply {
  success?: boolean
  confetti?: boolean
}

/**
 * Stops the glow on every tab and asks for the one-time confetti until a tab
 * really shows it. Returns true when a tab showed it. A task that ends on an
 * extension page or chrome:// page has no content script there, so the
 * first-run flag must stay unset (Astro 0.2.4 QA, INV-PANEL-21).
 */
export async function stopGlowOnTabs(
  tabIds: number[],
  alreadyShown: boolean,
  send: (
    tabId: number,
    showConfetti: boolean,
  ) => Promise<GlowReply | undefined>,
): Promise<boolean> {
  let shown = false
  for (const tabId of tabIds) {
    const ask = !alreadyShown && !shown
    const reply = await send(tabId, ask).catch(() => undefined)
    if (ask && reply && reply.confetti === true) shown = true
  }
  return shown
}
