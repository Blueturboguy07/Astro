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
import { PUBLIK_ACCOUNT_URL, type PublikStatus } from './types'

const base: PublikStatus = {
  available: true,
  state: 'active',
  connected: true,
  disclosureCurrent: true,
  claimUrl: 'https://publikhq.com/claim/HK7F-2QWD',
  addCreditUrl: 'https://publikhq.com/dashboard/api/add',
  topUpUrl: null,
  claimState: 'anonymous',
  balanceMicros: 250_000,
  starterRemainingMicros: 250_000,
  starterGrantMicros: 250_000,
  creditError: null,
  ctaSeen: false,
  week: { usedMicros: null, budgetMicros: null, resetsAt: null },
  lastError: null,
}

describe('copy rule (CONTRACT §1, §12.5)', () => {
  const surfaces = [
    WHY_IT_COSTS,
    DISCLOSURE_COST,
    CTA_LINK_LABEL,
    CTA_ADD_LABEL,
  ]
  it('never names the vendor, tokens or credits as a unit', () => {
    for (const s of surfaces) {
      expect(s).not.toMatch(/openai|gpt|anthropic|claude|gemini/i)
      expect(s).not.toMatch(/\btokens?\b/i)
      expect(s).not.toMatch(/\bcredits\b/i)
    }
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
  it('shows the starter in dollars while anonymous', () => {
    expect(balanceLine(base)).toBe('$0.25 of free starter usage')
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
    expect(bannerFor(base)).toBeNull()
  })
  it('shows the 402 message with its one link', () => {
    const b = bannerFor({
      ...base,
      creditError: {
        message: 'Not enough publik credit for this request.',
        topUpUrl: 'https://publikhq.com/claim/HK7F-2QWD',
      },
    })
    expect(b?.kind).toBe('credit')
    expect(b?.link.href).toBe('https://publikhq.com/claim/HK7F-2QWD')
    expect(b?.link.label).toBe(CTA_LINK_LABEL)
  })
  it('warns under 20% of the starter with nothing else to draw on', () => {
    const b = bannerFor({
      ...base,
      balanceMicros: 40_000,
      starterRemainingMicros: 40_000,
    })
    expect(b?.kind).toBe('low-starter')
    expect(b?.message).toStartWith('$0.04 of free starter usage left.')
  })
  it('stays quiet when a plan or pack covers it', () => {
    expect(
      bannerFor({
        ...base,
        balanceMicros: 2_000_000,
        starterRemainingMicros: 40_000,
      }),
    ).toBeNull()
  })
  it('never renders for a disconnected install', () => {
    expect(bannerFor({ ...base, connected: false })).toBeNull()
  })
})

describe('creditErrorFrom', () => {
  it('recognises the SDK-shaped 402 and strips the status prefix', () => {
    expect(
      creditErrorFrom('402 Not enough publik credit for this request. X'),
    ).toEqual({ message: 'Not enough publik credit for this request. X' })
  })
  it('ignores every other failure', () => {
    expect(creditErrorFrom('That model failed to answer.')).toBeNull()
    expect(creditErrorFrom('429 rate limited')).toBeNull()
    expect(creditErrorFrom(undefined)).toBeNull()
  })
})
