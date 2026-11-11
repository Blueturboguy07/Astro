# BrowserOS Agent Extension

## v0.0.103 (2026-11-10)

## What's Changed

- feat(publik): Sign in with publik. The publik module (`lib/publik/publik.ts`) runs its gate in the background at browser start, and every page stays on the gate until the person is signed in. The same module counts usage (`app_opened`, `active_session`) with the install key. The person chooses publik API or their own key once at the gate, and again in Settings → Models. The self-test is at `app.html#/publik/self-test`.
- The previous publik integration (first-run card, disclosure, wallet polling) and the server-path launcher are replaced by the one module.

## v0.0.99 (2026-04-08)

## What's Changed

- chore: bump server and extension version (#659)
- chore(agent): remove workflows feature (#656)
- feat: replace model picker with shadcn Combobox + fuse.js fuzzy search (#617)
- feat: clean-up - remove obsolete controller extension (#610)
- docs: update agent extension changelog for v0.0.98 (#609)


## v0.0.98 (2026-03-27)

## What's Changed

- chore: update agent version (#608)
- chore: fix version number for extension (#606)
- fix: improve chat history freshness and reduce query payload (#598)
- feat: isolate new-tab agent navigation from origin tab (#593)
- docs: overhaul READMEs across all major packages (#594)
- fix(ui): resolve MCP promo banner dismiss button overlapping with text (#581)
- docs: update agent extension changelog for v0.0.52 (#573)


## v0.0.52 (2026-03-26)

Initial release

