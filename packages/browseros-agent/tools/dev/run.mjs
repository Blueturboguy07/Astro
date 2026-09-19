#!/usr/bin/env bun
// Cross-platform launcher for the browseros-dev CLI (this directory).
//
// This used to be done by run.sh, a bash script invoked directly as
// "./tools/dev/run.sh <args>" from package.json. That only works on a
// platform that can execute a file via its `#!` shebang line -- macOS,
// Linux, WSL, git-bash. Native Windows PowerShell has no such mechanism,
// and bun's own cross-platform script runner does not add one: it can
// only resolve programs Windows itself treats as executable (PATHEXT:
// .exe/.cmd/.bat/.ps1/etc), so "./tools/dev/run.sh" fails at command
// RESOLUTION with "bun: command not found: ./tools/dev/run.sh" before a
// single byte of the script is ever read. See fix/astro-windows-native-run-unix-only.
//
// This file does the same three things run.sh did, using bun's
// cross-platform child_process APIs (which work identically on macOS,
// Linux, and Windows) instead of POSIX shell builtins, so it can be
// invoked directly by `bun run <script>` on every platform. run.sh itself
// is left in place, unchanged, for anyone invoking it manually from a
// POSIX shell.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

// Resolves `cmd` to an absolute executable path by walking process.env.PATH
// ourselves, the same search `command -v go` (run.sh's original check) does
// on POSIX -- instead of handing the bare name to spawnSync and trusting its
// own PATH/extension resolution.
//
// This matters specifically on native Windows: a real windows-latest CI run
// (fix/astro-windows-native-run-unix-only cycle 2, run
// https://github.com/Blueturboguy07/Astro/actions/runs/35431616535) showed
// `spawnSync("go", ["--version"], { stdio: "ignore" })` reporting ENOENT
// (commandExists() false, "Go is required... but is not installed") even
// though `go version` succeeded moments earlier in the same job/PATH
// (go1.24.13 windows/amd64) -- i.e. bun's bare-name child_process resolution
// does not reliably find a real go.exe on PATH on Windows the way invoking
// through a shell does. Resolving the full path ourselves and handing
// spawnSync that absolute path sidesteps whatever internal resolution gap
// caused that, on every platform, without depending on it.
function resolveExecutable(cmd) {
  const pathDirs = (process.env.PATH ?? process.env.Path ?? "")
    .split(delimiter)
    .filter(Boolean);
  // POSIX: the bare name is the executable itself (no extension). Windows:
  // try PATHEXT's extensions (.EXE, .CMD, .BAT, ...) in order, the same set
  // cmd.exe / CreateProcess would; also try the bare name last in case `cmd`
  // already includes its extension.
  const exts =
    process.platform === "win32"
      ? [...(process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";").filter(Boolean), ""]
      : [""];
  for (const dir of pathDirs) {
    for (const ext of exts) {
      const candidate = join(dir, cmd + ext);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

const goPath = resolveExecutable("go");
if (!goPath) {
  console.error("");
  console.error("  Go is required to build browseros-dev but is not installed.");
  console.error("  macOS/Linux (Homebrew): brew install go");
  console.error("  Windows (winget):       winget install GoLang.Go");
  console.error("  Any platform:           https://go.dev/dl/");
  console.error("");
  process.exit(1);
}

// Mirrors run.sh's needs_cargo logic: only dev:claw-rust:watch (watch with
// both --claw and --rust) needs Cargo.
const needsCargo =
  args[0] === "watch" && args.includes("--claw") && args.includes("--rust");

if (needsCargo && !resolveExecutable("cargo")) {
  console.error("");
  console.error("  Cargo is required for dev:claw-rust:watch but is not installed.");
  console.error("  Install Rust with:  brew install rustup && rustup-init");
  console.error("  Or download from: https://rustup.rs/");
  console.error("");
  process.exit(1);
}

// Built directly with `go build` rather than `make` -- `make` was an
// undocumented prerequisite (SETUP.md's toolchain table never lists it, and
// it isn't installed by default on Windows). Go's own build cache already
// skips recompiling when nothing under DIR changed, so this stays fast
// without a Makefile's mtime check.
const binName = process.platform === "win32" ? "browseros-dev.exe" : "browseros-dev";
const build = spawnSync(goPath, ["build", "-o", binName, "."], {
  cwd: DIR,
  stdio: "inherit",
});
if (build.error) {
  console.error(`Failed to run "go build": ${build.error.message}`);
  process.exit(1);
}
if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const binPath = join(DIR, binName);
if (!existsSync(binPath)) {
  console.error(`"go build" reported success but ${binPath} does not exist`);
  process.exit(1);
}

const run = spawnSync(binPath, args, { stdio: "inherit" });
if (run.error) {
  console.error(`Failed to run ${binPath}: ${run.error.message}`);
  process.exit(1);
}
// A negative status means the child was killed by a signal (POSIX only);
// mirror the shell convention of exiting 128+signal in that case.
process.exit(run.status ?? (run.signal ? 128 : 1));
