/** The side panel's full-screen spinner is for the first load only. Once the chat has shown, a loading flag from a background refresh (provider list, agents poll, server URL) must never unmount the composer: the person's typed text lives in it (SIDEPANEL-INPUT-CLEARS). */
export function showChatLayoutSpinner(
  isLoading: boolean,
  chatShown: boolean,
): boolean {
  return isLoading && !chatShown
}
