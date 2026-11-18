/* After Delete in the thread header. Only the hash changed to #/home, and
   useChat keeps the current thread when the route has no chat id (F-056),
   so the deleted thread stayed on screen (Astro 0.2.4 QA, INV-ENGINE-33).
   The thread is cleared first, then the route goes home. Hash route: a
   bare '/' would leave app.html for a nonexistent extension path. */
export const leaveDeletedChat = (
  clearThread: (() => void) | undefined,
  setHash: (hash: string) => void,
): void => {
  clearThread?.()
  setHash('#/home')
}
