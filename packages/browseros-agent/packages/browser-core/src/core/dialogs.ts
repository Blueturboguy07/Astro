import type { ProtocolApi } from '@browseros/cdp-protocol/protocol-api'

/**
 * JavaScript dialogs (alert, confirm, prompt, beforeunload) on pages the
 * agent works on. While a dialog is open the page is frozen: a click that
 * opened it never returned (120 s tool timeout), every later tool call
 * failed, and the tab stayed blocked (Astro 0.2.4 QA, F-067).
 *
 * While the agent acts (a tool call runs, or ran in the last `graceMs`),
 * a dialog is answered at once: with the answer the agent set in advance
 * (act kind=dialog), else OK (prompt: its default text). Each answer is
 * reported in the next tool result. Outside agent activity a dialog is
 * left for the person; the next tool call answers it first.
 */
export type DialogAnswer = { accept: boolean; promptText?: string }

export interface DialogRecord {
  pageId: number
  type: string
  message: string
  accept: boolean
  promptText?: string
  preset: boolean
}

type OpenDialog = {
  session: ProtocolApi
  type: string
  message: string
  defaultPrompt?: string
}

export class DialogGuard {
  private readonly open = new Map<number, OpenDialog>()
  private readonly presets = new Map<number, DialogAnswer>()
  private records: DialogRecord[] = []
  private running = 0
  private activeUntil = 0

  constructor(
    private readonly graceMs = 30_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Follows the dialogs of one attached page session. */
  watch(session: ProtocolApi, pageId: number): void {
    session.Page.on('javascriptDialogOpening', (e) => {
      this.open.set(pageId, {
        session,
        type: e.type,
        message: e.message,
        defaultPrompt: e.defaultPrompt,
      })
      if (this.active()) void this.answer(pageId)
    })
    session.Page.on('javascriptDialogClosed', () => {
      this.open.delete(pageId)
    })
  }

  /** A tool call starts. Answers dialogs left open unless `answerOpen` is false. */
  begin(opts: { answerOpen?: boolean } = {}): () => void {
    this.running++
    if (opts.answerOpen !== false) {
      for (const pageId of [...this.open.keys()]) void this.answer(pageId)
    }
    let ended = false
    return () => {
      if (ended) return
      ended = true
      this.running--
      this.activeUntil = this.now() + this.graceMs
    }
  }

  /** The answer for the next dialog on `pageId`; answers an open one now. */
  async preset(pageId: number, answer: DialogAnswer): Promise<boolean> {
    this.presets.set(pageId, answer)
    if (!this.open.has(pageId)) return false
    await this.answer(pageId)
    return true
  }

  isOpen(pageId: number): boolean {
    return this.open.has(pageId)
  }

  /** Answers given since the last call, oldest first. */
  takeRecords(): DialogRecord[] {
    const out = this.records
    this.records = []
    return out
  }

  private active(): boolean {
    return this.running > 0 || this.now() < this.activeUntil
  }

  private async answer(pageId: number): Promise<void> {
    const dialog = this.open.get(pageId)
    if (!dialog) return
    this.open.delete(pageId)
    const preset = this.presets.get(pageId)
    this.presets.delete(pageId)
    const accept = preset?.accept ?? true
    const promptText =
      dialog.type === 'prompt'
        ? (preset?.promptText ?? dialog.defaultPrompt ?? '')
        : undefined
    /* Recorded first: the action the dialog blocked can finish before
       the answer's own reply arrives, and its result must report it. */
    const record: DialogRecord = {
      pageId,
      type: dialog.type,
      message: dialog.message,
      accept,
      ...(promptText !== undefined && { promptText }),
      preset: !!preset,
    }
    this.records.push(record)
    try {
      await dialog.session.Page.handleJavaScriptDialog({
        accept,
        ...(promptText !== undefined && { promptText }),
      })
    } catch {
      /* Already closed by the page or the person. */
      this.records = this.records.filter((r) => r !== record)
    }
  }
}

/** One line per answered dialog, for the tool result. */
export function describeDialogs(records: DialogRecord[]): string {
  return records
    .map((r) => {
      const answer = r.accept
        ? r.type === 'prompt'
          ? `OK with the text ${JSON.stringify(r.promptText ?? '')}`
          : 'OK'
        : 'Cancel'
      const how = r.preset ? 'as you set' : 'automatically'
      return `Page ${r.pageId} showed a ${r.type} dialog ${JSON.stringify(r.message)}; Astro answered ${answer} ${how}. To answer the next one differently, call act kind=dialog (accept, text) before the action that opens it.`
    })
    .join('\n')
}
