import { describe, expect, it } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cscArgs, parseArgs } from './astro-recut-win'
import {
  checkWinSparkleDll,
  checkWinSparkleLinks,
  peExportNames,
  peImportsFrom,
  sha256,
  WINSPARKLE_GLUE_IMPORTS,
  winSparkleIni,
} from './astro-winsparkle'

/* A minimal PE32+ file: one section at RVA 0x1000 holding the export
   directory and the (delay-load) import tables. */
function fakePe(opts: {
  exports?: string[]
  imports?: Record<string, string[]>
  delay?: Record<string, string[]>
}): Uint8Array {
  const base = 0x1000
  const sec: number[] = []
  const u32 = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]
  const u64 = (n: number) => [...u32(n), 0, 0, 0, 0]
  const put = (b: number[]) => {
    while (sec.length % 8) sec.push(0)
    const rva = base + sec.length
    sec.push(...b)
    return rva
  }
  const str = (s: string) => put([...Buffer.from(`${s}\0`, 'latin1')])
  const thunks = (names: string[]) => {
    const byName = names.map((n) => put([0, 0, ...Buffer.from(`${n}\0`, 'latin1')]))
    return put([...byName.flatMap(u64), ...u64(0)])
  }
  const dirs: Record<number, [number, number]> = {}
  if (opts.exports) {
    const names = opts.exports.map(str)
    const arr = put(names.flatMap(u32))
    const dir = put([...new Array(24).fill(0), ...u32(names.length), ...u32(0), ...u32(arr), ...u32(0)])
    dirs[0] = [dir, 40]
  }
  if (opts.imports) {
    const descs = Object.entries(opts.imports).map(([dll, names]) => {
      const n = str(dll)
      const t = thunks(names)
      return [...u32(t), ...u32(0), ...u32(0), ...u32(n), ...u32(t)]
    })
    dirs[1] = [put([...descs.flat(), ...new Array(20).fill(0)]), 20 * (descs.length + 1)]
  }
  if (opts.delay) {
    const descs = Object.entries(opts.delay).map(([dll, names]) => {
      const n = str(dll)
      const t = thunks(names)
      return [...u32(1), ...u32(n), ...u32(0), ...u32(t), ...u32(t), ...u32(0), ...u32(0), ...u32(0)]
    })
    dirs[13] = [put([...descs.flat(), ...new Array(32).fill(0)]), 32 * (descs.length + 1)]
  }
  const raw = 0x200
  const file = new Uint8Array(raw + sec.length)
  const v = new DataView(file.buffer)
  v.setUint16(0, 0x5a4d, true)
  v.setUint32(0x3c, 0x40, true)
  v.setUint32(0x40, 0x4550, true)
  v.setUint16(0x44, 0x8664, true)
  v.setUint16(0x46, 1, true)
  v.setUint16(0x54, 240, true)
  const opt = 0x58
  v.setUint16(opt, 0x20b, true)
  v.setUint32(opt + 108, 16, true)
  for (const [i, [rva, size]] of Object.entries(dirs)) {
    v.setUint32(opt + 112 + Number(i) * 8, rva, true)
    v.setUint32(opt + 116 + Number(i) * 8, size, true)
  }
  const s = opt + 240
  v.setUint32(s + 8, sec.length, true)
  v.setUint32(s + 12, base, true)
  v.setUint32(s + 16, sec.length, true)
  v.setUint32(s + 20, raw, true)
  file.set(sec, raw)
  return file
}

const glue = [...WINSPARKLE_GLUE_IMPORTS]

describe('PE reader', () => {
  it('lists export names', () => {
    expect(peExportNames(fakePe({ exports: ['a', 'win_sparkle_init'] }))).toEqual(['a', 'win_sparkle_init'])
  })

  it('finds imports in the normal and the delay-load tables, without case', () => {
    const pe = fakePe({ imports: { 'KERNEL32.dll': ['Sleep'] }, delay: { 'winsparkle.DLL': ['win_sparkle_init'] } })
    expect(peImportsFrom(pe, 'kernel32.dll')).toEqual(['Sleep'])
    expect(peImportsFrom(pe, 'WinSparkle.dll')).toEqual(['win_sparkle_init'])
    expect(peImportsFrom(pe, 'user32.dll')).toBeNull()
  })

  it('refuses a file that is not a 64-bit PE', () => {
    expect(() => peExportNames(new Uint8Array(512))).toThrow(/not a PE/)
  })
})

describe('checkWinSparkleLinks', () => {
  it("passes when the new DLL exports everything chrome.dll imports", () => {
    const chrome = fakePe({ delay: { 'WinSparkle.dll': glue } })
    const fork = fakePe({ exports: [...glue, 'win_sparkle_set_lang'] })
    expect(checkWinSparkleLinks(chrome, fork)).toHaveLength(18)
  })

  it('names what is missing', () => {
    const chrome = fakePe({ delay: { 'WinSparkle.dll': glue } })
    const fork = fakePe({ exports: glue.filter((n) => n !== 'win_sparkle_cleanup') })
    expect(() => checkWinSparkleLinks(chrome, fork)).toThrow(/win_sparkle_cleanup/)
  })

  it('refuses a chrome.dll that does not import WinSparkle', () => {
    expect(() => checkWinSparkleLinks(fakePe({ imports: { 'KERNEL32.dll': ['Sleep'] } }), fakePe({ exports: glue }))).toThrow(
      /does not import/,
    )
  })
})

describe('WinSparkle.ini and the pinned DLL', () => {
  it('turns on the silent install and pins this build as the version to beat', () => {
    const ini = winSparkleIni('0.2.91')
    expect(ini.split('\r\n')).toEqual([
      '[WinSparkle]',
      'SilentAutoInstall=1',
      'BuildVersion=10001.0.2.91',
      'AppName=Astro',
      'AppVersion=0.2.91',
      '',
    ])
    expect(() => winSparkleIni('0.2')).toThrow()
  })

  it('refuses any file but the pinned one', () => {
    const buf = new Uint8Array([1, 2, 3])
    expect(() => checkWinSparkleDll(buf, sha256(new Uint8Array([1, 2, 4])))).toThrow(/not the pinned/)
    expect(() => checkWinSparkleDll(buf, sha256(buf))).not.toThrow()
  })
})

describe('the re-cut options', () => {
  const base = ['--tree', 't', '--crx', 'c', '--server', 's', '--version', '0.0.101', '--app-version', '0.2.91']

  it('reads --winsparkle and --csc', () => {
    const o = parseArgs([...base, '--winsparkle', 'w.dll', '--csc', 'c.exe'])
    expect(o.winSparkle).toBe('w.dll')
    expect(o.csc).toBe('c.exe')
  })

  it('compiles the helper as a window program with the assemblies it uses', () => {
    const a = cscArgs('astro-restart.cs', 'out\\astro-restart.exe')
    expect(a).toContain('/target:winexe')
    expect(a).toContain('/out:out\\astro-restart.exe')
    expect(a).toContain('/r:System.Management.dll')
    expect(a.at(-1)).toBe('astro-restart.cs')
  })
})

describe('astro-win.nsi: per user, no admin rights', () => {
  const nsi = readFileSync(join(import.meta.dir, 'astro-win.nsi'), 'utf8')

  it('installs to %LOCALAPPDATA%\\Astro\\Application and never asks for admin rights itself', () => {
    expect(nsi).toContain('InstallDir "$LOCALAPPDATA\\Astro\\Application"')
    expect(nsi).toContain('RequestExecutionLevel user')
    expect(nsi).not.toMatch(/RequestExecutionLevel (admin|highest)/)
  })

  it('writes no machine-wide key (HKLM is only read, and removed for the old copy)', () => {
    expect(nsi).not.toMatch(/WriteReg\w+\s+HKLM/)
    expect(nsi).toMatch(/DeleteRegKey HKLM "\$\{UNINST_KEY\}"/)
  })

  it('leaves the folder it wrote, so that Stage can rename it', () => {
    const extract = nsi.slice(nsi.indexOf('Function ExtractTree'), nsi.indexOf('FunctionEnd', nsi.indexOf('Function ExtractTree')))
    expect(extract.trimEnd().endsWith('SetOutPath "${ROOT}"')).toBe(true)
  })

  it('refuses a package that is not newer, and stages under the swap lock', () => {
    expect(nsi).toContain('${VersionCompare} "${VERSION}" "$Installed" $0')
    expect(nsi).toContain('Local\\AstroUpdateSwap')
    expect(nsi).toContain('astro-staged.txt')
  })
})
