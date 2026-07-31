<div align="center">

<img src="packages/browseros-agent/apps/app/assets/product_logo.svg" alt="Astro" width="96" height="96" />

# Astro

**An answer engine that can actually use your browser**

Perplexity-style search, deep research and multi-model comparison — on top of a
browser its agent can genuinely drive. Bring your own key, or reuse a
subscription you already pay for. Search costs nothing and never leaves your
machine.

[Setup](SETUP.md) · [Attribution](packages/browseros-agent/apps/app/screens/simplicity/ATTRIBUTION.md)

</div>

---

## What it is

Two open-source projects, joined at the seam where each is weakest.

[**Simplicity**](https://github.com/ItzCrazyKns/Vane) is a very good answer
engine with no browser under it. [**BrowserOS**](https://github.com/browseros-ai/BrowserOS)
is a real browser whose agent can drive pages, but it had no retrieval at all —
its agent had to open Google and scrape the results page like a person.

Astro puts Simplicity's UI and search pipeline on top of BrowserOS's browser
automation. You get an answer engine with citations *and* an agent that can open
tabs, click, read and fill forms — in the same window.

| | |
|---|---|
| **Search** | Free and private. A local [SearXNG](https://searxng.org) is provisioned on first use — no Docker, no account, no search API key |
| **Deep Research** | Plans queries, searches in parallel, reads the best sources in full, refines, and cites |
| **Model Council** | Several models answer from one shared retrieval; a chair compares them and surfaces the disagreements |
| **Browser use** | 16 CDP tools — tabs, navigation, clicking, reading, forms, screenshots |
| **Your models** | Claude Code, Codex and Copilot subscriptions; any API key; or fully local via Ollama / LM Studio |

Scraped page content is fenced as untrusted data before it reaches a model, so a
web page cannot issue instructions to your agent.

## Running Astro

### macOS

**[⬇️ Download Astro.dmg](https://github.com/Blueturboguy07/Astro/releases/latest/download/Astro.dmg)**
— a complete browser, signed and notarized by Apple. Drag it to Applications
and open it. No BrowserOS, no toolchain, no security warning.

If you also run BrowserOS, use one or the other: they share a bundle
identifier, so they share a profile, and BrowserOS deletes Astro's agent
extension from it.

### Windows and Linux

No standalone build yet — a branded Chromium is roughly 100 GB per platform and
cannot be cross-compiled, so a Windows build needs Windows and a Linux build
needs Linux. Until then, run Astro on top of an installed BrowserOS. About ten
minutes:

### [→ Full setup guide](SETUP.md)

In short:

1. **Install BrowserOS** — [Windows](https://files.browseros.com/download/BrowserOS_installer.exe) ·
   [Linux](https://files.browseros.com/download/BrowserOS.AppImage).
   It is **unsigned on both** — see the guide for how to get past SmartScreen
   and how to make the AppImage executable.
2. **Install the toolchain** — Bun 1.3.6, Node 22+, Go, Lima.
3. **Set it up**, and mind the one trap:
   ```bash
   git clone https://github.com/Blueturboguy07/Astro.git
   cd Astro/packages/browseros-agent
   cp .env.development.example .env.development
   # then COMMENT OUT the empty GRAPHQL_SCHEMA_PATH line — inherited from
   # upstream, it fails setup with "No schema found" if left set-but-empty
   bun install && bun run dev:setup
   ```
4. **Run it**:
   ```bash
   bun run dev:watch          # add -- --new for a throwaway profile
   ```
5. **Add a model** in Settings. Search already works without one.

## What is not built

Stated plainly, because the navigation shows more than the code does:

- **Computer** — Comet's version runs tasks in a cloud sandbox and keeps working
  with the laptop closed. Not built. The pieces that exist are `deep_research`,
  `model_council` and the browser tools, all synchronous and local.
- **Spaces, Artifacts, Skills, Memory** — navigation entries only.
- **File generation** (.pptx / .xlsx) — absent here and in both upstreams.

## Licences

Astro is **AGPL-3.0**, inherited from
[BrowserOS](https://github.com/browseros-ai/BrowserOS), which is based on
Chromium and uses patches from
[ungoogled-chromium](https://github.com/ungoogled-software/ungoogled-chromium).

The vendored Simplicity/Vane code is **MIT**, © ItzCrazyKns.
[`ATTRIBUTION.md`](packages/browseros-agent/apps/app/screens/simplicity/ATTRIBUTION.md)
carries the notice, maps every ported file to its source, and documents where
this fork deliberately diverges from both.
