import { describe, expect, it } from 'bun:test'
import {
  closeScheduledRun,
  openScheduledRunPage,
  type ScheduledRunBrowser,
} from '../../src/api/services/scheduled-run-window'

/* Astro 0.2.4 QA, F-084: a scheduled run opened its tabs in the person's
   focused window and could leave a tab behind. */

function fakeBrowser(opts: { hiddenFails?: boolean } = {}) {
  const calls: string[] = []
  const browser: ScheduledRunBrowser = {
    newHiddenWindow: async () => {
      calls.push('newHiddenWindow')
      if (opts.hiddenFails) throw new Error('unknown param hidden')
      return 77
    },
    newPage: async (url, o) => {
      calls.push(`newPage ${url} bg=${o?.background} win=${o?.windowId}`)
      return 5
    },
    listPages: async () => [{ pageId: 5, windowId: 1 }],
    closeWindow: async (id) => {
      calls.push(`closeWindow ${id}`)
    },
    closePage: async (id) => {
      calls.push(`closePage ${id}`)
    },
  }
  return { browser, calls }
}

describe('scheduled run window', () => {
  it('works in a hidden window and closes the whole window at the end', async () => {
    const { browser, calls } = fakeBrowser()
    const run = await openScheduledRunPage(browser, 'c1')
    expect(run).toEqual({ pageId: 5, windowId: 77, hiddenWindowId: 77 })
    await closeScheduledRun(browser, run, 'c1')
    expect(calls).toEqual([
      'newHiddenWindow',
      'newPage about:blank bg=true win=77',
      'closeWindow 77',
    ])
  })

  it('falls back to a background tab when no hidden window can be made', async () => {
    const { browser, calls } = fakeBrowser({ hiddenFails: true })
    const run = await openScheduledRunPage(browser, 'c2')
    expect(run).toEqual({ pageId: 5, windowId: 1 })
    await closeScheduledRun(browser, run, 'c2')
    expect(calls).toEqual([
      'newHiddenWindow',
      'newPage about:blank bg=true win=undefined',
      'closePage 5',
    ])
  })

  it('a close failure is logged, not thrown', async () => {
    const { browser } = fakeBrowser()
    browser.closeWindow = async () => {
      throw new Error('gone')
    }
    await expect(
      closeScheduledRun(browser, { hiddenWindowId: 77 }, 'c3'),
    ).resolves.toBeUndefined()
  })
})
