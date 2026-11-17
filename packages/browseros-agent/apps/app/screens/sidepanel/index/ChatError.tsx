import { AlertCircle, RefreshCw } from 'lucide-react'
import type { FC } from 'react'
import { Button } from '@/components/ui/button'
import { parsePublikLimitError } from '@/lib/publik/limit-error'
import { publikLink } from '@/lib/publik/publik'

export interface ChatErrorProps {
  error: Error
  onRetry?: () => void
  providerType?: string
}

const PUBLIK_PLANS_URL = 'https://publikhq.com/wallet/add'
const OWN_KEY_SETTINGS_URL = '/app.html#/settings/ai'

const STREAM_DROPPED =
  /\bnetwork ?error\b|ERR_(CONNECTION_(REFUSED|RESET|CLOSED)|EMPTY_RESPONSE|NETWORK_CHANGED)|\bLoad failed\b/i

/**
 * publik's 402 as the local server passes it on (chat-error-text.ts): the
 * gateway body with its message and one top-up link (Astro 0.2.4 QA, F-021).
 * Only a publikhq.com link is kept.
 */

export function parsePublikMoneyError(
  message: string,
): { text: string; url: string } | null {
  try {
    const parsed = JSON.parse(message) as {
      error?: { type?: string; message?: string; top_up_url?: string }
    }
    const e = parsed?.error
    if (!e || (e.type !== 'insufficient_credit' && !e.top_up_url)) return null
    return {
      text: e.message ?? 'Your publik balance is too low for this request.',
      url: publikLink(e.top_up_url) ?? PUBLIK_PLANS_URL,
    }
  } catch {
    return null
  }
}

function parseErrorMessage(
  message: string,
  providerType?: string,
): {
  text: string
  url?: string
  isRateLimit?: boolean
  isCreditsExhausted?: boolean
  isConnectionError?: boolean
  isPublikMoney?: boolean
  isPublikLimit?: boolean
  isModelIdle?: boolean
  title?: string
} {
  const isBrowserosProvider = providerType === 'browseros'

  const money = parsePublikMoneyError(message)
  if (money) return { ...money, isPublikMoney: true }

  const limit = parsePublikLimitError(message)
  if (limit) return { ...limit, isPublikLimit: true }

  if (message.includes('The AI model stopped answering')) {
    return { text: message, isModelIdle: true }
  }

  // All chat requests go through the local Astro agent server, so any
  // fetch failure is always a local connection issue.
  if (message.includes('Failed to fetch') || message.includes('fetch failed')) {
    return {
      /* No upstream docs link: it pointed at docs.browseros.com and the
         text promised instructions that were not there (F-046). */
      text: 'Astro could not reach its local server. It restarts by itself: try again in a few seconds. If this keeps happening, quit and reopen Astro.',
      isConnectionError: true,
    }
  }

  /* The server died while the answer streamed: Chrome ends the body with
     "network error" (Astro 0.2.4 QA). */
  if (STREAM_DROPPED.test(message)) {
    return {
      text: 'Astro lost the connection to its local server during the answer. It restarts by itself: try again in a few seconds. If this keeps happening, quit and reopen Astro.',
      isConnectionError: true,
    }
  }

  // Detect credit exhaustion from gateway (Astro provider only)
  if (
    isBrowserosProvider &&
    (message.includes('CREDITS_EXHAUSTED') ||
      message.includes('Credits exhausted') ||
      message.includes('Daily credits exhausted'))
  ) {
    return {
      text: 'Daily credits exhausted. Credits reset at midnight UTC.',
      url: '/app.html#/settings/usage',
      isRateLimit: true,
      isCreditsExhausted: true,
    }
  }

  // Detect Astro rate limit (Astro provider only)
  if (
    isBrowserosProvider &&
    message.includes('Astro LLM daily limit reached')
  ) {
    /* Upstream linked a BrowserOS Google Form here (F-079): the way out is
       an own key in Astro's settings. */
    return {
      text: 'The built-in model reached its daily limit. Add your own API key in Settings for unlimited use.',
      url: OWN_KEY_SETTINGS_URL,
      isRateLimit: true,
    }
  }

  let text = message
  try {
    const parsed = JSON.parse(message)
    if (parsed?.error?.message) text = parsed.error.message
  } catch {}

  // Extract URL if present
  const urlMatch = text.match(/https?:\/\/[^\s]+/)
  const url = urlMatch?.[0]
  if (url) {
    text = text.replace(url, '').replace(/\s+/g, ' ').trim()
  }

  return { text: text || 'An unexpected error occurred', url }
}

export const ChatError: FC<ChatErrorProps> = ({
  error,
  onRetry,
  providerType,
}) => {
  const {
    text,
    url,
    isRateLimit,
    isCreditsExhausted,
    isConnectionError,
    isPublikMoney,
    isPublikLimit,
    isModelIdle,
    title,
  } = parseErrorMessage(error.message, providerType)

  const getTitle = () => {
    if (title) return title
    if (isPublikMoney) return 'Not enough publik balance'
    if (isModelIdle) return 'No answer from the model'
    if (isRateLimit) return 'Daily limit reached'
    if (isConnectionError) return 'Connection failed'
    return 'Something went wrong'
  }
  const canRetry = !!onRetry && !isRateLimit && !isPublikMoney && !isPublikLimit

  return (
    <div className="mx-4 flex flex-col items-center justify-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <AlertCircle className="h-5 w-5" />
        <span className="font-medium text-sm">{getTitle()}</span>
      </div>
      <p className="text-center text-destructive text-xs">{text}</p>
      {isPublikLimit && url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-[#24A0ED] px-3 py-1.5 font-medium text-white text-xs transition-all hover:bg-[#1e8fd1]"
        >
          Open wallet
        </a>
      )}
      {isPublikMoney && url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-[#24A0ED] px-3 py-1.5 font-medium text-white text-xs transition-all hover:bg-[#1e8fd1]"
        >
          Get a plan
        </a>
      )}
      {isCreditsExhausted && url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground text-xs underline hover:text-foreground"
        >
          View Usage & Billing
        </a>
      )}
      {isRateLimit && !isCreditsExhausted && url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-muted-foreground text-xs underline hover:text-foreground"
        >
          Add your own API key
        </a>
      )}
      {canRetry && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRetry}
          className="mt-1 gap-2"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Try again
        </Button>
      )}
    </div>
  )
}
