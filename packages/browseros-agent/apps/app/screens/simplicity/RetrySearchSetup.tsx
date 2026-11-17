import { useState } from 'react'
import { apiFetch } from '@/lib/simplicity/api-fetch'

/**
 * Under a failed web-search setup. Astro never retries the setup by itself
 * (each attempt on a Mac that blocks the downloaded Python showed the
 * person one more system dialog, F-002); this starts one new attempt.
 */
const RetrySearchSetup = () => {
  const [state, setState] = useState<'idle' | 'sent' | 'failed'>('idle')

  const retry = async () => {
    try {
      const res = await apiFetch('/api/search-setup/retry', { method: 'POST' })
      setState(res.ok ? 'sent' : 'failed')
    } catch {
      setState('failed')
    }
  }

  if (state === 'sent') {
    return (
      <span className="text-black/60 text-xs dark:text-white/60">
        Setting up web search again. Ask again in a few minutes.
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={retry}
      className="rounded-md border border-amber-500/40 px-2 py-0.5 text-amber-700 text-xs hover:bg-amber-500/10 dark:text-amber-400"
    >
      {state === 'failed' ? 'Retry failed. Try again' : 'Retry'}
    </button>
  )
}

export default RetrySearchSetup
