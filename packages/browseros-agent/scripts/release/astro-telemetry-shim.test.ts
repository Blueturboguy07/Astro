import { describe, expect, it } from 'bun:test'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import {
  installShim,
  isShim,
  macServerBinDir,
  parseArgs,
  SHIM_MARKER,
  validateAppVersion,
  winServerBinDir,
} from './astro-telemetry-shim'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'astro-shim-test-'))

const fakeShim = (dir: string, body = 'new') => {
  const file = path.join(dir, 'shim-build')
  fs.writeFileSync(file, `\0\0${SHIM_MARKER}\0${body}`)
  return file
}

describe('installShim', () => {
  it('moves the real server aside and takes its name', () => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'browseros_server'), 'REAL SERVER')
    const result = installShim({ binDir: dir, shim: fakeShim(dir), exe: '' })
    expect(result.action).toBe('installed')
    expect(fs.readFileSync(result.real, 'utf8')).toBe('REAL SERVER')
    expect(isShim(result.server)).toBe(true)
    expect(fs.statSync(result.server).mode & 0o111).not.toBe(0)
  })

  it('replaces an older launcher and keeps the real server', () => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'browseros_server.exe'), 'REAL SERVER')
    installShim({ binDir: dir, shim: fakeShim(dir, 'old'), exe: '.exe' })
    const result = installShim({
      binDir: dir,
      shim: fakeShim(dir, 'new'),
      exe: '.exe',
    })
    expect(result.action).toBe('replaced')
    expect(fs.readFileSync(result.real, 'utf8')).toBe('REAL SERVER')
    expect(fs.readFileSync(result.server, 'utf8').endsWith('new')).toBe(true)
  })

  it('refuses a launcher whose real server is gone', () => {
    const dir = tmp()
    fs.copyFileSync(fakeShim(dir), path.join(dir, 'browseros_server'))
    expect(() =>
      installShim({ binDir: dir, shim: fakeShim(dir), exe: '' }),
    ).toThrow(/real server is gone/)
  })

  it('refuses to overwrite a server when a real server already sits next to it', () => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'browseros_server'), 'A SERVER')
    fs.writeFileSync(path.join(dir, 'browseros_server_real'), 'REAL SERVER')
    expect(() =>
      installShim({ binDir: dir, shim: fakeShim(dir), exe: '' }),
    ).toThrow(/refusing to overwrite/)
  })

  it('refuses a file that is not the launcher', () => {
    const dir = tmp()
    fs.writeFileSync(path.join(dir, 'browseros_server'), 'REAL SERVER')
    fs.writeFileSync(path.join(dir, 'not-a-shim'), 'something else')
    expect(() =>
      installShim({
        binDir: dir,
        shim: path.join(dir, 'not-a-shim'),
        exe: '',
      }),
    ).toThrow(/Not an astro-telemetry-shim binary/)
  })
})

describe('bundle paths', () => {
  it('finds the server folder in a mac bundle', () => {
    expect(macServerBinDir('/x/Astro.app')).toBe(
      path.join(
        '/x/Astro.app/Contents/Resources/BrowserOSServer/default/resources/bin',
      ),
    )
  })

  it('finds the server folder under the one versioned dir of a Windows tree', () => {
    const tree = tmp()
    fs.mkdirSync(path.join(tree, '151.0.8162.137'))
    fs.mkdirSync(path.join(tree, 'Dictionaries'))
    expect(winServerBinDir(tree)).toBe(
      path.join(
        tree,
        '151.0.8162.137',
        'BrowserOSServer',
        'default',
        'resources',
        'bin',
      ),
    )
    fs.mkdirSync(path.join(tree, '152.0.1.2'))
    expect(() => winServerBinDir(tree)).toThrow(/exactly one versioned dir/)
  })
})

describe('arguments', () => {
  it('takes exactly one of --app and --tree', () => {
    expect(() => parseArgs(['--shim', 's'])).toThrow(/Usage/)
    expect(() =>
      parseArgs(['--app', 'a', '--tree', 't', '--shim', 's']),
    ).toThrow(/Usage/)
    expect(parseArgs(['--tree', 't', '--shim', 's']).tree).toBe('t')
    const mac = parseArgs([
      '--app',
      'a',
      '--shim',
      's',
      '--app-version',
      '0.2.2',
      '--sign',
    ])
    expect(mac.sign).toBe(true)
    expect(mac.appVersion).toBe('0.2.2')
  })

  it('accepts only a dotted-integer app version', () => {
    expect(validateAppVersion('0.2.2')).toBe('0.2.2')
    expect(() => validateAppVersion('v0.2.2')).toThrow()
    expect(() => validateAppVersion('0.2.2-beta')).toThrow()
  })
})
