# Attribution

The UI in `screens/simplicity/` and the client code in `lib/simplicity/` are
ported from **Simplicity**, a fork of [Vane](https://github.com/ItzCrazyKns/Vane)
(the Perplexica successor) by **ItzCrazyKns**, used under the **MIT License**.

The server-side ports live elsewhere in this repo and carry the same credit in
their file headers:

| Ported into | From |
|---|---|
| `apps/server/src/lib/searxng/provision.ts` | `desktop/searxng.mjs` |
| `apps/server/src/lib/searxng/search.ts` | `src/lib/searxng.ts` |
| `apps/server/src/lib/scraper.ts` | `src/lib/scraper.ts` |
| `apps/server/src/tools/search/query-planner.ts` | `src/lib/agents/search/researcher/queryPlanner.ts` |
| `apps/server/src/tools/search/deep-research.ts` | `src/lib/agents/search/researcher/` |
| `apps/server/src/tools/search/model-council.ts` | `src/lib/agents/council/` |

## MIT License

```
MIT License

Copyright (c) 2026 ItzCrazyKns

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

MIT permits relicensing into this AGPL-3.0 project; the notice above must be
retained. BrowserOS itself is a fork of
[browseros-ai/BrowserOS](https://github.com/browseros-ai/BrowserOS) (AGPL-3.0),
which is in turn based on Chromium and uses patches from ungoogled-chromium.

## Deliberate divergences from upstream Simplicity

These are documented in the relevant file headers, and are why this is not a
byte-for-byte port:

- **Nav moved to the top.** `Sidebar.tsx` rendered a fixed left icon rail on
  desktop and a bottom bar on mobile. Inside a browser both fight the browser's
  own chrome, so `TopNav.tsx` replaces them.
- **Next.js dropped.** File routing became `react-router`; `next/link`,
  `next/navigation` and `next/error` were replaced. `useSearchParams` returns a
  tuple in react-router, unlike Next's.
- **No embedding rerank** in research — BrowserOS configures no embedding model
  and is BYO-key, so requiring one would gate search behind a second credential.
- **No Playwright in the scraper** — BrowserOS *is* a browser; bundling a second
  engine to render pages the agent can already reach costs ~500MB.
- **Council members are models on the current provider**, not across providers,
  because BrowserOS resolves credentials per-session.
- **Server-side code was not copied here.** Vane's `models/`, `db/`, `agents/`,
  `uploads/` and `prompts/` belong on the Bun server, not in a browser
  extension; only client code lives under `lib/simplicity/`.

Biome linting is disabled for these two directories (see `apps/app/biome.json`)
so the vendored source stays close to upstream and can be re-synced. Formatting
and typechecking still apply.
