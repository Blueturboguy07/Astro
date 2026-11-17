import { logger } from '../../lib/logger'

/* A scheduled run works in a hidden window (Astro 0.2.4 QA, F-084): its tabs
   never open in, or take the focus from, the person's windows, and closing
   the window at the end closes every tab the run opened. A browser that
   cannot make a hidden window gets the old background tab. */

export interface ScheduledRunBrowser {
  newHiddenWindow(): Promise<number>
  newPage(
    url: string,
    opts?: { background?: boolean; windowId?: number },
  ): Promise<number>
  listPages(): Promise<{ pageId: number; windowId?: number }[]>
  closeWindow(windowId: number): Promise<void>
  closePage(pageId: number): Promise<void>
}

export interface ScheduledRunPage {
  pageId: number
  /** The window new tabs of the run open in. */
  windowId?: number
  /** Set when the run owns a hidden window: closing it ends the run. */
  hiddenWindowId?: number
}

export async function openScheduledRunPage(
  browser: ScheduledRunBrowser,
  conversationId: string,
): Promise<ScheduledRunPage> {
  let hiddenWindowId: number | undefined
  try {
    hiddenWindowId = await browser.newHiddenWindow()
  } catch (error) {
    logger.warn('No hidden window for the scheduled run; using a tab', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    })
  }
  if (hiddenWindowId !== undefined) {
    try {
      const pageId = await browser.newPage('about:blank', {
        background: true,
        windowId: hiddenWindowId,
      })
      return { pageId, windowId: hiddenWindowId, hiddenWindowId }
    } catch (error) {
      await browser.closeWindow(hiddenWindowId).catch(() => {})
      throw error
    }
  }
  const pageId = await browser.newPage('about:blank', { background: true })
  const windowId = (await browser.listPages().catch(() => [])).find(
    (page) => page.pageId === pageId,
  )?.windowId
  return { pageId, windowId }
}

/** Ends the run: its hidden window with every tab in it, else its own tab. */
export async function closeScheduledRun(
  browser: ScheduledRunBrowser,
  run: { pageId?: number; hiddenWindowId?: number },
  conversationId: string,
): Promise<void> {
  try {
    if (run.hiddenWindowId !== undefined) {
      await browser.closeWindow(run.hiddenWindowId)
    } else if (run.pageId !== undefined) {
      await browser.closePage(run.pageId)
    }
  } catch (error) {
    logger.warn('Failed to close the scheduled run', {
      conversationId,
      ...run,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
