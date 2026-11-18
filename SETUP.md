# Running Astro

Astro is a fork of [BrowserOS](https://github.com/browseros-ai/BrowserOS) whose
agent surfaces are replaced by the UI from
[Simplicity/Vane](https://github.com/ItzCrazyKns/Vane). Search, Deep Research and
Model Council come from Simplicity; browsing and browser automation come from
BrowserOS.

## macOS: just download it

Astro ships as a complete browser on macOS. You do **not** need BrowserOS, Bun,
Node or any of the toolchain below.

**[⬇️ Download Astro.dmg](https://github.com/Blueturboguy07/Astro/releases/latest/download/Astro.dmg)**
(~231 MB, Apple silicon)

Open the disk image, drag **Astro** to Applications, and launch it. It is
Developer ID signed and notarized by Apple, so it opens with no security
warning and no right-click trick.

> **If you also have BrowserOS installed**, the two share a bundle identifier
> and therefore a browser profile, and BrowserOS will remove Astro's agent
> extension from it. Use one or the other for now.

## Windows: download the installer

Astro also ships as a complete browser on Windows (x64). Download
`Astro-Setup.exe` from the
[latest release](https://github.com/Blueturboguy07/Astro/releases/latest), or
follow the [Windows install guide](https://publikhq.com/astro/install/windows).
The installer is unsigned: in SmartScreen click **More info**, then **Run
anyway**. Do not use the BrowserOS path below on Windows.

Everything below is for **Linux, and anyone working on Astro itself.**
Cutting a release of that dmg is its own ritual — see [RELEASING.md](RELEASING.md).

---

## Linux: run Astro on top of BrowserOS

There is no standalone Linux build yet. Shipping a branded browser means
building Chromium, which needs ~100 GB of disk per platform and cannot be
cross-compiled — a Linux build needs Linux. Until then you can run Astro's UI
and agent on top of an installed BrowserOS, which takes about ten minutes.

## 1. Install BrowserOS

Astro drives the BrowserOS binary rather than shipping its own.

| Platform | Download |
|---|---|
| Linux (AppImage) | [BrowserOS.AppImage](https://files.browseros.com/download/BrowserOS.AppImage) |
| Linux (Debian) | [BrowserOS.deb](https://cdn.browseros.com/download/BrowserOS.deb) |

### You will hit a security warning

Linux has no signing at all. You have to allow BrowserOS explicitly:

- **Linux (AppImage)** — mark it executable before running:
  ```bash
  chmod +x BrowserOS.AppImage
  ./BrowserOS.AppImage
  ```
  On some desktops you also need `--no-sandbox`, or install the `.deb` instead.

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

Astro opens with **Sign in with publik** (a dev build needs
`VITE_PUBLIK_APP_TOKEN` in `.env.development`, see [RELEASING.md](RELEASING.md)
§2). After the sign-in, choose **Connect your plan** to use your publik plan, or
**Use my own key**.

The answer engine (the new tab) keeps its own connections: click the gear at
the bottom left, open **Models**, and click **Add Connection**. It offers:

- **Claude (your account)** — your Claude Code sign-in, no API key
- **API keys** — OpenAI, Anthropic, Gemini, Groq, xAI; the OpenAI type with your
  own Base URL reaches any OpenAI-compatible endpoint
- **Local models** — Ollama or Lemonade, nothing leaves your machine

The side panel assistant has its own provider list in **Settings → AI &
Agents**.

Web search needs no search API key. The first search downloads a private
[SearXNG](https://searxng.org) instance (~150 MB, one time) and runs it on
localhost — no Docker, no account, no search API key. Search still needs a
model: the model writes the answer.

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
