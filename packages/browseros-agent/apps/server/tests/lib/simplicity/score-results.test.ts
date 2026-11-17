import { describe, expect, it } from 'bun:test'
import {
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
    expect(
      await scoreResults('FIFA World Cup final', hits, failing),
    ).toHaveLength(1)
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
