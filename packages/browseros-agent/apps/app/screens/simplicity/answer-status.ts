export type AnswerStatus = 'answering' | 'completed' | 'error' | 'cancelled'

const steps = (n: number) => `${n} ${n === 1 ? 'step' : 'steps'}`

/* A stopped answer said "Completed" over its steps (Astro 0.2.4 QA, F-089). */
export function stepsHeaderLabel(
  status: AnswerStatus,
  isRunning: boolean,
  stepCount: number,
): string {
  if (isRunning) return `Working · ${steps(stepCount)} completed`
  if (status === 'cancelled') return `Stopped · ${steps(stepCount)}`
  if (status === 'error') return `Failed · ${steps(stepCount)}`
  return `Completed · ${steps(stepCount)}`
}

/** A stopped answer that has some text: the text is partial, so mark it. */
export function isPartialStoppedAnswer(
  status: AnswerStatus,
  blocks: { type: string; data?: unknown }[],
): boolean {
  return (
    status === 'cancelled' &&
    blocks.some((b) => b.type === 'text' && String(b.data ?? '').trim()) &&
    !blocks.some((b) => b.type === 'error')
  )
}
