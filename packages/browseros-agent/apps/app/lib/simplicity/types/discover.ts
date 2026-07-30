/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Types lifted out of Simplicity's Next.js page modules (~/Vane
 * src/app/discover/page.tsx and src/app/library/page.tsx), MIT
 * (c) ItzCrazyKns. The components imported them straight from the page files;
 * with Next routing dropped there are no page modules to import from, so they
 * live here instead.
 */

export interface Discover {
  title: string
  content: string
  url: string
  thumbnail: string
}

export interface Chat {
  id: string
  title: string
  createdAt: string
  sources: string[]
  files: { fileId: string; name: string }[]
}
