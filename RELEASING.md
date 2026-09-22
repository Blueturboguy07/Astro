# Cutting an Astro release

Astro is not a Chromium build. The shipped `Astro.app` is upstream's **prebuilt**
BrowserOS bundle with three edits, and every release repeats them. A branded
Chromium needs roughly 100 GB of disk per platform and cannot be cross-compiled
(`SETUP.md`), so nothing here touches C++.

The three edits:

1. The agent extension id inside `BrowserOS Framework` is upstream's
   `bflpfmnmnokmjhmgnolecpppdbdophmk` overwritten with Astro's
   `kofbmbngmnnpmopgbhpbajhnnnoflolg`. The browser only installs extension ids
   that are in a compiled-in table, so without this the bundled CRX is skipped
   with "Skipping inactive or unregistered extension". Both ids are 32
   characters, which is what makes a byte patch possible.
2. Astro's CRX goes into
   `…/BrowserOS Framework.framework/Versions/<v>/Resources/browseros_extensions/`
   and `bundled_extensions.json` names it with an `external_version`. A version
   **newer than the installed one** is what makes the browser upgrade the
   extension on the next launch.
3. The whole bundle is re-signed with publik's Developer ID and notarized.

`packages/browseros-agent/scripts/release/astro-recut.ts` does 1–3 and the
Sparkle fix below. It deliberately stops before notarization and the dmg: those
need Apple credentials.

---

## 0. What you need

| Thing | Where |
|---|---|
| A previous `Astro.app` (or upstream's prebuilt bundle) | `releases/latest/download/Astro.dmg`, mounted, or a stock BrowserOS bundle |
| `~/.astro-extension-key.pem` | the CRX signing key; the public half is in `apps/app/wxt.config.ts`, and a different key means a different extension id |
| Google Chrome (any) | `chrome --pack-extension` is the packer |
| `Developer ID Application: Mann Bellani (R5R3ZS54LV)` | login keychain |
| notarytool profile `AC_PASSWORD` | `xcrun notarytool store-credentials AC_PASSWORD` once, in a **real Terminal** — not through an agent (session note `iris-release-process`) |
| `PUBLIK_APP_TOKEN` | the `pat_astro_…` token, minted once with publik's `scripts/mint-app-token.mts astro`. **Never echo it.** |

macOS only. Sequoia's App Management protection means you modify a *copy* of the
bundle and swap it in — never edit an app in `/Applications` in place.

---

## 1. Bump the extension version

`apps/app/package.json` `version` is the CRX's version. Chrome accepts 1–4
dot-separated integers and nothing else.

```bash
cd packages/browseros-agent
# 0.0.100 -> 0.0.101
```

Commit the bump: `external_version` in the bundle is read from this.

## 2. Build the agent with the publik app token baked in

The packaged build carries a **public** app token so a fresh install can mint
its own `pk_live_` key on first run (CONTRACT §3.2, §7). Without the token every
publik surface hides itself, which is exactly what you want in dev and source
builds — so this variable is what separates a packaged Astro from a checkout.

```bash
cd packages/browseros-agent
export VITE_PUBLIK_APP_TOKEN="$(cat ~/.astro-publik-app-token)"   # never echo it
bun install
bun run build:agent
unset VITE_PUBLIK_APP_TOKEN
```

Output: `apps/app/dist/chrome-mv3/`.

Check it took, without printing the token:

```bash
grep -rlq "$VITE_PUBLIK_APP_TOKEN" apps/app/dist/chrome-mv3/ && echo "token baked"
```

Optionally override the gateway with `VITE_PUBLIK_API_BASE_URL`; it defaults to
`https://publikhq.com/api/v1`, and the `POST /installs` response's `base_url`
wins over both at runtime.

## 3. Pack the CRX

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --pack-extension="$PWD/apps/app/dist/chrome-mv3" \
  --pack-extension-key="$HOME/.astro-extension-key.pem"
mv apps/app/dist/chrome-mv3.crx "$PWD/dist/astro-agent-0.0.101.crx"
```

Any CRX3 packer with the same PEM produces the same extension id. If the id
comes out different, the key is wrong — stop, because the browser will ignore
the extension.

## 4. Re-cut the bundle

```bash
cd packages/browseros-agent
bun scripts/release/astro-recut.ts \
  --source /Volumes/Astro/Astro.app \
  --crx dist/astro-agent-0.0.101.crx \
  --out dist/astro-recut \
  --sign
```

What it does, in order, failing loudly rather than shipping something wrong:

- `ditto` the source bundle to `dist/astro-recut/Astro.app` (preserves symlinks,
  xattrs and resource forks; `cp -r` does not).
- Assert the framework carries Astro's extension id **once** and upstream's
  **never**. Starting from a stock upstream bundle (i.e. a Chromium version
  bump)? Add `--patch-id` and it performs the id swap.
- Copy the CRX in as `kofbmbngmnnpmopgbhpbajhnnnoflolg.crx` and rewrite that one
  entry of `bundled_extensions.json` — upstream's bug-reporter entry is left
  untouched. `external_version` is read from the CRX's own manifest, so the two
  cannot drift.
- The Sparkle fix (§5).
- Sign inside-out with `--options runtime --timestamp`, then
  `codesign --verify --deep --strict`.

Add `--dry-run` to see the plan without touching anything.

## 5. Sparkle — the trap this fixes

The shipped v0.1.0 still carries `SUEnableAutomaticChecks = 1`, **upstream's**
`SUPublicEDKey`, and `https://cdn.browseros.com/appcast` compiled into the
framework, while reporting itself as version 0.47.18 against an upstream that is
at 0.49.x. If that update ever applies, the user's Astro becomes stock
BrowserOS, the new binary does not register Astro's extension id, and the agent
is deleted. Every install left as-is is a timer.

`--sparkle disable` (the default) does both halves:

- `Info.plist`: `SUEnableAutomaticChecks=NO`, `SUAutomaticallyUpdate=NO`,
  `SUScheduledCheckInterval=0`, and `SUFeedURL=https://publikhq.com/astro/update`.
- The framework binary: the compiled-in appcast string is overwritten with the
  same URL. It is **exactly 33 characters**, the same as upstream's, because a
  string inside a Mach-O can be overwritten but not resized. `--sparkle-feed`
  enforces that length.

Upstream's `SUPublicEDKey` is deliberately left in place while publik has no
EdDSA key: a feed publik cannot sign is a feed nothing can install from, which
is the safe direction. When publik does have one:

```bash
… --sparkle-ed-key "<base64 public half>"
```

and publish a signed appcast at `https://publikhq.com/astro/update`. That is the
step that turns this release process into an **auto-update** channel — until
then, installed users update by downloading the dmg again.

`--sparkle keep` leaves every Sparkle key as upstream shipped it. Do not use it
on a release.

## 6. Notarize, staple, dmg

The re-cut prints these with the real paths filled in.

```bash
APP=dist/astro-recut/Astro.app
DMG=dist/astro-recut/Astro.dmg

hdiutil create -volname Astro -srcfolder "$APP" -ov -format UDZO "$DMG"
codesign --force --timestamp --sign "Developer ID Application: Mann Bellani (R5R3ZS54LV)" "$DMG"

xcrun notarytool submit "$DMG" --keychain-profile AC_PASSWORD --wait
xcrun stapler staple "$DMG"
xcrun stapler staple "$APP"    # staple the APP too, not only the dmg
```

Stapling the app as well as the dmg is not optional — a stapled dmg holding an
unstapled app fails Gatekeeper on a machine that is offline (session note
`iris-signing-two-bugs`).

Local `notarytool` is flaky from an agent session; if it hangs, run it in a real
Terminal, or use the `notarize-artifact.yml` CI flow the other publik Mac apps
use (session note `publik-desktop-signing`).

## 7. Verify before publishing

```bash
spctl -a -vvv -t install dist/astro-recut/Astro.app
codesign -dvv dist/astro-recut/Astro.app 2>&1 | grep -E 'Authority|TeamIdentifier'
plutil -p dist/astro-recut/Astro.app/Contents/Info.plist | grep -E 'SU(Enable|Feed|Public)'
FW="dist/astro-recut/Astro.app/Contents/Frameworks/BrowserOS Framework.framework/Versions"/*/"BrowserOS Framework"
strings -a "$FW" | grep -c 'cdn.browseros.com/appcast'   # must be 0
strings -a "$FW" | grep -c 'kofbmbngmnnpmopgbhpbajhnnnoflolg'  # must be >= 1
strings -a "$FW" | grep -c 'bflpfmnmnokmjhmgnolecpppdbdophmk'  # must be 0
```

Then a real launch on a clean profile:

1. Move the app to `/Applications`, launch it, and let it reach the answer
   engine. A fresh install has no connection, so the chat shows the publik card.
2. **Continue with publik API** → the card should show the starter balance in
   dollars, the one-sentence justification, and **Link this computer & pick a
   plan**. Nothing may be spent before that card has been seen.
3. Settings → Models shows the same card; the model picker offers
   *publik Balanced / Fast / Smart*.
4. Ask one question. It should answer, and the balance line should go down.

## 8. Publish

```bash
gh release create v0.1.1 dist/astro-recut/Astro.dmg -R Blueturboguy07/Astro \
  --title "Astro 0.1.1" --notes "…"
```

Keep the asset named `Astro.dmg` — the publik install guide links
`releases/latest/download/Astro.dmg` (`~/publik/lib/guides/astro.ts`) and
`SETUP.md` does the same. On a fork clone, `gh release` needs the explicit `-R`
(session note `lidless-fork-notch-bug`).

**Every `--notes` must end with a `## Windows and Linux` section**, even when
the rest of the notes are about something else (a v0.1.1 release dropped it
while rewriting the notes for the publik-API-default-provider change, and a
Windows visitor landing on the bare Releases page — the repo's own README
link and GitHub's Releases sidebar both go there — saw only a macOS `.dmg`
with no Windows signpost at all). This asset is macOS-only; mirror README.md's
`### Windows and Linux` section and point at the install guide:

```markdown
## Windows and Linux

This asset (`Astro.dmg`) is macOS (Apple silicon) only. Windows and Linux run
Astro through Iris's install guide instead: https://publikhq.com/astro/install/windows
```

---

## Publik side, not this repo

These are the integrator's, in `~/publik`:

- Mint the app token once: `scripts/mint-app-token.mts astro`. Desktop app, so
  no `--origins`. Store it where step 2 reads it; never echo it.
- `lib/apps-config.ts` — the `astro` listing should say publik API is the default
  and the app works with no key.
- `lib/guides/astro.ts` — the macOS branch's last step is still "Choose where
  answers come from … Add a Claude, Codex, Copilot or Ollama route". With this
  release a model is already selected, so that step becomes "Astro is ready —
  publik API is already set up; pick your own route only if you want to." Bump
  the guide version.
- Host `https://publikhq.com/astro/update` before shipping a bundle that points
  at it — even the disabled-checks build will hit it if a user chooses
  "Check for Updates…".
