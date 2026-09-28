import { describe, expect, it } from 'bun:test'
import {
  balanceLine,
  bannerFor,
  CTA_ADD_LABEL,
  CTA_LINK_LABEL,
  creditErrorFrom,
  DISCLOSURE_COST,
  planCta,
  publikLink,
  topUpCta,
  WHY_IT_COSTS,
} from './cta'
import {
  formatMicros,
  LINK_STARTER_MICROS,
  PUBLIK_ACCOUNT_URL,
  type PublikStatus,
} from './types'

/* A fresh, unlinked install since publik migration 0059: the mint grants
   $0.00 and every metered call answers 402 until the computer is linked. */
const base: PublikStatus = {
  available: true,
  state: 'active',
  connected: true,
  disclosureCurrent: true,
  claimUrl: 'https://publikhq.com/claim/HK7F-2QWD',
  addCreditUrl: 'https://publikhq.com/dashboard/api/add',
  topUpUrl: null,
  claimState: 'anonymous',
  balanceMicros: 0,
  starterRemainingMicros: 0,
  starterGrantMicros: 0,
  creditError: null,
  ctaSeen: false,
  week: { usedMicros: null, budgetMicros: null, resetsAt: null },
  lastError: null,
}

/* A mint already bound to the signed-in account: its one $0.05 of free
   use, once per account. */
const linked: PublikStatus = {
  ...base,
  claimState: 'claimed',
  balanceMicros: LINK_STARTER_MICROS,
  starterRemainingMicros: LINK_STARTER_MICROS,
  starterGrantMicros: LINK_STARTER_MICROS,
}

/* The gateway's 402 insufficient_credit message while anonymous (the
   site's insufficientCreditMessage("anonymous")). */
const SERVER_402 =
  'Your publik balance is too low for this request. Link this computer to your publik account at the link below for $0.05 of free use, pick a plan there, or use your own key.'

describe('copy rule (CONTRACT §1, §12.5)', () => {
  const surfaces = [
    WHY_IT_COSTS,
    DISCLOSURE_COST,
    CTA_LINK_LABEL,
    CTA_ADD_LABEL,
    balanceLine(base) ?? '',
    balanceLine(linked) ?? '',
  ]
  it('never names the vendor, tokens or credits as a unit', () => {
    for (const s of surfaces) {
      expect(s).not.toMatch(/openai|gpt|anthropic|claude|gemini/i)
      expect(s).not.toMatch(/\btokens?\b/i)
      expect(s).not.toMatch(/\bcredits\b/i)
    }
  })
  it('never promises free use to a computer that is not linked (0059)', () => {
    for (const s of surfaces) {
      expect(s).not.toMatch(/starts with free|free usage|free starter/i)
      expect(s).not.toMatch(/\$0\.25/)
    }
  })
  it("carries the site's link-starter sentence in the disclosure", () => {
    expect(formatMicros(LINK_STARTER_MICROS)).toBe('$0.05')
    expect(DISCLOSURE_COST).toContain(
      'A new computer starts at $0.00 and no card is asked for: linking this computer to your publik account gives $0.05 of free use, once, and a plan, a pack or your own key takes it from there; nothing is charged behind your back',
    )
  })
  it('carries the justification verbatim from why-it-costs.ts', () => {
    expect(WHY_IT_COSTS).toBe(
      "The AI model behind Astro is run by a provider that charges per use; publik passes that on at half the provider's list price, nothing is charged behind your back, and you can see every call on your dashboard.",
    )
  })
})

describe('publikLink', () => {
  it('accepts publikhq.com over https only', () => {
    expect(publikLink('https://publikhq.com/claim/X')).toBe(
      'https://publikhq.com/claim/X',
    )
    expect(publikLink('https://www.publikhq.com/x')).toBe(
      'https://www.publikhq.com/x',
    )
    expect(publikLink('http://publikhq.com/claim/X')).toBeNull()
    expect(publikLink('https://publikhq.com.evil.io/claim')).toBeNull()
    expect(publikLink('https://evil.io/publikhq.com')).toBeNull()
    expect(publikLink('https://a:b@publikhq.com/')).toBeNull()
    expect(publikLink('not a url')).toBeNull()
    expect(publikLink(undefined)).toBeNull()
  })
})

describe('planCta (§12.1 (c), §12.2)', () => {
  it('links the computer while anonymous', () => {
    expect(planCta(base)).toEqual({
      label: CTA_LINK_LABEL,
      href: 'https://publikhq.com/claim/HK7F-2QWD',
    })
  })
  it('adds a plan or pack once claimed', () => {
    expect(planCta({ ...base, claimState: 'claimed' })).toEqual({
      label: CTA_ADD_LABEL,
      href: 'https://publikhq.com/dashboard/api/add',
    })
  })
  it('falls back to the dashboard when the url is unusable', () => {
    expect(planCta({ ...base, claimUrl: 'http://x' }).href).toBe(
      PUBLIK_ACCOUNT_URL,
    )
  })
})

describe('balanceLine (§12.1 (a))', () => {
  it('says what linking gives while an unlinked computer is at $0.00', () => {
    expect(balanceLine(base)).toBe(
      '$0.00 · link this computer for $0.05 of free use',
    )
  })
  it('shows what is left of an older unlinked starter in dollars', () => {
    expect(
      balanceLine({
        ...base,
        balanceMicros: 180_000,
        starterRemainingMicros: 180_000,
      }),
    ).toBe('$0.18 of free use left')
  })
  it('shows the $0.05 once the computer is linked', () => {
    expect(balanceLine(linked)).toBe('$0.05 of usage available')
  })
  it('shows the balance once claimed', () => {
    expect(
      balanceLine({ ...base, claimState: 'claimed', balanceMicros: 1_850_000 }),
    ).toBe('$1.85 of usage available')
  })
  it('is null before the wallet is known', () => {
    expect(
      balanceLine({
        ...base,
        balanceMicros: null,
        starterRemainingMicros: null,
      }),
    ).toBeNull()
  })
})

describe('topUpCta (§1: exactly one link)', () => {
  it('prefers the explicit top_up_url', () => {
    expect(topUpCta(base, 'https://publikhq.com/claim/Z').href).toBe(
      'https://publikhq.com/claim/Z',
    )
  })
  it('drops an off-domain top_up_url', () => {
    expect(topUpCta(base, 'https://evil.io/pay').href).toBe(
      'https://publikhq.com/claim/HK7F-2QWD',
    )
  })
})

describe('bannerFor', () => {
  it('is silent when nothing is wrong', () => {
    expect(bannerFor(linked)).toBeNull()
  })
  it('never calls a $0.00 unlinked mint a low starter (no grant to measure)', () => {
    expect(bannerFor(base)).toBeNull()
  })
  it('shows the 402 message with its one link', () => {
    const b = bannerFor({
      ...base,
      creditError: {
        message: SERVER_402,
        topUpUrl: 'https://publikhq.com/claim/HK7F-2QWD',
      },
    })
    expect(b?.kind).toBe('credit')
    expect(b?.message).toBe(SERVER_402)
    expect(b?.link.href).toBe('https://publikhq.com/claim/HK7F-2QWD')
    expect(b?.link.label).toBe(CTA_LINK_LABEL)
  })
  it('warns under 20% of the $0.05 with nothing else to draw on', () => {
    const b = bannerFor({
      ...linked,
      balanceMicros: 8_000,
      starterRemainingMicros: 8_000,
    })
    expect(b?.kind).toBe('low-starter')
    expect(b?.message).toStartWith('$0.01 of free use left.')
    expect(b?.link.label).toBe(CTA_ADD_LABEL)
  })
  it('stays quiet when a plan or pack covers it', () => {
    expect(
      bannerFor({
        ...linked,
        balanceMicros: 2_000_000,
        starterRemainingMicros: 8_000,
      }),
    ).toBeNull()
  })
  it('never renders for a disconnected install', () => {
    expect(bannerFor({ ...base, connected: false })).toBeNull()
  })
})

describe('creditErrorFrom', () => {
  it('recognises the SDK-shaped 402 and strips the status prefix', () => {
    expect(creditErrorFrom(`402 ${SERVER_402}`)).toEqual({
      message: SERVER_402,
    })
  })
  it("recognises the gateway's sentence without the status prefix", () => {
    expect(creditErrorFrom(SERVER_402)).toEqual({ message: SERVER_402 })
  })
  it('ignores every other failure', () => {
    expect(creditErrorFrom('That model failed to answer.')).toBeNull()
    expect(creditErrorFrom('429 rate limited')).toBeNull()
    expect(creditErrorFrom(undefined)).toBeNull()
  })
})
