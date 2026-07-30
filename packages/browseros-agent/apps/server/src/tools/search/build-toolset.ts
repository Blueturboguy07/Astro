/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import type { LanguageModel, ToolSet } from 'ai'
import type { ResolvedAgentConfig } from '../../agent/types'
import { createDeepResearchTool } from './deep-research'
import { createModelCouncilTool } from './model-council'
import { createWebSearchTool } from './web-search'

export interface SearchToolSetOptions {
  resolvedConfig: ResolvedAgentConfig
  /** The session's model, reused for planning, picking, extraction and chairing. */
  model: LanguageModel
}

export function buildSearchToolSet(options: SearchToolSetOptions): ToolSet {
  return {
    web_search: createWebSearchTool(),
    deep_research: createDeepResearchTool(options.model),
    model_council: createModelCouncilTool(
      options.resolvedConfig,
      options.model,
    ),
  }
}
