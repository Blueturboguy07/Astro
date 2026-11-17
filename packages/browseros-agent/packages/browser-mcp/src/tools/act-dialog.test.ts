import { describe, expect, it } from 'bun:test'
import { DialogGuard } from '@browseros/browser-core/core/dialogs'
import type { BrowserSession } from '@browseros/browser-core/core/session'
import type { ProtocolApi } from '@browseros/cdp-protocol/protocol-api'
import { act } from './act'
import { executeTool } from './framework'

/* F-067 (Astro 0.2.4 QA): a click that opened a JS alert never returned
   (the page is frozen until the dialog closes), and every later tool call
   failed. The click below blocks like CDP does until the dialog is
   answered. */
function frozenPage() {
  const dialogs = new DialogGuard()
  const handlers = new Map<string, (e: unknown) => void>()
  let unfreeze: () => void = () => {}
  const answers: unknown[] = []
  const cdp = {
    Page: {
      on: (event: string, h: (e: unknown) => void) => {
        handlers.set(event, h)
        return () => {}
      },
      handleJavaScriptDialog: async (p: unknown) => {
        answers.push(p)
        handlers.get('javascriptDialogClosed')?.({})
        unfreeze()
      },
    },
  } as unknown as ProtocolApi
  dialogs.watch(cdp, 1)
  const session = {
    dialogs,
    input: () => ({
      click: () =>
        new Promise<void>((resolve) => {
          unfreeze = resolve
          handlers.get('javascriptDialogOpening')?.({
            type: 'alert',
            message: 'Product added.',
            url: 'https://shop.test',
            frameId: 'f',
            hasBrowserHandler: true,
          })
        }),
    }),
    pages: { getTabId: () => undefined },
  } as unknown as BrowserSession
  return { session, answers }
}

const textOf = (r: { content?: { type: string; text?: string }[] }) =>
  (r.content ?? []).map((c) => c.text ?? '').join('\n')

describe('act and JavaScript dialogs', () => {
  it('a click that opens an alert returns and reports the dialog', async () => {
    const { session, answers } = frozenPage()
    const result = await Promise.race([
      executeTool(act, { page: 1, kind: 'click', ref: 'e1' }, { session }),
      new Promise<null>((r) => setTimeout(() => r(null), 2000)),
    ])
    expect(result).not.toBeNull()
    expect(answers).toEqual([{ accept: true }])
    expect(textOf(result as never)).toContain(
      'Page 1 showed a alert dialog "Product added."; Astro answered OK automatically',
    )
  })

  it('kind=dialog sets the answer for the next dialog', async () => {
    const { session } = frozenPage()
    const result = await executeTool(
      act,
      { page: 1, kind: 'dialog', accept: false },
      { session },
    )
    expect(textOf(result as never)).toContain(
      'The next dialog on page 1 will be answered Cancel.',
    )
  })
})
