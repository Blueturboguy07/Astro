#!/usr/bin/env bash
# publik-release.sh — cut an Astro release with ONE command (RELEASING.md has the reasons for each step).
#
#   scripts/publik-release.sh 0.2.9                 the whole release: see the steps below
#   scripts/publik-release.sh 0.2.9 --no-publish    the same, but stop at the checked DRAFT release
#   scripts/publik-release.sh 0.2.8 --verify-only   only download and check a release that exists
#
# Options: --crx <file>     the agent CRX to ship (default: astro-agent.crx of the latest release)
#          --server <file>  a new browseros_server for macOS (default: keep the server of the latest release)
#          --notes <file>   release notes (default: release-notes/v<version>.md, must exist and be committed)
#
# Steps:
#   1. checks: macOS, gh logged in, bun, branch main, clean tree, main = origin/main, the version is newer
#      than the latest release, no tag or release v<version> yet, the Developer ID, the notary profile and
#      the update key are in the keychain, free disk.
#   2. macOS: download the latest release's Astro.dmg, re-cut it (astro-recut.ts: CRX, version, Sparkle on
#      with Astro's public update key), sign with the Developer ID, notarize and staple the app, build the
#      dmg, sign, notarize and staple it, then sign the dmg with the update key (astro-update.macos.json).
#   3. Windows: run the build workflow (astro-qa-windows: release-windows-astro-private.yml) at this commit.
#      It makes Astro-Setup.exe and Astro-Update.exe and signs the update package with the update key
#      (secret ASTRO_UPDATE_KEY). The script waits for it and downloads the artifact.
#   4. join: astro-update.json (both signatures), SHA256SUMS.txt.
#   5. verify, on this Mac: both update signatures with Astro's public key; in the dmg: version,
#      CFBundleVersion 10001.<version>, bundle ID, codesign --verify --deep --strict, Developer ID + team,
#      Gatekeeper (Notarized Developer ID), staple, Sparkle keys, the feed address, no upstream feed.
#   6. draft release with the 6 files; download them back and compare every sha256.
#   7. publish: only when every check passed (the tag v<version> is made at this commit, marked latest).
#      Then it reads publik's two feeds until they offer the new version (publik caches for 15 minutes).
# Any failed check stops the script before step 7. Run it again with the same version: finished steps are
# kept (work folder). It starts no app and prints no secret.
#
# Env: PUBLIK_RELEASE_WORK (work folder, default $TMPDIR/publik-release-astro),
#      PUBLIK_RELEASE_MIN_FREE_MB (free disk needed to start, default 4000),
#      ASTRO_WIN_REPO / ASTRO_WIN_REF / ASTRO_WIN_WORKFLOW (where the Windows build runs).
set -euo pipefail

REPO=Blueturboguy07/Astro
BUNDLE_ID=com.browseros.BrowserOS
TEAM_ID=R5R3ZS54LV
DEV_ID="Developer ID Application: Mann Bellani ($TEAM_ID)"
NOTARY_PROFILE=publik
KEY_SERVICE=astro-update-key
FEED_MAC=https://publikhq.com/astro/up/mac.xml
FEED_WIN=https://publikhq.com/astro/up/w
WIN_REPO="${ASTRO_WIN_REPO:-Blueturboguy07/astro-qa-windows}"
WIN_REF="${ASTRO_WIN_REF:-feat/updater}"
WIN_WORKFLOW="${ASTRO_WIN_WORKFLOW:-release-windows-astro-private.yml}"
ASSETS="Astro.dmg Astro-Setup.exe Astro-Update.exe astro-update.json astro-agent.crx SHA256SUMS.txt"

usage() { sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 2; }
[ $# -ge 1 ] || usage
VERSION="$1"; shift
MODE=release; CRX=""; SERVER=""; NOTES=""
while [ $# -gt 0 ]; do
  case "$1" in
    --no-publish) MODE=draft ;;
    --verify-only) MODE=verify ;;
    --crx) CRX="$2"; shift ;;
    --server) SERVER="$2"; shift ;;
    --notes) NOTES="$2"; shift ;;
    *) usage ;;
  esac
  shift
done
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "version must look like 1.2.3"; exit 2; }
TAG="v$VERSION"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REL="$ROOT/packages/browseros-agent/scripts/release"
WORK="${PUBLIK_RELEASE_WORK:-${TMPDIR:-/tmp}/publik-release-astro}/$VERSION"
mkdir -p "$WORK"
OKS=0; FAILS=0
ok()   { OKS=$((OKS+1)); echo "ok    $*"; }
fail() { FAILS=$((FAILS+1)); echo "FAIL  $*"; }
check() { if [ "$2" = 1 ]; then ok "$1${3:+ ($3)}"; else fail "$1${3:+ ($3)}"; fi; }
is() { [ "$1" = "$2" ] && echo 1 || echo 0; }
has() { case "$1" in *"$2"*) echo 1 ;; *) echo 0 ;; esac; }   # has <text> <part>
die() { echo "STOP  $*" >&2; exit 1; }
step() { echo; echo "=== $*"; }
done_mark() { [ -f "$WORK/$1.done" ]; }
mark() { touch "$WORK/$1.done"; }
update_key() { security find-generic-password -s "$KEY_SERVICE" -a private -w; }   # never echo the result
plist() { /usr/libexec/PlistBuddy -c "Print :$2" "$1/Contents/Info.plist" 2>/dev/null || true; }
newer() { [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -t. -k1,1n -k2,2n -k3,3n | tail -1)" = "$1" ]; }

# verify_files <dir>: the checks of step 5 on the 6 files in <dir>.
verify_files() {
  local D="$1" f mnt app fw pub
  for f in $ASSETS; do check "file is there: $f" "$([ -s "$D/$f" ] && echo 1 || echo 0)"; done
  [ "$FAILS" = 0 ] || return 0
  check "SHA256SUMS.txt agrees with the files" "$( (cd "$D" && shasum -a 256 -c SHA256SUMS.txt >/dev/null 2>&1) && echo 1 || echo 0)"
  python3 - "$D/astro-update.json" "$VERSION" > "$WORK/manifest.txt" <<'PY'
import json, sys
d = json.load(open(sys.argv[1])); v = sys.argv[2]
print(d.get("app_version", "")); print(d.get("update_version", ""))
for k in ("macos", "windows"):
    e = d.get(k) or {}
    print(e.get("file", "")); print(e.get("length", "")); print(e.get("ed_signature", ""))
PY
  { read -r m_app; read -r m_upd; read -r m_mfile; read -r m_mlen; read -r m_msig; read -r m_wfile; read -r m_wlen; read -r m_wsig; } < "$WORK/manifest.txt"
  rm -f "$WORK/manifest.txt"
  check "astro-update.json: app_version $VERSION" "$(is "$m_app" "$VERSION")" "$m_app"
  check "astro-update.json: update_version 10001.$VERSION" "$(is "$m_upd" "10001.$VERSION")" "$m_upd"
  check "astro-update.json: macOS file Astro.dmg with its true size" "$( [ "$m_mfile" = Astro.dmg ] && [ "$m_mlen" = "$(stat -f%z "$D/Astro.dmg")" ] && echo 1 || echo 0)"
  check "astro-update.json: Windows file Astro-Update.exe with its true size" "$( [ "$m_wfile" = Astro-Update.exe ] && [ "$m_wlen" = "$(stat -f%z "$D/Astro-Update.exe")" ] && echo 1 || echo 0)"
  pub="$(security find-generic-password -s "$KEY_SERVICE" -a public -w 2>/dev/null || true)"
  check "the update signature of Astro.dmg is good (Astro's key)" "$(ASTRO_UPDATE_PUBLIC_KEY="$pub" bun "$REL/astro-update.ts" verify --file "$D/Astro.dmg" --sig "$m_msig" >/dev/null 2>&1 && echo 1 || echo 0)"
  check "the update signature of Astro-Update.exe is good (Astro's key)" "$(ASTRO_UPDATE_PUBLIC_KEY="$pub" bun "$REL/astro-update.ts" verify --file "$D/Astro-Update.exe" --sig "$m_wsig" >/dev/null 2>&1 && echo 1 || echo 0)"
  local dgk; dgk="$(spctl -a -t open --context context:primary-signature -vv "$D/Astro.dmg" 2>&1 || true)"
  check "Astro.dmg: Gatekeeper accepts it" "$(has "$dgk" "Notarized Developer ID")"
  check "Astro.dmg: the notarization ticket is stapled" "$(xcrun stapler validate "$D/Astro.dmg" >/dev/null 2>&1 && echo 1 || echo 0)"
  mnt="$WORK/verify-mnt"; mkdir -p "$mnt"
  hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$mnt" "$D/Astro.dmg" >/dev/null
  app="$mnt/Astro.app"
  check "dmg: holds Astro.app and a link to /Applications" "$( [ -d "$app" ] && [ -L "$mnt/Applications" ] && echo 1 || echo 0)"
  check "app: version $VERSION" "$(is "$(plist "$app" CFBundleShortVersionString)" "$VERSION")" "$(plist "$app" CFBundleShortVersionString)"
  check "app: CFBundleVersion 10001.$VERSION (what Sparkle compares)" "$(is "$(plist "$app" CFBundleVersion)" "10001.$VERSION")" "$(plist "$app" CFBundleVersion)"
  check "app: bundle ID $BUNDLE_ID" "$(is "$(plist "$app" CFBundleIdentifier)" "$BUNDLE_ID")"
  check "app: codesign --verify --deep --strict" "$(codesign --verify --deep --strict "$app" >/dev/null 2>&1 && echo 1 || echo 0)"
  # Capture first: `tool | grep -q` fails by chance under pipefail (grep closes the pipe early).
  local sig gk
  sig="$(codesign -dvv "$app" 2>&1 || true)"; gk="$(spctl -a -t exec -vv "$app" 2>&1 || true)"
  check "app: signed by $DEV_ID" "$(has "$sig" "Authority=$DEV_ID")"
  check "app: hardened runtime" "$(has "$sig" "(runtime)")"
  check "app: Gatekeeper accepts it (Notarized Developer ID)" "$(has "$gk" "Notarized Developer ID")"
  check "app: the notarization ticket is stapled" "$(xcrun stapler validate "$app" >/dev/null 2>&1 && echo 1 || echo 0)"
  check "app: automatic update checks are on" "$(is "$(plist "$app" SUEnableAutomaticChecks)" true)"
  check "app: SUPublicEDKey is Astro's public key" "$( [ -n "$pub" ] && [ "$(plist "$app" SUPublicEDKey)" = "$(ASTRO_UPDATE_KEY="$(update_key)" bun "$REL/astro-update.ts" public-key)" ] && echo 1 || echo 0)"
  fw="$(ls -d "$app/Contents/Frameworks/BrowserOS Framework.framework/Versions/"*/"BrowserOS Framework" | head -n 1)"
  check "framework: asks publik's feed" "$(LC_ALL=C grep -a -c 'https://publikhq.com/astro/up/mac' "$fw" | awk '{print ($1>=1)?1:0}')"
  check "framework: no upstream feed" "$(LC_ALL=C grep -a -c 'cdn.browseros.com/appcast' "$fw" | awk '{print ($1==0)?1:0}')"
  check "framework: Astro's extension ID, not upstream's" "$( [ "$(LC_ALL=C grep -a -c kofbmbngmnnpmopgbhpbajhnnnoflolg "$fw")" -ge 1 ] && [ "$(LC_ALL=C grep -a -c bflpfmnmnokmjhmgnolecpppdbdophmk "$fw")" = 0 ] && echo 1 || echo 0)"
  hdiutil detach "$mnt" >/dev/null || true
}

download_release() { # <dir>: every asset of the release, fresh
  rm -rf "$1"; mkdir -p "$1"
  gh release download "$TAG" -R "$REPO" -D "$1" >/dev/null
}

# ---------------------------------------------------------------------------------------------------------
if [ "$MODE" = verify ]; then
  step "verify the release $TAG"
  download_release "$WORK/back"
  verify_files "$WORK/back"
  rm -rf "$WORK/back"
  echo; echo "$OKS ok, $FAILS FAIL"; [ "$FAILS" = 0 ]; exit
fi

step "1. checks"
[ "$(uname)" = Darwin ] || die "macOS only"
command -v gh >/dev/null && gh auth status >/dev/null 2>&1 || die "gh is not logged in"
command -v bun >/dev/null || die "bun is missing"
cd "$ROOT"
[ "$(git branch --show-current)" = main ] || die "not on branch main"
[ -z "$(git status --porcelain)" ] || die "the tree is not clean"
git fetch -q origin main --tags
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || die "main is not origin/main"
COMMIT="$(git rev-parse HEAD)"
NOTES="${NOTES:-$ROOT/release-notes/$TAG.md}"
[ -s "$NOTES" ] || die "release notes are missing: $NOTES"
grep -q '^## Windows and Linux' "$NOTES" || die "the notes must end with a '## Windows and Linux' section (RELEASING.md §8)"
PREV_TAG="$(gh release list -R "$REPO" --exclude-drafts --exclude-pre-releases --limit 1 --json tagName -q '.[0].tagName')"
PREV="${PREV_TAG#v}"
newer "$VERSION" "$PREV" || die "$VERSION is not newer than the latest release $PREV"
[ -z "$(git ls-remote --tags origin "refs/tags/$TAG")" ] || die "the tag $TAG exists"
[ "$(gh release view "$TAG" -R "$REPO" --json isDraft -q .isDraft 2>/dev/null || true)" != false ] || die "the release $TAG is public"
case "$(security find-identity -v -p codesigning)" in *"$DEV_ID"*) ;; *) false;; esac || die "the Developer ID is not in the keychain"
security find-generic-password -s "$KEY_SERVICE" -a private >/dev/null 2>&1 || die "the update key is not in the keychain ($KEY_SERVICE)"
xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1 || die "the notary profile '$NOTARY_PROFILE' is missing"
FREE="$(df -m "$WORK" | awk 'NR==2{print $4}')"
[ "$FREE" -ge "${PUBLIK_RELEASE_MIN_FREE_MB:-4000}" ] || die "only $FREE MB free"
ok "checks passed: $VERSION after $PREV, commit ${COMMIT:0:7}, $FREE MB free"

OUT="$WORK/out"; mkdir -p "$OUT"
if [ ! -s "$OUT/astro-agent.crx" ]; then
  if [ -n "$CRX" ]; then cp "$CRX" "$OUT/astro-agent.crx"; else gh release download "$PREV_TAG" -R "$REPO" -p astro-agent.crx -D "$OUT" >/dev/null; fi
fi
CRX_VERSION="$(python3 - "$OUT/astro-agent.crx" <<'PY'
import io, json, struct, sys, zipfile
b = open(sys.argv[1], "rb").read()
assert b[:4] == b"Cr24", "not a CRX"
n = struct.unpack("<I", b[8:12])[0]
print(json.load(zipfile.ZipFile(io.BytesIO(b[12 + n:])).open("manifest.json"))["version"])
PY
)"
ok "agent CRX version $CRX_VERSION"

step "2. macOS: re-cut, sign, notarize, dmg"
APP="$WORK/mac/Astro.app"
if ! done_mark recut; then
  rm -rf "$WORK/mac" "$WORK/src-mnt"; mkdir -p "$WORK/src-mnt"
  [ -s "$WORK/src.dmg" ] || gh release download "$PREV_TAG" -R "$REPO" -p Astro.dmg -O "$WORK/src.dmg" >/dev/null
  hdiutil attach -nobrowse -readonly -noautoopen -mountpoint "$WORK/src-mnt" "$WORK/src.dmg" >/dev/null
  PUB="$(ASTRO_UPDATE_KEY="$(update_key)" bun "$REL/astro-update.ts" public-key)"
  set +e
  bun "$REL/astro-recut.ts" --source "$WORK/src-mnt/Astro.app" --crx "$OUT/astro-agent.crx" --out "$WORK/mac" \
    --app-version "$VERSION" --sparkle enable --sparkle-ed-key "$PUB" ${SERVER:+--server "$SERVER"} --sign > "$WORK/recut.log" 2>&1
  RC=$?
  set -e
  hdiutil detach "$WORK/src-mnt" >/dev/null || true
  [ "$RC" = 0 ] || { tail -20 "$WORK/recut.log"; die "the re-cut failed (log: $WORK/recut.log)"; }
  rm -f "$WORK/src.dmg"
  mark recut
fi
codesign --verify --deep --strict "$APP" || die "the re-cut app's signature is not valid"
ok "re-cut app signed"
if ! done_mark app-stapled; then
  ditto -c -k --keepParent "$APP" "$WORK/app.zip"
  xcrun notarytool submit "$WORK/app.zip" --keychain-profile "$NOTARY_PROFILE" --wait > "$WORK/notary-app.log" 2>&1 || { tail -8 "$WORK/notary-app.log"; die "notarization of the app failed"; }
  grep -q 'status: Accepted' "$WORK/notary-app.log" || { tail -8 "$WORK/notary-app.log"; die "Apple did not accept the app"; }
  rm -f "$WORK/app.zip"
  xcrun stapler staple "$APP" >/dev/null
  mark app-stapled
fi
ok "app notarized and stapled"
if ! done_mark dmg; then
  rm -rf "$WORK/stage" "$OUT/Astro.dmg"; mkdir "$WORK/stage"
  ditto --clone "$APP" "$WORK/stage/Astro.app"
  ln -s /Applications "$WORK/stage/Applications"
  hdiutil create -quiet -volname Astro -srcfolder "$WORK/stage" -ov -format UDZO "$OUT/Astro.dmg"
  rm -rf "$WORK/stage"
  codesign --force --timestamp --sign "$DEV_ID" "$OUT/Astro.dmg"
  xcrun notarytool submit "$OUT/Astro.dmg" --keychain-profile "$NOTARY_PROFILE" --wait > "$WORK/notary-dmg.log" 2>&1 || { tail -8 "$WORK/notary-dmg.log"; die "notarization of the dmg failed"; }
  grep -q 'status: Accepted' "$WORK/notary-dmg.log" || { tail -8 "$WORK/notary-dmg.log"; die "Apple did not accept the dmg"; }
  xcrun stapler staple "$OUT/Astro.dmg" >/dev/null
  ASTRO_UPDATE_KEY="$(update_key)" bun "$REL/astro-update.ts" manifest --app-version "$VERSION" --mac "$OUT/Astro.dmg" --out "$WORK/astro-update.macos.json" >/dev/null
  rm -rf "$WORK/mac"
  mark dmg
fi
ok "dmg notarized, stapled and signed with the update key"

step "3. Windows: build on GitHub ($WIN_REPO)"
if ! done_mark windows; then
  RUN_ID="$(cat "$WORK/win-run-id" 2>/dev/null || true)"
  if [ -z "$RUN_ID" ]; then
    BEFORE="$(gh run list -R "$WIN_REPO" --workflow "$WIN_WORKFLOW" --limit 1 --json databaseId -q '.[0].databaseId // 0')"
    gh workflow run "$WIN_WORKFLOW" -R "$WIN_REPO" --ref "$WIN_REF" -f version="$CRX_VERSION" -f app_version="$VERSION" \
      -f release_tag="$COMMIT" -f agent_crx_url="https://github.com/$REPO/releases/download/$PREV_TAG/astro-agent.crx" >/dev/null
    for _ in $(seq 1 30); do
      sleep 5
      RUN_ID="$(gh run list -R "$WIN_REPO" --workflow "$WIN_WORKFLOW" --limit 1 --json databaseId -q '.[0].databaseId // 0')"
      [ "$RUN_ID" != "$BEFORE" ] && break
      RUN_ID=""
    done
    [ -n "$RUN_ID" ] || die "the Windows run did not start"
    echo "$RUN_ID" > "$WORK/win-run-id"
  fi
  echo "waiting for the Windows run $RUN_ID (about 45 minutes)"
  gh run watch "$RUN_ID" -R "$WIN_REPO" --interval 60 >/dev/null 2>&1 || true
  ART="Astro-Setup-$VERSION"
  rm -rf "$WORK/win"
  if ! gh run download "$RUN_ID" -R "$WIN_REPO" -n "$ART" -D "$WORK/win" >/dev/null 2>&1; then
    rm -f "$WORK/win-run-id"
    die "the Windows run $RUN_ID has no artifact $ART (conclusion: $(gh run view "$RUN_ID" -R "$WIN_REPO" --json conclusion -q .conclusion)). Run the script again: it starts a new run."
  fi
  (cd "$WORK/win" && shasum -a 256 -c Astro-Setup.exe.sha256 >/dev/null) || die "Astro-Setup.exe does not match its sha256"
  for f in Astro-Setup.exe Astro-Update.exe astro-update.windows.json; do [ -s "$WORK/win/$f" ] || die "the Windows artifact has no $f"; done
  mv "$WORK/win/Astro-Setup.exe" "$WORK/win/Astro-Update.exe" "$OUT/"
  mv "$WORK/win/astro-update.windows.json" "$WORK/"
  rm -rf "$WORK/win"
  mark windows
fi
ok "Windows installer and update package"

step "4. join"
bun "$REL/astro-update.ts" merge --out "$OUT/astro-update.json" "$WORK/astro-update.windows.json" "$WORK/astro-update.macos.json" >/dev/null
(cd "$OUT" && shasum -a 256 Astro.dmg Astro-Setup.exe Astro-Update.exe astro-agent.crx astro-update.json > SHA256SUMS.txt)
ok "astro-update.json and SHA256SUMS.txt"

step "5. verify the files"
verify_files "$OUT"
[ "$FAILS" = 0 ] || { echo; echo "$OKS ok, $FAILS FAIL"; die "a check failed: nothing was uploaded"; }

step "6. draft release, read back"
if ! gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then
  (cd "$OUT" && gh release create "$TAG" $ASSETS -R "$REPO" --draft --target "$COMMIT" --title "Astro $VERSION" --notes-file "$NOTES" >/dev/null)
else
  (cd "$OUT" && gh release upload "$TAG" $ASSETS -R "$REPO" --clobber >/dev/null)
fi
download_release "$WORK/back"
SAME=1
for f in $ASSETS; do [ "$(shasum -a 256 < "$OUT/$f")" = "$(shasum -a 256 < "$WORK/back/$f" 2>/dev/null)" ] || SAME=0; done
rm -rf "$WORK/back"
check "the draft holds the same 6 files (sha256)" "$SAME"
[ "$FAILS" = 0 ] || { echo; echo "$OKS ok, $FAILS FAIL"; die "the draft is not right: not published"; }

if [ "$MODE" = draft ]; then
  echo; echo "$OKS ok, 0 FAIL"; echo "--no-publish: the draft $TAG stays. Run again without --no-publish to publish it."
  exit 0
fi

step "7. publish"
gh release edit "$TAG" -R "$REPO" --draft=false --latest >/dev/null
check "the release $TAG is public and latest" "$( [ "$(gh release view "$TAG" -R "$REPO" --json isDraft -q .isDraft 2>/dev/null || true)" = false ] && [ "$(gh api "repos/$REPO/releases/latest" -q .tag_name 2>/dev/null || true)" = "$TAG" ] && echo 1 || echo 0)"
echo "waiting for publik's feeds (they follow the latest release within 15 minutes)"
FEEDS=0
for _ in $(seq 1 40); do
  M="$(curl -fsS "$FEED_MAC" 2>/dev/null | grep -c "10001.$VERSION" || true)"
  W="$(curl -fsS "$FEED_WIN/$PREV" 2>/dev/null | grep -c "releases/download/$TAG/Astro-Update.exe" || true)"
  if [ "${M:-0}" -ge 1 ] && [ "${W:-0}" -ge 1 ]; then FEEDS=1; break; fi
  sleep 30
done
check "publik's macOS and Windows feeds offer $VERSION" "$FEEDS"
echo; echo "$OKS ok, $FAILS FAIL"
[ "$FAILS" = 0 ]
