import { describe, expect, it } from 'bun:test'
import {
  downloadPython,
  PBS_PINNED_PYTHON,
  PBS_PINNED_TAG,
  pinnedPythonURL,
} from '../../../src/lib/searxng/python-source'

const TRIPLE = 'x86_64-pc-windows-msvc'

describe('pinnedPythonURL', () => {
  it('points at a fixed github.com release file, not api.github.com', () => {
    const url = new URL(pinnedPythonURL(TRIPLE))
    expect(url.hostname).toBe('github.com')
    expect(url.pathname).toContain(`/releases/download/${PBS_PINNED_TAG}/`)
    expect(decodeURIComponent(url.pathname)).toEndWith(
      `cpython-${PBS_PINNED_PYTHON}+${PBS_PINNED_TAG}-${TRIPLE}-install_only.tar.gz`,
    )
  })

  it('names the target triple', () => {
    for (const t of [
      'aarch64-apple-darwin',
      'x86_64-apple-darwin',
      'x86_64-unknown-linux-gnu',
    ]) {
      expect(decodeURIComponent(pinnedPythonURL(t))).toContain(`-${t}-`)
    }
  })
})

describe('downloadPython', () => {
  it('uses the pinned file and never asks the API when it downloads', async () => {
    const got: string[] = []
    let asked = 0
    const used = await downloadPython(
      TRIPLE,
      async (u) => {
        got.push(u)
      },
      async () => {
        asked++
        return 'https://example.invalid/latest.tar.gz'
      },
    )
    expect(used).toBe(pinnedPythonURL(TRIPLE))
    expect(got).toEqual([pinnedPythonURL(TRIPLE)])
    expect(asked).toBe(0)
  })

  it('falls back to the latest release when the pinned file fails', async () => {
    const got: string[] = []
    const reasons: string[] = []
    const used = await downloadPython(
      TRIPLE,
      async (u) => {
        got.push(u)
        if (u === pinnedPythonURL(TRIPLE)) throw new Error('HTTP 404')
      },
      async () => 'https://example.invalid/latest.tar.gz',
      (r) => reasons.push(r),
    )
    expect(used).toBe('https://example.invalid/latest.tar.gz')
    expect(got.length).toBe(2)
    expect(reasons).toEqual(['HTTP 404'])
  })

  it('shows the pinned error when the API also fails (HTTP 403)', async () => {
    await expect(
      downloadPython(
        TRIPLE,
        async () => {
          throw new Error(
            'the download of the Python runtime failed (HTTP 404)',
          )
        },
        async () => {
          throw new Error('could not reach python-build-standalone (HTTP 403)')
        },
      ),
    ).rejects.toThrow('HTTP 404')
  })
})
