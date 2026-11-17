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

export const PUBLIK_PLANS_URL = 'https://publikhq.com/wallet/add'

/** One publik error as a card: what happened, when it clears, one link. */
export interface PublikErrorCard extends PublikLimitError {
  linkLabel: string
}

/* "402 <message>" is how the OpenAI SDK words publik's 402 in the answer
   engine; the side panel gets the JSON body (chat-error-text.ts). */
const MONEY_TEXT =
  /^\s*(?:error:\s*)?402\b|insufficient[_ ]credit|not enough publik|publik balance is too low/i

function publikHqUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url) return null
  try {
    const u = new URL(url)
    const host = u.hostname.toLowerCase()
    const ok =
      u.protocol === 'https:' &&
      !u.username &&
      !u.password &&
      (host === 'publikhq.com' || host.endsWith('.publikhq.com'))
    return ok ? u.toString() : null
  } catch {
    return null
  }
}

/**
 * publik's 429 (daily cap, plan budget) and 402 (balance too low) for the
 * answer engine and the council seats: they showed the raw "429 ..." or
 * "402 ..." text with Retry, which cannot help (Astro 0.2.4 QA).
 */
export function parsePublikErrorCard(
  message: string,
  now: Date = new Date(),
): PublikErrorCard | null {
  const limit = parsePublikLimitError(message, now)
  if (limit) return { ...limit, linkLabel: 'Open wallet' }

  type MoneyBody = { type?: string; message?: string; top_up_url?: string }
  const body = ((): MoneyBody | null => {
    try {
      return (JSON.parse(message) as { error?: MoneyBody })?.error ?? null
    } catch {
      return null
    }
  })()
  if (body && (body.type === 'insufficient_credit' || body.top_up_url)) {
    return {
      title: 'Not enough publik balance',
      text: body.message ?? 'Your publik balance is too low for this request.',
      url: publikHqUrl(body.top_up_url) ?? PUBLIK_PLANS_URL,
      linkLabel: 'Get a plan',
    }
  }
  if (MONEY_TEXT.test(message)) {
    const text = message.replace(/^\s*(?:error:\s*)?402\s*[:-]?\s*/i, '').trim()
    return {
      title: 'Not enough publik balance',
      text: text || 'Your publik balance is too low for this request.',
      url: PUBLIK_PLANS_URL,
      linkLabel: 'Get a plan',
    }
  }
  return null
}
