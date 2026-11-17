import { describe, expect, it } from 'bun:test'
import { appendEmbeddingModel } from './upload-embedding'

const store = (v: Record<string, string>) => ({
  getItem: (k: string) => v[k] ?? null,
})

describe('appendEmbeddingModel (F-068)', () => {
  it('sends the chosen embedding model', () => {
    const d = new FormData()
    appendEmbeddingModel(
      d,
      store({ embeddingModelProviderId: 'o1', embeddingModelKey: 'nomic' }),
    )
    expect(d.get('embedding_model_provider_id')).toBe('o1')
    expect(d.get('embedding_model_key')).toBe('nomic')
  })

  it('does not block a publik-only setup with no embedding model', () => {
    const d = new FormData()
    appendEmbeddingModel(d, store({}))
    expect(d.get('embedding_model_provider_id')).toBe('')
    expect(d.get('embedding_model_key')).toBe('')
  })
})
