import { describe, expect, it } from 'bun:test'
import {
  ACADEMIC_ENGINES,
  DISCUSSION_ENGINES,
  emptySourceNotice,
  onSite,
  pickVerticals,
} from '../../../src/lib/simplicity/agents/search/researcher/verticals'
import {
  CHAT_TITLE_MAX,
  chatTitle,
} from '../../../src/lib/simplicity/chat-title'

const no = { academicSearch: false, discussionSearch: false }

describe('pickVerticals (F-065, F-076)', () => {
  it('Academic alone runs the paper engines even when the classifier says no', () => {
    const v = pickVerticals(['academic'], no)
    expect(v).toEqual([
      { name: 'academic', searchConfig: { engines: ACADEMIC_ENGINES } },
    ])
    expect(ACADEMIC_ENGINES.length).toBeGreaterThan(3)
    expect(ACADEMIC_ENGINES).toContain('pubmed')
    expect(ACADEMIC_ENGINES).toContain('openalex')
  })

  it('with Web on, Academic and Social are added only when asked for', () => {
    expect(pickVerticals(['web', 'academic', 'discussions'], no)).toEqual([
      { name: 'web' },
    ])
    expect(
      pickVerticals(['web', 'discussions'], {
        academicSearch: false,
        discussionSearch: true,
      }).map((x) => x.name),
    ).toEqual(['web', 'discussions'])
  })

  it('Social uses more than reddit', () => {
    expect(pickVerticals(['discussions'], no)[0].searchConfig?.engines).toEqual(
      DISCUSSION_ENGINES,
    )
    expect(DISCUSSION_ENGINES.length).toBeGreaterThan(1)
  })
})

describe('emptySourceNotice (F-076)', () => {
  it('says plainly that Social gave nothing and what Astro did instead', () => {
    const failed = [{ engine: 'reddit', reason: 'access denied' }] as never
    expect(emptySourceNotice('discussions', failed, 4)).toBe(
      'Social: Reddit, Hacker News and Lemmy gave no results (reddit: access denied). Astro searched reddit.com with the web engines instead.',
    )
    expect(emptySourceNotice('discussions', [], 0)).toContain(
      'This answer has no social sources.',
    )
    expect(emptySourceNotice('academic', [])).toBe(
      'Academic: the paper search engines gave no results. This answer has no academic sources.',
    )
  })

  it('onSite matches the site and its subdomains only', () => {
    expect(onSite('https://old.reddit.com/r/x', 'reddit.com')).toBe(true)
    expect(onSite('https://notreddit.com/', 'reddit.com')).toBe(false)
    expect(onSite('not a url', 'reddit.com')).toBe(false)
  })
})

describe('chatTitle (F-065)', () => {
  it('a 20,000-character question is cut to one short line', () => {
    const t = chatTitle(`${'word '.repeat(4000)}?`)
    expect(t.length).toBeLessThanOrEqual(CHAT_TITLE_MAX)
    expect(t.endsWith('…')).toBe(true)
    expect(t).not.toContain('\n')
  })

  it('a short question stays as it is, on one line', () => {
    expect(chatTitle('  What is\nQUIC? ')).toBe('What is QUIC?')
  })
})
