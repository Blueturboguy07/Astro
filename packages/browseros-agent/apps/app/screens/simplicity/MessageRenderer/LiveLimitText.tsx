import { type FC, useEffect, useState } from 'react'
import { parsePublikErrorCard } from '@/lib/publik/limit-error'

/** The card text for a publik limit error at `now` ("It resets in 2 h 5 min"). */
export function limitTextAt(message: string, now: Date): string {
  return parsePublikErrorCard(message, now)?.text ?? message
}

/* The countdown was computed once and stayed "in 3 h 12 min" while the
   card was open (Astro 0.2.4 QA, F-089): read the clock every minute. */
export const LiveLimitText: FC<{ message: string }> = ({ message }) => {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(timer)
  }, [])
  return <>{limitTextAt(message, now)}</>
}
