#!/bin/bash
set -e

DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v go &>/dev/null; then
  echo ""
  echo "  Go is required to build browseros-dev but is not installed."
  echo "  macOS/Linux (Homebrew): brew install go"
  echo "  Windows (winget):       winget install GoLang.Go"
  echo "  Any platform:           https://go.dev/dl/"
  echo ""
  exit 1
fi

needs_cargo=false
has_claw=false
has_rust=false
if [ "${1:-}" = "watch" ]; then
  for arg in "$@"; do
    case "$arg" in
      --claw)
        has_claw=true
        ;;
      --rust)
        has_rust=true
        ;;
    esac
  done
  if [ "$has_claw" = true ] && [ "$has_rust" = true ]; then
    needs_cargo=true
  fi
fi

if [ "$needs_cargo" = true ] && ! command -v cargo &>/dev/null; then
  echo ""
  echo "  Cargo is required for dev:claw-rust:watch but is not installed."
  echo "  Install Rust with:  brew install rustup && rustup-init"
  echo "  Or download from: https://rustup.rs/"
  echo ""
  exit 1
fi

# Built directly with `go build` rather than `make` — `make` was an
# undocumented prerequisite (SETUP.md's toolchain table never lists it, and
# it isn't installed by default on Windows). Go's own build cache already
# skips recompiling when nothing under $DIR changed, so this stays fast
# without the Makefile's mtime check.
(cd "$DIR" && go build -o browseros-dev .)
exec "$DIR/browseros-dev" "$@"
