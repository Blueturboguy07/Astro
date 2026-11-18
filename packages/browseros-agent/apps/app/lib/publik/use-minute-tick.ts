import { useEffect, useState } from 'react'

/** Re-renders the caller once a minute while `active`, so a "resets in …" countdown moves (Astro 0.2.4 QA, F-089). */
export function useMinuteTick(active: boolean): void {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setTick((n) => n + 1), 60_000)
    return () => clearInterval(timer)
  }, [active])
}
