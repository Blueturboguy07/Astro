import { describe, expect, it } from 'bun:test'
import { scoreResults } from '../../../src/lib/simplicity/agents/search/researcher/actions/search/baseSearch'
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
  it('keeps every hit, in engine order, when there is no embedding model', async () => {
    const chunks = await scoreResults('who won', hits, new NullEmbedding())
    expect(chunks.map((c) => c.metadata.url)).toEqual(hits.map((h) => h.url))
    expect(chunks.every((c) => c.metadata.similarity === 1)).toBe(true)
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

  it('keeps every hit when the embedding call fails', async () => {
    const failing = new FixedEmbedding({})
    failing.embedText = async () => {
      throw new Error('embedding down')
    }
    expect(await scoreResults('who won', hits, failing)).toHaveLength(2)
  })
})
