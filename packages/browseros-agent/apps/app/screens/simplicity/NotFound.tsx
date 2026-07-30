/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Replaces `next/error` in ChatWindow. There is no Next runtime here, and an
 * extension page has no HTTP status to report, so this is a plain 404 panel.
 */

export const NotFound = () => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-2">
    <p className="font-medium text-black/70 text-lg dark:text-white/70">
      404 — not found
    </p>
    <p className="text-black/50 text-sm dark:text-white/50">
      This conversation doesn't exist.
    </p>
  </div>
)
