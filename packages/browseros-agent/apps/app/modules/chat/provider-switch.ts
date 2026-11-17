type TargetRef = { kind: string; id: string }

/**
 * Picking another model in a chat that has messages starts a new chat (the
 * server keeps one session per model). It happened without a word, so the
 * chat seemed to vanish (Astro 0.2.4 QA, F-041); the side panel now says
 * so in a toast.
 */
export function switchStartsNewChat(
  previous: TargetRef | null | undefined,
  next: TargetRef,
  messageCount: number,
): boolean {
  return (
    !!previous &&
    (previous.kind !== next.kind || previous.id !== next.id) &&
    messageCount > 0
  )
}

export function newChatNotice(providerName: string): string {
  return `New chat with ${providerName}. Your earlier chat is in History.`
}
