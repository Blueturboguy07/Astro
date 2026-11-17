/**
 * The 402 banner (moneyStorage) was cleared only by its dismiss button, so it
 * stayed above every new answer after the balance was fine again (Astro 0.2.4
 * QA). An answer that a model actually wrote proves the balance covered it.
 */
export function answerWasPaid(
  blocks: readonly { type: string; data?: unknown }[],
): boolean {
  const council = blocks.find((b) => b.type === 'council')
  if (council) {
    const members = (council.data as { members?: { status?: string }[] })
      ?.members
    return members?.some((m) => m.status === 'done') ?? false
  }
  return blocks.some(
    (b) => b.type === 'text' && typeof b.data === 'string' && !!b.data.trim(),
  )
}
