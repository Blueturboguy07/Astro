/**
 * publik's 429 when a key hits its daily spending cap or the plan budget
 * is spent. The chat and the answer engine showed the raw "429 ..." text
 * with no reset time and no link (Astro 0.2.4 QA, F-050).
 *
 * The local server passes the gateway body on as JSON (chat-error-text.ts
 * on the server); older paths pass only the message text, so the text of
 * the daily cap is matched too.
 */
export const PUBLIK_WALLET_URL = 'https://publikhq.com/wallet'

export interface PublikLimitError {
  title: string
  text: string
  url: string
}

/* The gateway words it per key or per account ("This account has
   reached its daily limit. It applies to all of its keys together"):
   the account text showed raw with a useless Retry (0.0.109 UI run). */
const DAILY_TEXT =
  /this (key|account) has reached its daily (spending )?(cap|limit)/i
const ACCOUNT_TEXT = /this account has reached its daily/i

export function parsePublikLimitError(
  message: string,
  now: Date = new Date(),
): PublikLimitError | null {
  let type: string | undefined
  let resetAt: Date | undefined
  try {
    const parsed = JSON.parse(message) as {
      error?: { type?: string; reset_at?: string }
    }
    type = parsed?.error?.type
    if (parsed?.error?.reset_at) {
      const at = new Date(parsed.error.reset_at)
      if (!Number.isNaN(at.getTime())) resetAt = at
    }
  } catch {}

  if (type === 'week_budget_reached') {
    return {
      title: 'Plan budget used up',
      text: `Your publik plan budget is spent.${resetAt ? ` ${resetText(resetAt, now)}` : ''} Add credit in your wallet to keep going.`,
      url: PUBLIK_WALLET_URL,
    }
  }
  if (type === 'daily_cap_reached' || DAILY_TEXT.test(message)) {
    const who = ACCOUNT_TEXT.test(message)
      ? 'Your publik account (all of its keys together) reached its daily limit.'
      : 'Your publik key reached its daily spending cap.'
    return {
      title: 'Daily limit reached',
      text: `${who} ${resetText(resetAt ?? nextUtcMidnight(now), now, !resetAt)}`,
      url: PUBLIK_WALLET_URL,
    }
  }
  return null
}

export function nextUtcMidnight(now: Date): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  )
}

function resetText(at: Date, now: Date, midnight = false): string {
  const minutes = Math.max(
    1,
    Math.ceil((at.getTime() - now.getTime()) / 60_000),
  )
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  const span = h > 0 ? `${h} h ${m} min` : `${m} min`
  const local = at.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
  })
  return `It resets ${midnight ? 'at midnight UTC' : ''}${midnight ? ', ' : ''}in ${span} (${local} your time).`
}
