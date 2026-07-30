/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Browser chrome defaults for Astro.
 *
 * Both of these defaults live in the Chromium layer, which cannot be rebuilt
 * here, so they are applied as prefs once on install. Neither overrides a later
 * user choice — Settings > Customize still owns both toggles — because this only
 * runs on first install.
 *
 *  - Horizontal tabs. Upstream defaults `vertical_tabs_enabled` to true, putting
 *    a tab rail down the left edge beside the app's own sidebar. Two vertical
 *    strips is one too many, and the layout this fork targets runs tabs across
 *    the top.
 *  - No separate Chat button. The toolbar shipped both "Chat" and "Assistant",
 *    but the Assistant surface already switches between assistant and chat
 *    modes, so the second button is a duplicate entry point.
 */

import { getAstroAdapter } from './adapter'
import { BROWSEROS_PREFS } from './prefs'

export async function applyBrowserChromeDefaults(): Promise<void> {
  const adapter = getAstroAdapter()
  await Promise.all([
    adapter.setPref(BROWSEROS_PREFS.VERTICAL_TABS_ENABLED, false),
    adapter.setPref(BROWSEROS_PREFS.SHOW_LLM_CHAT, false),
  ])
}
