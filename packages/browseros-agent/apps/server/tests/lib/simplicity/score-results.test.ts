import { describe, expect, it } from 'bun:test'
import {
  numberedTerms,
  openableUrl,
  rankByWords,
  scoreResults,
} from '../../../src/lib/simplicity/agents/search/researcher/actions/search/baseSearch'
import BaseEmbedding from '../../../src/lib/simplicity/models/base/embedding'
import NullEmbedding from '../../../src/lib/simplicity/models/base/null-embedding'

/* Astro 0.2.4 QA, F-002: with publik (no embedding provider) every web search
   answered "Found 0 results" although SearXNG returned 40+ hits. */

const hits = [
  {
    title: '2026 FIFA World Cup',
    url: 'https://en.wikipedia.org/wiki/2026_FIFA_World_Cup',
    content: 'The 2026 FIFA World Cup final',
  },
  {
    title: 'Final',
    url: 'https://www.fifa.com/final',
    content: 'Spain beat Argentina',
  },
]

class FixedEmbedding extends BaseEmbedding<Record<string, never>> {
  constructor(private readonly vectors: Record<string, number[]>) {
    super({})
  }
  async embedText(texts: string[]) {
    return texts.map((t) => this.vectors[t] ?? [0, 1])
  }
  async embedChunks() {
    return []
  }
}

describe('scoreResults', () => {
  it('keeps matching hits, ranked by query words, when there is no embedding model', async () => {
    const chunks = await scoreResults(
      'who won the 2026 World Cup final',
      hits,
      new NullEmbedding(),
    )
    expect(chunks.map((c) => c.metadata.url)).toEqual([hits[0].url])
  })

  it('still drops weak hits when a real embedding ranks them', async () => {
    const embedding = new FixedEmbedding({
      'who won': [1, 0],
      'The 2026 FIFA World Cup final': [1, 0.1],
      'Spain beat Argentina': [0, 1],
    })
    const chunks = await scoreResults('who won', hits, embedding)
    expect(chunks.map((c) => c.metadata.title)).toEqual(['2026 FIFA World Cup'])
  })

  it('ranks by words when the embedding call fails', async () => {
    const failing = new FixedEmbedding({})
    failing.embedText = async () => {
      throw new Error('embedding down')
    }
    expect(await scoreResults('World Cup final', hits, failing)).toHaveLength(1)
  })
})

/* The 0.0.109 UI run: with rate-limited engines the hits for one word of
   the query came first and the answer said the sources did not cover the
   question (F-061); other hits had dead links (F-031). Real titles. */
describe('rankByWords and openableUrl (no embedding model)', () => {
  const capital = [
    {
      title: 'Wells Fargo - Official Site',
      url: 'https://www.wellsfargo.com/',
      content: 'Provider of banking, mortgage, investing, credit card',
    },
    {
      title: 'Canberra - Wikipedia',
      url: 'https://en.wikipedia.org/wiki/Canberra',
      content: 'Canberra is the capital city of Australia.',
    },
    {
      title: 'Account Activity – Wells Fargo',
      url: 'https://www.wellsfargo.com/online',
      content: 'Deposit details',
    },
    {
      title: 'What is the Capital of Australia? - Mappr',
      url: 'https://www.mappr.co/capital-cities/australia/',
      content: 'Canberra',
    },
  ]

  it('drops hits with no query word and ranks the rest by matches', async () => {
    const out = await scoreResults(
      'capital of Australia',
      capital,
      new NullEmbedding(),
    )
    expect(out.map((c) => c.metadata.title)).toEqual([
      'Canberra - Wikipedia',
      'What is the Capital of Australia? - Mappr',
    ])
  })

  it('needs two words of a longer query', () => {
    const rivers = [
      {
        title: 'Longest word in English - Wikipedia',
        url: 'https://en.wikipedia.org/wiki/Longest_word_in_English',
        content: 'The longest officially recognized place name',
      },
      {
        title: 'MAJOR Definition & Meaning',
        url: 'https://www.merriam-webster.com/dictionary/major',
        content: 'major: greater in dignity',
      },
      {
        title: 'Murray River - Wikipedia',
        url: 'https://en.wikipedia.org/wiki/Murray_River',
        content: "It is Australia's longest river",
      },
    ]
    expect(
      rankByWords('major rivers Australia Murray Darling', rivers).map(
        (c) => c.metadata.title,
      ),
    ).toEqual(['Murray River - Wikipedia'])
    expect(
      rankByWords('longest rivers in Australia', rivers).map(
        (c) => c.metadata.title,
      ),
    ).toEqual(['Murray River - Wikipedia'])
  })

  it('drops a page of junk entirely (Microsoft pages for a rivers query)', () => {
    const junk = [
      {
        title: 'Microsoft - Official Home Page',
        url: 'https://www.microsoft.com/en-us/',
        content: 'Explore Microsoft products',
      },
      {
        title: 'Sign in to your account',
        url: 'https://myaccount.microsoft.com/',
        content: '',
      },
    ]
    expect(rankByWords('rivers in Australia list', junk)).toEqual([])
  })

  it('keeps the engine order for a query in a script without spaces', () => {
    const zh = [
      {
        title: '堪培拉',
        url: 'https://zh.wikipedia.org/a',
        content: '澳大利亚首都',
      },
      { title: '首都', url: 'https://zh.wikipedia.org/b', content: '' },
    ]
    expect(rankByWords('澳大利亚的首都是哪里', zh)).toHaveLength(2)
  })

  it('drops links a reader cannot open', async () => {
    expect(openableUrl('http:///go/v1/AfMO7bC25kZU')).toBe(false)
    expect(openableUrl('/go/v1/x')).toBe(false)
    expect(openableUrl('javascript:alert(1)')).toBe(false)
    expect(openableUrl('https://en.wikipedia.org/wiki/Canberra')).toBe(true)
    const out = await scoreResults(
      'capital of Australia',
      [
        ...capital,
        {
          title: 'Canberra | Britannica',
          url: 'http:///go/v1/AfMO7',
          content: 'capital of Australia',
        },
      ],
      new NullEmbedding(),
    )
    expect(out.some((c) => c.metadata.url.startsWith('http:///'))).toBe(false)
  })
})

/* Astro 0.2.4 QA, UC-29 (0.0.114 retest): "Summarize the Python style guide
   PEP 8 in 6 bullets." The planned queries carried "2026", "latest" and
   "six"; junk "PEP" pages passed with "pep" + a year in the snippet date.
   Real titles from the run. */
describe('rankByWords: distinctive words only (UC-29)', () => {
  const pepHits = [
    {
      title: 'PEP | HIV Risk and Prevention | CDC',
      url: 'https://www.cdc.gov/hiv/risk/pep/index.html',
      content: 'Post-exposure prophylaxis (PEP) ... Updated March 2026.',
    },
    {
      title: 'PepsiCo (PEP) Stock Price & Overview',
      url: 'https://stockanalysis.com/stocks/pep/',
      content: 'PEP stock price, news and summary for 2026.',
    },
    {
      title: 'SIX Definition & Meaning - Merriam-Webster',
      url: 'https://www.merriam-webster.com/dictionary/six',
      content: 'six: being one more than five; latest 2026 update',
    },
    {
      title: 'PEP-Web',
      url: 'https://pep-web.org/',
      content: 'Psychoanalytic Electronic Publishing. 2026',
    },
    {
      title: 'Pep Guardiola - Wikipedia',
      url: 'https://en.wikipedia.org/wiki/Pep_Guardiola',
      content: 'Pep Guardiola is a Spanish football manager (2026 season)',
    },
    {
      title: 'PEP 8 – Style Guide for Python Code',
      url: 'https://peps.python.org/pep-0008/',
      content:
        'This document gives coding conventions for the Python code comprising the standard library.',
    },
    {
      title: 'How to Write Beautiful Python Code With PEP 8',
      url: 'https://realpython.com/python-pep8/',
      content:
        'Learn how to write high-quality, readable code by using the Python style guidelines laid out in PEP 8.',
    },
  ]
  const titles = (q: string) =>
    rankByWords(q, pepHits).map((c) => c.metadata.title)

  it('drops the junk PEP pages and keeps peps.python.org for every planned query', () => {
    for (const q of [
      'PEP 8 style guide summary 2026',
      'key points of PEP 8 latest',
      'Summarize PEP 8 Python code style conventions',
    ]) {
      const got = titles(q)
      expect(got).not.toContain('PepsiCo (PEP) Stock Price & Overview')
      expect(got).not.toContain('PEP | HIV Risk and Prevention | CDC')
      expect(got).not.toContain('PEP-Web')
      expect(got).not.toContain('Pep Guardiola - Wikipedia')
      expect(got).not.toContain('SIX Definition & Meaning - Merriam-Webster')
    }
    expect(titles('PEP 8 style guide summary 2026')[0]).toBe(
      'PEP 8 – Style Guide for Python Code',
    )
    expect(titles('Summarize PEP 8 Python code style conventions')).toEqual([
      'PEP 8 – Style Guide for Python Code',
      'How to Write Beautiful Python Code With PEP 8',
    ])
  })

  it('a year or a generic word never counts; "PEP 8" counts as one term', () => {
    expect(titles('six main rules PEP 8 2026')).toEqual([
      'PEP 8 – Style Guide for Python Code',
      'How to Write Beautiful Python Code With PEP 8',
    ])
    expect(
      numberedTerms('PEP 8 in 2026').map((r) => r.test('pep-0008')),
    ).toEqual([true])
    expect(numberedTerms('PEP 8').some((r) => r.test('pep 80'))).toBe(false)
    expect(numberedTerms('World Cup 2026')).toEqual([])
  })
})
