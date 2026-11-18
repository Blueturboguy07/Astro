import { describe, expect, it } from 'bun:test'
import {
  lemonadeChatModels,
  lemonadeEmbeddingModels,
} from '../../../src/lib/simplicity/models/providers/lemonade/model-list'

describe('Lemonade model list (F-040, O4-M-13)', () => {
  it('lists a model from a server without a recipe field (OpenAI-compatible)', () => {
    expect(
      lemonadeChatModels({ data: [{ id: 'qwen2.5:7b', object: 'model' }] }),
    ).toEqual([{ name: 'qwen2.5:7b', key: 'qwen2.5:7b' }])
  })

  it('lists llama.cpp and ONNX/NPU models; leaves out speech, image and embedding models', () => {
    const data = {
      data: [
        { id: 'Qwen3-4B-GGUF', recipe: 'llamacpp', labels: ['reasoning'] },
        { id: 'Llama-3.2-3B-Instruct-Hybrid', recipe: 'oga-hybrid' },
        { id: 'Whisper-Base', recipe: 'whispercpp', labels: ['audio'] },
        { id: 'SD-Turbo', recipe: 'sd-cpp', labels: ['image'] },
        { id: 'nomic-embed-GGUF', recipe: 'llamacpp', labels: ['embeddings'] },
      ],
    }
    expect(lemonadeChatModels(data).map((m) => m.key)).toEqual([
      'Qwen3-4B-GGUF',
      'Llama-3.2-3B-Instruct-Hybrid',
    ])
    expect(lemonadeEmbeddingModels(data).map((m) => m.key)).toEqual([
      'Qwen3-4B-GGUF',
      'nomic-embed-GGUF',
    ])
  })

  it('a bad answer gives an empty list, not a crash', () => {
    expect(lemonadeChatModels({})).toEqual([])
    expect(lemonadeChatModels(null)).toEqual([])
    expect(lemonadeChatModels({ data: [{ id: 3 }] })).toEqual([])
  })
})
