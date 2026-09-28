import {
  formatMicros,
  LINK_STARTER_MICROS,
  PUBLIK_ACCOUNT_URL,
  type PublikStatus,
} from './types'

/* The in-app plan CTA and its justification (CONTRACT §12, founder
 * 2026-09-19). Pure functions, shared by the first-run card, the Settings
 * card and the credit banner so every surface says the same thing and
 * cta.test.ts pins it once.
 *
 * Copy rule (CONTRACT §1): "publik API", dollars, never tokens, never a
 * made-up unit, never the provider's name. The balance always comes from
 * the server (starter_micros / GET /wallet). The one fixed amount is the
 * $0.05 a first link gives (types.ts LINK_STARTER_MICROS, publik migration
 * 0059), which the site's own disclosure states too. */

/* The one-sentence justification, verbatim from the site's
   lib/publik-api/why-it-costs.ts `whyItCostsSentence("Astro")`, so the
   argument here is the argument on the dashboard, the claim page and the
   402 body. */
export const WHY_IT_COSTS =
  "The AI model behind Astro is run by a provider that charges per use; publik passes that on at half the provider's list price, nothing is charged behind your back, and you can see every call on your dashboard."

/* The install disclosure's cost sentence (`disclosureCostSentence("Astro")`
   from the same file), shown before anything is sent. The second sentence
   is the site's since migration 0059: a new computer starts at $0.00, and
   the only free thing is $0.05 of use when it is first linked to a publik
   account. Changing this text means bumping types.ts DISCLOSURE_VERSION. */
export const DISCLOSURE_COST =
  "Astro runs on publik API by default: the AI model behind it is run by a provider that charges per use, and publik passes that on at 50% of the model's published list price with no markup, from your publik balance. A new computer starts at $0.00 and no card is asked for: linking this computer to your publik account gives $0.05 of free use, once, and a plan, a pack or your own key takes it from there; nothing is charged behind your back, and when the balance runs out Astro tells you and keeps working with your own key — most people spend under $2 a month."

export const DISCLOSURE_PRIVACY =
  "Your questions and the pages Astro reads go through publik's servers to a shared model account. publik does not keep your prompts after the reply and never trains on them; the model provider may retain them briefly for abuse monitoring. You can switch to your own key at any time in Settings."

export const CTA_LINK_LABEL = 'Link this computer & pick a plan'
export const CTA_ADD_LABEL = 'Add a plan or pack'
export const CTA_LATER_LABEL = 'Later'
export const WHY_IT_COSTS_LABEL = 'Why it costs money'

/* Starter share below which the low-starter banner shows. */
export const LOW_STARTER_SHARE = 0.2

/* Only publikhq.com may be opened from a publik button (CONTRACT §11.4).
   The gateway is the only source of these URLs, but a response is still
   input: an off-domain, non-https or malformed link is dropped, never
   rendered. */
export const publikLink = (url: unknown): string | null => {
  if (typeof url !== 'string' || !url) return null
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== 'https:') return null
  const host = u.hostname.toLowerCase()
  if (host !== 'publikhq.com' && !host.endsWith('.publikhq.com')) return null
  if (u.username || u.password) return null
  return u.toString()
}

export type PlanCta = { label: string; href: string }

/* The primary button (CONTRACT §12.1 (c) and §12.2):
     anonymous → "Link this computer & pick a plan" → claim_url
     claimed   → "Add a plan or pack"               → add_credit_url
   Without a usable URL the dashboard's own claim box is the way to link
   the computer, so the button still lands on publikhq.com. */
export const planCta = (
  status: Pick<PublikStatus, 'claimState' | 'claimUrl' | 'addCreditUrl'>,
): PlanCta => {
  if (status.claimState === 'claimed') {
    return {
      label: CTA_ADD_LABEL,
      href: publikLink(status.addCreditUrl) ?? PUBLIK_ACCOUNT_URL,
    }
  }
  return {
    label: CTA_LINK_LABEL,
    href: publikLink(status.claimUrl) ?? PUBLIK_ACCOUNT_URL,
  }
}

/* The balance line, (a) in CONTRACT §12.1, from the mint response and then
   live from GET /wallet. Since migration 0059 an unlinked computer starts
   at $0.00, so its line says how to get the one free amount instead of
   calling $0.00 a starter. */
export const balanceLine = (
  status: Pick<
    PublikStatus,
    'claimState' | 'balanceMicros' | 'starterRemainingMicros'
  >,
): string | null => {
  const anonymous = status.claimState !== 'claimed'
  if (anonymous) {
    const starter = status.starterRemainingMicros ?? status.balanceMicros
    if (starter === null) return null
    if (starter <= 0)
      return `${formatMicros(0)} · link this computer for ${formatMicros(LINK_STARTER_MICROS)} of free use`
    return `${formatMicros(starter)} of free use left`
  }
  if (status.balanceMicros === null) return null
  return `${formatMicros(status.balanceMicros)} of usage available`
}

/* The one actionable link on a money message (CONTRACT §1: exactly one,
   top_up_url), labelled by claim state. */
export const topUpCta = (
  status: Pick<
    PublikStatus,
    'claimState' | 'topUpUrl' | 'claimUrl' | 'addCreditUrl'
  >,
  topUpUrl?: string | null,
): PlanCta => {
  const claimed = status.claimState === 'claimed'
  const href =
    publikLink(topUpUrl) ??
    publikLink(status.topUpUrl) ??
    (claimed ? publikLink(status.addCreditUrl) : publikLink(status.claimUrl)) ??
    PUBLIK_ACCOUNT_URL
  return { label: claimed ? CTA_ADD_LABEL : CTA_LINK_LABEL, href }
}

export type PublikBanner = {
  kind: 'credit' | 'low-starter'
  message: string
  link: PlanCta
}

/* Non-blocking banner: a 402 arrived, or the wallet shows the starter under
   20% of what was granted with nothing else to draw on. Message and link
   both come from the response; the app adds no pricing claim of its own.
   Since migration 0059 an unlinked mint grants $0.00, so the low-starter
   half only fires for a mint that was already bound to an account ($0.05
   grant); the $0.05 a later link adds is not measured against a grant
   (starterMicros stays the mint's 0), and the 402 covers that case. */
export const bannerFor = (
  status: Pick<
    PublikStatus,
    | 'connected'
    | 'claimState'
    | 'claimUrl'
    | 'addCreditUrl'
    | 'topUpUrl'
    | 'balanceMicros'
    | 'starterRemainingMicros'
    | 'starterGrantMicros'
    | 'creditError'
  >,
): PublikBanner | null => {
  if (!status.connected) return null

  if (status.creditError) {
    return {
      kind: 'credit',
      message: status.creditError.message,
      link: topUpCta(status, status.creditError.topUpUrl),
    }
  }

  const remaining = status.starterRemainingMicros
  const grant = status.starterGrantMicros
  if (remaining === null || grant === null || grant <= 0) return null
  if (remaining >= grant * LOW_STARTER_SHARE) return null
  /* A plan or pack in the wallet means the starter running low is not
     news — the balance line already shows what is left. */
  if (status.balanceMicros !== null && status.balanceMicros > remaining)
    return null

  const next =
    status.claimState === 'claimed'
      ? 'Add a plan or a pack at the link below, or use your own key in Settings.'
      : 'Link this computer and pick a plan at the link below, or use your own key in Settings.'
  return {
    kind: 'low-starter',
    message: `${formatMicros(remaining)} of free use left. ${next}`,
    link: topUpCta(status),
  }
}

/* The chat surfaces a provider failure as one string (the server relays
   `err.message`). A gateway 402 reads "402 <insufficient_credit message>"
   through the OpenAI SDK; this recognises it so the card can attach the one
   link the body would have carried. Anything else is not a money message. */
export const creditErrorFrom = (
  message: unknown,
): { message: string } | null => {
  if (typeof message !== 'string') return null
  const m = message.trim()
  if (!m) return null
  const looksLike402 =
    /\b402\b/.test(m) ||
    /insufficient[_ ]credit/i.test(m) ||
    /model[_ ]requires[_ ]claim/i.test(m) ||
    /not enough publik/i.test(m) ||
    /publik balance is too low/i.test(m)
  if (!looksLike402) return null
  /* Strip the SDK's "402 " status prefix; keep the gateway's sentence. */
  return { message: m.replace(/^\s*(?:error:\s*)?402\s*[:-]?\s*/i, '') }
}
