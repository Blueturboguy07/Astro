/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Embedding stand-in for when no embedding provider is configured.
 *
 * Simplicity used embeddings for one thing: cosine-reranking and de-duplicating
 * search results. This fork deliberately does not embed — BrowserOS is BYO-key
 * and its default provider (Claude Code, via an existing subscription) exposes
 * no embedding models, so requiring one would gate search behind a second
 * credential. Ranking is left to SearXNG's cross-engine fusion plus the
 * model-driven result picker.
 *
 * Returning equal zero-vectors makes every similarity identical, so the rerank
 * becomes a stable no-op and the original engine order survives — rather than
 * the whole chat request failing with "Invalid provider id".
 */

import type { Chunk } from '../../types'
import BaseEmbedding from './embedding'

/* Length is arbitrary but must be consistent: computeSimilarity walks both
   vectors in step, so mismatched lengths would read past the end. */
const DIMENSIONS = 8

class NullEmbedding extends BaseEmbedding<Record<string, never>> {
  constructor() {
    super({})
  }

  async embedText(texts: string[]): Promise<number[][]> {
    return texts.map(() => new Array(DIMENSIONS).fill(0))
  }

  async embedChunks(chunks: Chunk[]): Promise<number[][]> {
    return chunks.map(() => new Array(DIMENSIONS).fill(0))
  }
}

export default NullEmbedding
