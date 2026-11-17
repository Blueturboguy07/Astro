/**
 * @license
 * Copyright 2025 BrowserOS
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
import { spawn } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

const exePath = process.argv[2]

if (!exePath) {
  console.error('Usage: bun scripts/patch-windows-exe.ts <path-to-exe>')
  process.exit(1)
}

if (!fs.existsSync(exePath)) {
  console.error(`Error: File not found: ${exePath}`)
  process.exit(1)
}

console.log(`Patching Windows executable: ${exePath}`)

const rceditPath = path.resolve(
  __dirname,
  '..',
  'third_party',
  'bin',
  'rcedit-x64.exe',
)

if (!fs.existsSync(rceditPath)) {
  console.error(`Error: rcedit binary not found at: ${rceditPath}`)
  process.exit(1)
}

/* Astro's names in Task Manager and the file properties (Astro 0.2.4 QA,
   Windows brand check O9-W-06 showed "BrowserOS Agent"). */
const metadata = {
  ProductName: 'Astro',
  FileDescription: 'Astro local server',
  CompanyName: 'publik',
  LegalCopyright:
    'Copyright (C) 2025 BrowserOS, (C) 2026 publik. AGPL-3.0-or-later',
  InternalName: 'browseros-server',
  OriginalFilename: path.basename(exePath),
}

const args = [exePath]
for (const [key, value] of Object.entries(metadata)) {
  args.push('--set-version-string', key, value)
}

const isWindows = process.platform === 'win32'
const command = isWindows ? rceditPath : 'wine'
const commandArgs = isWindows ? args : [rceditPath, ...args]

const spawnOptions = {
  env: { ...process.env, WINEDEBUG: '-all' },
  stdio: 'inherit' as const,
}

const child = spawn(command, commandArgs, spawnOptions)

child.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'ENOENT' && !isWindows) {
    console.error('\x1b[31mError: Wine is not installed\x1b[0m')
    console.error(
      '\x1b[31mInstall Wine with: brew install --cask wine-stable\x1b[0m',
    )
    process.exit(1)
  }
  console.error('Failed to patch Windows executable:', error)
  process.exit(1)
})

child.on('exit', (code) => {
  if (code === 0) {
    console.log('✓ Successfully patched Windows executable metadata')
    process.exit(0)
  } else {
    console.error(`rcedit exited with code ${code}`)
    process.exit(code || 1)
  }
})
