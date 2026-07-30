/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 *
 * Web Crypto replacement for Simplicity's `crypto.randomBytes(n).toString('hex')`.
 *
 * Upstream ran under Next, where the Node `crypto` module is available even in
 * client components via bundler shims. These pages ship as a browser extension
 * with no Node builtins, so importing `node:crypto` fails at runtime — and the
 * IDs it generated are only opaque identifiers, not anything needing Node.
 */

/** Returns `bytes * 2` hex characters from the platform CSPRNG. */
export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes)
  globalThis.crypto.getRandomValues(buf)
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
}
