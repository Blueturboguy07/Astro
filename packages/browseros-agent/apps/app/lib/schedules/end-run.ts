/**
 * A cancelled or failed scheduled run only aborted its request; the server
 * kept the session and the run's tab stayed open (Astro 0.2.4 QA, F-089).
 * DELETE /chat/:id ends the session, which closes the run's hidden window
 * and tab (chat-service deleteSession). Best effort: never throws.
 */
export async function endRunOnServer(
  serverUrl: string,
  conversationId: string,
  doFetch: typeof fetch = fetch,
): Promise<void> {
  try {
    await doFetch(`${serverUrl}/chat/${encodeURIComponent(conversationId)}`, {
      method: 'DELETE',
    })
  } catch {}
}
