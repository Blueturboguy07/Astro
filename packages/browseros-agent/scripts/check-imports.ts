/**
 * Case-sensitive import resolver check.
 *
 * macOS's default filesystem is case-insensitive, so `import x from './Foo'`
 * silently resolves even when the file on disk is `./foo.ts` — and so does
 * an import whose relative `../..` depth is wrong but happens to still land
 * on an existing directory. Linux/WSL (and therefore CI and every user who
 * builds on Linux/WSL, per SETUP.md) are case-sensitive and the same import
 * throws `Cannot find module` at runtime, or "file not found" from `tsc`.
 * `tsc --noEmit` (`bun run typecheck`) already has
 * `forceConsistentCasingInFileNames: true` and would catch this too, but its
 * project-reference graph doesn't cover every workspace, and there wasn't a
 * fast, dependency-free way to run the same check from a plain `bun` script
 * (e.g. as a pre-push hook) — see `packages/browseros-agent/apps/server/src
 * /lib/simplicity/db` for the bug this exists to prevent from recurring.
 *
 * Every static/dynamic relative import is found with Bun's own transpiler
 * (`Bun.Transpiler#scan`, AST-based — not a regex, so string/template
 * literals that merely *look* like import statements are never mistaken for
 * real ones), then re-resolved byte-for-byte against the real directory
 * entries via `readdirSync`, which catches wrong case AND wrong path depth
 * regardless of which OS this runs on.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'])
// A literal `.js`/`.jsx`/`.mjs`/`.cjs` specifier is also allowed to resolve
// to a same-named `.ts`/`.tsx`/`.mts`/`.cts` file (NodeNext/Node16 ESM
// convention: source keeps the post-compile extension in the specifier).
const RESOLVE_EXT = ['', '.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.json']
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.turbo',
  'target',
  'third_party',
  '.wxt',
  '.output',
  'coverage',
])

export interface ImportProblem {
  file: string
  specifier: string
  reason: string
}

function walk(dir: string, onFile: (file: string) => void) {
  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, onFile)
    } else if (entry.isFile() && SOURCE_EXT.has(extname(entry.name))) {
      onFile(full)
    }
  }
}

function loaderFor(file: string): 'ts' | 'tsx' | 'jsx' {
  const ext = extname(file)
  if (ext === '.tsx') return 'tsx'
  if (ext === '.jsx') return 'jsx'
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') return 'ts'
  return 'jsx' // .js/.mjs/.cjs: allow JSX syntax too, same as Bun's default loose loader
}

/** Extracts every static/dynamic relative import specifier via Bun's transpiler (AST-based, not regex). */
function extractRelativeSpecifiers(file: string, src: string): string[] {
  const transpiler = new Bun.Transpiler({ loader: loaderFor(file) })
  const { imports } = transpiler.scan(src)
  return imports
    .map((i) => i.path)
    .filter((p) => p.startsWith('./') || p.startsWith('../'))
}

/**
 * Finds the real on-disk name for `segment` in `dir`. Tries an exact match
 * first, then falls back to a case-insensitive scan — the fallback is what
 * lets the caller tell "case mismatch" apart from "genuinely doesn't
 * exist" instead of collapsing both into the same generic error.
 */
function findEntry(dir: string, segment: string): string | null {
  let entries: import('node:fs').Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return null
  }
  const exact = entries.find((e) => e.name === segment)
  if (exact) return exact.name
  const insensitive = entries.find(
    (e) => e.name.toLowerCase() === segment.toLowerCase(),
  )
  return insensitive?.name ?? null
}

/** Case-sensitively resolves `target` (an absolute, existing path) from / down, segment by segment. */
function caseSensitiveResolve(
  target: string,
): { ok: true } | { ok: false; reason: string } {
  const segments = relative('/', resolve(target)).split(sep).filter(Boolean)
  let cursor = '/'
  for (const seg of segments) {
    const real = findEntry(cursor, seg)
    if (!real) {
      return { ok: false, reason: `no entry named "${seg}" in ${cursor}` }
    }
    if (real !== seg) {
      return {
        ok: false,
        reason: `case mismatch: import says "${seg}", disk has "${real}" (in ${cursor})`,
      }
    }
    cursor = join(cursor, real)
  }
  return { ok: true }
}

function tryResolveWithExtensions(
  base: string,
): { ok: true } | { ok: false; reason: string } {
  for (const ext of RESOLVE_EXT) {
    const candidate = base + ext
    try {
      if (statSync(candidate).isFile()) return caseSensitiveResolve(candidate)
    } catch {}
  }
  try {
    if (statSync(base).isDirectory()) {
      for (const idx of ['index.ts', 'index.tsx', 'index.js', 'index.jsx']) {
        const candidate = join(base, idx)
        try {
          if (statSync(candidate).isFile())
            return caseSensitiveResolve(candidate)
        } catch {}
      }
    }
  } catch {}
  return {
    ok: false,
    reason:
      'no matching file (checked extensionless, .ts, .tsx, .js, .jsx, .mts, .cts, .json, and index.*)',
  }
}

/** Scans every source file under `root` and reports relative imports that would not resolve on a case-sensitive filesystem. */
export function checkImports(root: string): ImportProblem[] {
  const problems: ImportProblem[] = []

  walk(resolve(root), (file) => {
    const src = readFileSync(file, 'utf8')
    for (const spec of extractRelativeSpecifiers(file, src)) {
      let base = resolve(dirname(file), spec)
      let result = tryResolveWithExtensions(base)
      if (!result.ok && /\.(js|jsx|mjs|cjs)$/.test(spec)) {
        // NodeNext/Node16 ESM convention: a literal .js specifier may point
        // at a .ts source file. Retry with the compiled extension stripped.
        base = base.replace(/\.(js|jsx|mjs|cjs)$/, '')
        result = tryResolveWithExtensions(base)
      }
      if (!result.ok) {
        problems.push({
          file: relative(root, file),
          specifier: spec,
          reason: result.reason,
        })
      }
    }
  })

  return problems
}

if (import.meta.main) {
  const root = resolve(import.meta.dir, process.argv[2] ?? '..')
  const problems = checkImports(root)

  if (problems.length === 0) {
    console.log(
      `check-imports: no case-mismatched or unresolvable relative imports under ${root}`,
    )
  } else {
    console.error(
      `check-imports: ${problems.length} problem(s) under ${root}:\n`,
    )
    for (const p of problems) {
      console.error(`  ${p.file}: import "${p.specifier}" -> ${p.reason}`)
    }
    process.exit(1)
  }
}
