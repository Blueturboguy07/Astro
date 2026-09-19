#!/usr/bin/env bash
# Runs INSIDE a real WSL distro on a windows-latest GitHub runner.
# Cluster: astro-wsl-simplicity-db-module-not-found
#
# Reproduces exactly what the Aug 6 reporter did: the Astro guide's Windows
# branch clones into ~/Astro (C:\Users\<user>\Astro) from PowerShell, but
# `bun run dev:watch` is `./tools/dev/run.sh watch` -- a bash script that
# native PowerShell cannot execute -- so the reporter ran the bun steps from
# WSL against the SAME Windows folder, seen as /mnt/c/Users/<user>/Astro.
# Their server then died at boot with:
#   [server] error: Cannot find module '../../../../lib/simplicity/db' from
#   '/mnt/c/Users/keint/Astro/packages/browseros-agent/apps/server/src/api/routes/simplicity/chats/route.ts'
#
# Prints BUGFIX_LAB_PRESENT / BUGFIX_LAB_ABSENT and exits 1 / 0.
# Exit 2 = could not run (inconclusive).

set -u

TARGET_ERR="Cannot find module '../../../../lib/simplicity/db'"
BUN_VERSION_TAG="${BUN_VERSION_TAG:-bun-v1.3.6}"   # guide step 4 pins Bun 1.3.6
SERVER_TIMEOUT="${SERVER_TIMEOUT:-90}"

inconclusive() { echo "BUGFIX_LAB_INCONCLUSIVE: $1"; exit 2; }

PATH_FILE="/mnt/c/astro-wsl-path.txt"
[ -f "$PATH_FILE" ] || inconclusive "missing $PATH_FILE (clone step did not run)"
REPO="$(tr -d '\r\n' < "$PATH_FILE")"
[ -d "$REPO/.git" ] || inconclusive "no git repo at $REPO"

AGENT="$REPO/packages/browseros-agent"
SERVER="$AGENT/apps/server"

echo "================ WSL environment ================"
uname -a
head -3 /etc/os-release
echo "WSL_DISTRO_NAME=${WSL_DISTRO_NAME:-<unset>}"
echo "WSL_INTEROP=${WSL_INTEROP:-<unset>}"
echo "-- wsl kernel/version marker --"
if [ -f /proc/sys/kernel/osrelease ]; then cat /proc/sys/kernel/osrelease; fi
echo "-- repo mount (must be DrvFS/9p on /mnt/c, like the reporter's) --"
df -T "$REPO" 2>/dev/null | tail -2 || df "$REPO" | tail -2
mount | grep -E ' /mnt/c ' || true
echo "repo path: $REPO"
case "$REPO" in
  /mnt/c/*) echo "path-shape: OK, repo is under /mnt/c (matches reporter)";;
  *) inconclusive "repo is not under /mnt/c ($REPO)";;
esac

echo
echo "================ git tree facts ================"
cd "$REPO" || inconclusive "cannot cd $REPO"
echo "-- git rev-parse HEAD --"; git rev-parse HEAD
echo "-- git log -1 --oneline --"; git log -1 --oneline
MODREL="packages/browseros-agent/apps/server/src/lib/simplicity/db"
echo "-- git check-ignore -v $MODREL --"
CHECK_IGNORE_OUT="$(git check-ignore -v "$MODREL" 2>&1)"
CHECK_IGNORE_EXIT=$?
echo "${CHECK_IGNORE_OUT:-<no match>}"
echo "check_ignore_exit=$CHECK_IGNORE_EXIT  (0 = path IS ignored -> module excluded from tree)"
echo "-- ls of the module dir --"
ls -la "$SERVER/src/lib/simplicity/" 2>&1 || true
echo "-- apps/server/.gitignore --"
cat "$SERVER/.gitignore" 2>&1 || true

echo
echo "================ bun (installed inside WSL) ================"
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install -o /tmp/bun-install.sh || inconclusive "could not download bun installer"
  SHELL=/bin/bash bash /tmp/bun-install.sh "$BUN_VERSION_TAG" >/tmp/bun-setup.log 2>&1
  echo "bun installer exit=$?"; tail -8 /tmp/bun-setup.log
fi
command -v bun >/dev/null 2>&1 || inconclusive "bun not on PATH after install (see /tmp/bun-setup.log)"
BUN_V="$(bun --version 2>&1)"; BUN_V_EXIT=$?
echo "bun --version -> $BUN_V (exit $BUN_V_EXIT)"
[ "$BUN_V_EXIT" -eq 0 ] || inconclusive "bun cannot execute in this WSL distro (WSL1 glibc/syscall limits?): $BUN_V"

echo
echo "================ guide step 8: copy the env file ================"
cd "$AGENT" || inconclusive "cannot cd $AGENT"
if [ ! -f .env.development ]; then
  cp .env.development.example .env.development && echo "cp .env.development.example .env.development -> ok"
fi

run_server() {
  local label="$1" log="$2"
  cd "$SERVER" || inconclusive "cannot cd $SERVER"
  echo "-- [$label] cd apps/server && bun --env-file=../../.env.development src/index.ts --config ../../config.dev.json --"
  timeout "$SERVER_TIMEOUT" bun --env-file=../../.env.development src/index.ts \
      --config ../../config.dev.json > "$log" 2>&1
  local rc=$?
  echo "server exit=$rc  (124 = still running when the timer fired)"
  echo "---- server output ----"
  cat "$log"
  echo "---- end server output ----"
  return $rc
}

echo
echo "================ PHASE A: boot the server with no deps installed ================"
echo "(a module missing from the git tree fails resolution before node_modules is ever consulted)"
run_server "phase-a" /tmp/server-a.log
RC_A=$?
if grep -qF "$TARGET_ERR" /tmp/server-a.log; then
  echo
  echo "BUGFIX_LAB_PRESENT"
  echo "evidence: reported error text reproduced verbatim from a real WSL shell at $REPO"
  grep -F "$TARGET_ERR" /tmp/server-a.log | head -3
  exit 1
fi

echo
echo "================ PHASE B: guide step 9 (bun install), then boot again ================"
cd "$AGENT" || inconclusive "cannot cd $AGENT"
echo "-- bun install (this is slow over the Windows drive mount) --"
START=$(date +%s)
bun install > /tmp/bun-install-deps.log 2>&1
INSTALL_RC=$?
echo "bun install exit=$INSTALL_RC in $(( $(date +%s) - START ))s"
tail -12 /tmp/bun-install-deps.log
[ "$INSTALL_RC" -eq 0 ] || inconclusive "bun install failed under WSL (see log above) -- cannot reach a clean-boot verdict"

run_server "phase-b" /tmp/server-b.log
RC_B=$?
if grep -qF "$TARGET_ERR" /tmp/server-b.log; then
  echo
  echo "BUGFIX_LAB_PRESENT"
  grep -F "$TARGET_ERR" /tmp/server-b.log | head -3
  exit 1
fi

# Clean boot: either it stayed up until the timer (124) or it exited 0.
if [ "$RC_B" -eq 124 ] || [ "$RC_B" -eq 0 ]; then
  echo
  echo "BUGFIX_LAB_ABSENT"
  echo "evidence: the server imported the whole route tree (including"
  echo "apps/server/src/lib/simplicity/db) and stayed up under WSL at $REPO"
  exit 0
fi

echo
inconclusive "server exited $RC_B for a reason unrelated to the reported module (see output above)"
