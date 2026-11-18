/** The side panel's chat view (entrypoints/sidepanel/App.tsx index route). */
export const PANEL_CHAT_PATH = '/'

/* From the History view, "New conversation" only reset the conversation and
   left History on screen with no input box (Astro 0.2.4 QA, F-090). */
export function startNewConversation(
  reset: () => void,
  navigate: (path: string) => void,
): void {
  reset()
  navigate(PANEL_CHAT_PATH)
}
