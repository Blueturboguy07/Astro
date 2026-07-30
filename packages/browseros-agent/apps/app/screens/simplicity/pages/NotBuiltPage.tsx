/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Placeholder for Comet sidebar destinations that exist in the navigation but
 * have no implementation here yet. Rendering an explicit "not built" panel beats
 * a dead link or a blank pane: the nav mirrors Comet, and this states plainly
 * which parts are real.
 */

import type { FC } from 'react'
import { Link } from 'react-router'

export const NotBuiltPage: FC<{
  title: string
  what: string
  status?: string
}> = ({ title, what, status }) => (
  <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6">
    <h1 className="mb-2 font-medium text-2xl">{title}</h1>
    <p className="mb-4 text-black/60 text-sm leading-relaxed dark:text-white/60">
      {what}
    </p>
    {status && (
      <p className="mb-6 rounded-lg border border-light-200 bg-light-secondary px-4 py-3 text-[13px] text-black/60 dark:border-dark-200 dark:bg-dark-secondary dark:text-white/60">
        {status}
      </p>
    )}
    <Link
      to="/home"
      className="text-[13px] text-black/50 underline underline-offset-4 hover:text-black dark:text-white/50 dark:hover:text-white"
    >
      Back to search
    </Link>
  </div>
)

export const ComputerPage: FC = () => (
  <NotBuiltPage
    title="Computer"
    what="Comet's Computer runs multi-step tasks in a cloud sandbox, keeps working while your laptop is closed, and produces finished files."
    status="Not built yet. What exists today: deep_research (multi-step search), model_council (several models on one shared retrieval), and 16 browser tools for driving pages. Missing: background execution and file generation."
  />
)

export const SpacesPage: FC = () => (
  <NotBuiltPage
    title="Spaces"
    what="Grouped collections of threads and files with their own context and instructions."
    status="Not built yet."
  />
)

export const ArtifactsPage: FC = () => (
  <NotBuiltPage
    title="Artifacts"
    what="Generated documents, decks and dashboards produced by a task."
    status="Not built yet — depends on file generation, which neither this fork nor its upstream sources ship."
  />
)

export const SkillsPage: FC = () => (
  <NotBuiltPage
    title="Skills"
    what="Saved instruction sets that activate automatically on matching tasks."
    status="Not built yet. BrowserOS shipped Skills in v0.43.0 and removed them in May 2026, so the prior implementation is recoverable from upstream git history."
  />
)

export const MemoryPage: FC = () => (
  <NotBuiltPage
    title="Memory"
    what="Preferences and context carried across threads."
    status="Not built yet. BrowserOS shipped Memory (plain markdown, fuzzy-searched, fully local) and removed it in May 2026 — recoverable from upstream history."
  />
)
