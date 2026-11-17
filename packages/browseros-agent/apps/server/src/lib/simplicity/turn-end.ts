/* The stream's last event. It carries how the turn ended: a turn cancelled
   by a reload or Stop must not show as completed on the page that reconnects
   to it (Astro 0.2.4 QA, F-059). */
export type TurnEndStatus = 'completed' | 'cancelled'

export function turnEndStatus(aborted: boolean | undefined): {
  status: TurnEndStatus
} {
  return { status: aborted ? 'cancelled' : 'completed' }
}

export function messageEndEvent(endData: unknown): {
  type: 'messageEnd'
  status: TurnEndStatus
} {
  const status = (endData as { status?: unknown } | null | undefined)?.status
  return {
    type: 'messageEnd',
    status: status === 'cancelled' ? 'cancelled' : 'completed',
  }
}
