# Running Astro

Astro is a fork of [BrowserOS](https://github.com/browseros-ai/BrowserOS) whose
agent surfaces are replaced by the UI from
[Simplicity/Vane](https://github.com/ItzCrazyKns/Vane). Search, Deep Research and
Model Council come from Simplicity; browsing and browser automation come from
BrowserOS.

**There is no installer yet.** Shipping a branded browser means building
Chromium, which needs ~100 GB of disk per platform and cannot be cross-compiled
(a Windows build needs Windows, a Linux build needs Linux). What you *can* do
today — on macOS, Windows and Linux — is run Astro's UI and agent on top of an
installed BrowserOS. That is what this guide covers, and it takes about ten
minutes.

---

## 1. Install BrowserOS

Astro drives the BrowserOS binary rather than shipping its own.

| Platform | Download |
|---|---|
| macOS | [BrowserOS.dmg](https://files.browseros.com/download/BrowserOS.dmg) |
| Windows | [BrowserOS_installer.exe](https://files.browseros.com/download/BrowserOS_installer.exe) |
| Linux (AppImage) | [BrowserOS.AppImage](https://files.browseros.com/download/BrowserOS.AppImage) |
| Linux (Debian) | [BrowserOS.deb](https://cdn.browseros.com/download/BrowserOS.deb) |

### Windows and Linux: you will hit a security warning

BrowserOS is signed on macOS but **not** on Windows, and Linux has no signing at
all. You have to allow it explicitly:

- **Windows** — SmartScreen shows *"Windows protected your PC."* Click **More
  info**, then **Run anyway**. If your browser blocks the download itself, open
  Downloads and choose **Keep**.
- **Linux (AppImage)** — mark it executable before running:
  ```bash
  chmod +x BrowserOS.AppImage
  ./BrowserOS.AppImage
  ```
  On some desktops you also need `--no-sandbox`, or install the `.deb` instead.
- **macOS** — signed and notarized, so it opens normally. If macOS still
  complains after a manual download, run `xattr -cr /Applications/BrowserOS.app`.

---

## 2. Install the toolchain

| Tool | Version | Why |
|---|---|---|
| [Bun](https://bun.sh) | **1.3.6** | The monorepo hard-rejects npm/pnpm/yarn |
| [Node](https://nodejs.org) | **22 or newer** | WXT uses `node:util`'s `parseEnv`, added in 22 |
| [Go](https://go.dev/dl/) | any recent | builds `browseros-dev`, the dev orchestrator |
| [Lima](https://lima-vm.io) | any recent | `dev:watch` checks for `limactl` before starting |

```bash
curl -fsSL https://bun.sh/install | bash -s "bun-v1.3.6"
```

Two traps worth knowing:

- **An old Node earlier in `PATH` wins.** If `node -v` prints anything below 22,
  the build dies with `Export named 'parseEnv' not found`. Check with
  `which -a node` and put the new one first.
- **`limactl` is checked but never used** by `dev:watch` — only `reset` uses it.
  It still has to be installed or the command exits immediately.

---

## 3. Set up

```bash
git clone https://github.com/Blueturboguy07/Astro.git
cd Astro/packages/browseros-agent

cp .env.development.example .env.development
```

**Now edit `.env.development` and comment out this line:**

```diff
- GRAPHQL_SCHEMA_PATH=
+ # GRAPHQL_SCHEMA_PATH=
```

This is not optional. The code reads it with `??`, which does not fall back on an
empty string, so leaving it set-but-empty makes setup fail with
`No schema found` even though the schema is right there. (Inherited from
upstream.)

Point `BROWSEROS_BINARY` at your install if it is not in the default location:

```bash
# macOS default
BROWSEROS_BINARY=/Applications/BrowserOS.app/Contents/MacOS/BrowserOS
```

Then:

```bash
bun install
bun run dev:setup
```

---

## 4. Run

```bash
bun run dev:watch
```

This builds the extension, launches BrowserOS with it loaded, and starts the
agent server. A browser window opens on Astro's new tab.

Add `-- --new` for a throwaway profile that will not touch your everyday
browsing:

```bash
bun run dev:watch -- --new
```

---

## 5. Add a model

Open **Settings** from the sidebar. Astro works with:

- **Claude Code / Codex / GitHub Copilot** — reuses a subscription you already
  pay for, no API key
- **Any API key** — OpenAI, Anthropic, Gemini, Groq, xAI and others
- **Local models** — Ollama or LM Studio, nothing leaves your machine

Web search needs no key at all. The first search downloads a private
[SearXNG](https://searxng.org) instance (~150 MB, one time) and runs it on
localhost — no Docker, no account, no search API key.

---

## What works

- **Search / Deep Research / Model Council** from the composer
- **Browser automation** — 16 CDP tools; the agent opens tabs, clicks, reads
  pages and fills forms
- **Discover, Library, connectors, widgets**

## What does not

- **Computer** — the sidebar entry exists and explains itself. Comet's version
  runs in a cloud sandbox and keeps working with the laptop closed; that is not
  built here.
- **Spaces, Artifacts, Skills, Memory** — navigation only.
- **File generation** (.pptx/.xlsx) — not in Astro or its upstreams.

---

## Licences

Astro is **AGPL-3.0**, inherited from BrowserOS. The vendored Simplicity/Vane
code is **MIT**, © ItzCrazyKns — see
[`ATTRIBUTION.md`](packages/browseros-agent/apps/app/screens/simplicity/ATTRIBUTION.md)
for the notice and a file-by-file map of what came from where.
