/**
 * Astro 0.2.4 QA, F-068: a publik-only person (no embedding model) could
 * not upload a file; with zero vectors every part of a file would score
 * the same. The parts are now ranked by the question's words.
 */
import { describe, expect, it } from 'bun:test'
import {
  hasSignal,
  keywordScore,
} from '../../../src/lib/simplicity/uploads/keyword-score'

describe('keywordScore', () => {
  it('ranks the part that holds the question words first', () => {
    const parts = [
      'The weather in Paris was mild in spring.',
      'Project Zephyr ships in March. The Zephyr budget is 40,000 euros.',
      'Our office plants need water twice a week.',
    ]
    const q = 'What is the Zephyr budget?'
    const ranked = [...parts].sort(
      (a, b) => keywordScore(q, b) - keywordScore(q, a),
    )
    expect(ranked[0]).toContain('Zephyr budget')
    expect(keywordScore(q, parts[2])).toBe(0)
  })

  it('ignores case, punctuation and stop words', () => {
    expect(keywordScore('THE zephyr', 'zephyr.')).toBeGreaterThan(0)
    expect(keywordScore('the of and', 'the of and')).toBe(0)
  })

  it('treats zero vectors as no signal', () => {
    expect(hasSignal([0, 0, 0])).toBe(false)
    expect(hasSignal([0, 0.1])).toBe(true)
    expect(hasSignal(undefined)).toBe(false)
  })
})

describe('upload and search with no embedding model', () => {
  it('a .txt file (MIME with charset) is stored and its relevant part found', async () => {
    const { default: UploadManager } = await import(
      '../../../src/lib/simplicity/uploads/manager'
    )
    const { default: UploadStore } = await import(
      '../../../src/lib/simplicity/uploads/store'
    )
    const { default: NullEmbedding } = await import(
      '../../../src/lib/simplicity/models/base/null-embedding'
    )
    const filler = 'Unrelated notes about office plants and lunch. '.repeat(80)
    const text = `${filler}\nProject Zephyr budget: 40,000 euros, approved in March.\n${filler}`
    const file = new File([text], 'notes.txt', {
      type: 'text/plain;charset=utf-8',
    })
    const manager = new UploadManager({ embeddingModel: new NullEmbedding() })
    const [stored] = await manager.processFiles([file])
    const store = new UploadStore({
      embeddingModel: new NullEmbedding(),
      fileIds: [stored.fileId],
    })
    const [top] = await store.query(['Zephyr budget'], 3)
    expect(top.content).toContain('Zephyr budget: 40,000 euros')
  })
})
