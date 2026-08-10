import { afterEach, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { checkImports } from './check-imports'

let dir: string | undefined

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = undefined
})

function file(root: string, relPath: string, contents: string) {
  const full = join(root, relPath)
  mkdirSync(join(full, '..'), { recursive: true })
  writeFileSync(full, contents)
}

describe('checkImports', () => {
  test('reports nothing for a clean tree', () => {
    dir = mkdtempSync(join(tmpdir(), 'check-imports-'))
    file(dir, 'lib/db.ts', 'export default 1\n')
    file(dir, 'routes/chats/route.ts', "import db from '../../lib/db'\n")

    expect(checkImports(dir)).toEqual([])
  })

  // Regression test for apps/server/src/api/routes/simplicity/chats/route.ts,
  // which imported a module that had never been created.
  test('reports a relative import with no matching file at all', () => {
    dir = mkdtempSync(join(tmpdir(), 'check-imports-'))
    file(
      dir,
      'routes/chats/route.ts',
      "import db from '../../lib/simplicity/db'\n",
    )

    const problems = checkImports(dir)
    expect(problems).toHaveLength(1)
    expect(problems[0].specifier).toBe('../../lib/simplicity/db')
    expect(problems[0].reason).toContain('no matching file')
  })

  test('reports a case mismatch that would only resolve on a case-insensitive filesystem', () => {
    dir = mkdtempSync(join(tmpdir(), 'check-imports-'))
    file(dir, 'lib/simplicity/Db.ts', 'export default 1\n')
    file(
      dir,
      'routes/chats/route.ts',
      "import db from '../../lib/simplicity/db'\n",
    )

    const problems = checkImports(dir)
    expect(problems).toHaveLength(1)
    expect(problems[0].reason).toContain('case mismatch')
    expect(problems[0].reason).toContain('"db.ts"')
    expect(problems[0].reason).toContain('"Db.ts"')
  })

  test('reports a relative-depth mismatch that lands on the wrong existing directory', () => {
    dir = mkdtempSync(join(tmpdir(), 'check-imports-'))
    file(dir, 'lib/db.ts', 'export default 1\n')
    // Only two levels deep, but the import climbs three — this still lands
    // inside the tree (on a parent that happens to exist), which is exactly
    // the class of bug a plain "file exists" check misses.
    file(dir, 'a/routes/route.ts', "import db from '../../../lib/db'\n")

    const problems = checkImports(dir)
    expect(problems).toHaveLength(1)
    expect(problems[0].specifier).toBe('../../../lib/db')
  })

  test('does not flag a literal .js specifier that resolves to a sibling .ts file (NodeNext convention)', () => {
    dir = mkdtempSync(join(tmpdir(), 'check-imports-'))
    file(dir, 'models/common.ts', 'export default 1\n')
    file(dir, 'index.ts', "export * from './models/common.js'\n")

    expect(checkImports(dir)).toEqual([])
  })

  test('does not flag import-like text inside string or template literals', () => {
    dir = mkdtempSync(join(tmpdir(), 'check-imports-'))
    file(
      dir,
      'codegen.ts',
      [
        "const line = `export * from './does-not-exist.js'`",
        "const other = target === '../also-does-not-exist.js' ? 1 : 2",
        'export { line, other }',
        '',
      ].join('\n'),
    )

    expect(checkImports(dir)).toEqual([])
  })

  test('resolves a directory import against its index file', () => {
    dir = mkdtempSync(join(tmpdir(), 'check-imports-'))
    file(dir, 'lib/db/index.ts', 'export default 1\n')
    file(dir, 'routes/route.ts', "import db from '../lib/db'\n")

    expect(checkImports(dir)).toEqual([])
  })
})
