import { describe, expect, it } from 'bun:test'
import type { ProtocolApi } from '@browseros/cdp-protocol/protocol-api'
import { DialogGuard, describeDialogs } from './dialogs'

/* F-067 (Astro 0.2.4 QA): a JS alert/prompt froze the page and blocked
   every browser tool. */
function fakePage() {
  const handlers = new Map<string, (e: unknown) => void>()
  const answers: unknown[] = []
  const session = {
    Page: {
      on: (event: string, h: (e: unknown) => void) => {
        handlers.set(event, h)
        return () => handlers.delete(event)
      },
      handleJavaScriptDialog: async (p: unknown) => {
        answers.push(p)
        handlers.get('javascriptDialogClosed')?.({})
      },
    },
  } as unknown as ProtocolApi
  const openDialog = (type: string, message: string, defaultPrompt?: string) =>
    handlers.get('javascriptDialogOpening')?.({
      type,
      message,
      defaultPrompt,
      url: 'https://shop.test',
      frameId: 'f',
      hasBrowserHandler: true,
    })
  return { session, answers, openDialog }
}

const tick = () => new Promise((r) => setTimeout(r, 0))

describe('DialogGuard', () => {
  it('answers an alert at once while a tool call runs, and reports it', async () => {
    const g = new DialogGuard()
    const p = fakePage()
    g.watch(p.session, 3)
    const end = g.begin()
    p.openDialog('alert', 'Product added.')
    await tick()
    end()
    expect(p.answers).toEqual([{ accept: true }])
    expect(g.isOpen(3)).toBe(false)
    const text = describeDialogs(g.takeRecords())
    expect(text).toContain('Page 3 showed a alert dialog "Product added."')
    expect(text).toContain('answered OK automatically')
    expect(g.takeRecords()).toEqual([])
  })

  it('answers a prompt with its default text, or with the preset answer', async () => {
    const g = new DialogGuard()
    const p = fakePage()
    g.watch(p.session, 1)
    const end = g.begin()
    p.openDialog('prompt', 'Your name?', 'guest')
    await tick()
    await g.preset(1, { accept: true, promptText: 'Ada' })
    p.openDialog('prompt', 'Your name?', 'guest')
    await tick()
    await g.preset(1, { accept: false })
    p.openDialog('confirm', 'Delete?')
    await tick()
    end()
    expect(p.answers).toEqual([
      { accept: true, promptText: 'guest' },
      { accept: true, promptText: 'Ada' },
      { accept: false },
    ])
  })

  it('leaves a dialog for the person outside agent activity, then answers it at the next tool call', async () => {
    let t = 0
    const g = new DialogGuard(30_000, () => t)
    const p = fakePage()
    g.watch(p.session, 2)
    g.begin()()
    t = 60_000
    p.openDialog('alert', 'Saved')
    await tick()
    expect(p.answers).toEqual([])
    expect(g.isOpen(2)).toBe(true)
    const end = g.begin()
    await tick()
    end()
    expect(p.answers).toEqual([{ accept: true }])
  })

  it('answers an open dialog with the preset when act kind=dialog comes first', async () => {
    let t = 100_000
    const g = new DialogGuard(30_000, () => t)
    const p = fakePage()
    g.watch(p.session, 4)
    p.openDialog('prompt', 'Code?')
    const end = g.begin({ answerOpen: false })
    expect(await g.preset(4, { accept: true, promptText: '1234' })).toBe(true)
    end()
    t += 1
    expect(p.answers).toEqual([{ accept: true, promptText: '1234' }])
  })
})
