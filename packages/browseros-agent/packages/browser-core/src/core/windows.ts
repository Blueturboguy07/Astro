import type { WindowInfo } from '@browseros/cdp-protocol/domains/browser'
import type { CdpConnection } from './connection'

export type { WindowInfo }

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms))

/** Wraps BrowserOS window CDP commands for browser-core callers and tools. */
export class WindowManager {
  constructor(private readonly cdp: CdpConnection) {}

  async list(): Promise<WindowInfo[]> {
    await this.ensureConnected()
    const result = await this.cdp.Browser.getWindows()
    return result.windows as WindowInfo[]
  }

  /** `hidden`: a window that is never shown and never takes the focus
      (BrowserOS CDP), for work the person did not start, like a scheduled
      run. */
  async create(opts?: { hidden?: boolean; url?: string }): Promise<WindowInfo> {
    await this.ensureConnected()
    const result = await this.cdp.Browser.createWindow(
      opts?.hidden || opts?.url
        ? {
            ...(opts.hidden && { hidden: true }),
            ...(opts.url && { url: opts.url }),
          }
        : undefined,
    )
    return result.window as WindowInfo
  }

  async close(windowId: number): Promise<void> {
    await this.ensureConnected()
    await this.cdp.Browser.closeWindow({ windowId })
  }

  async activate(windowId: number): Promise<void> {
    await this.ensureConnected()
    await this.cdp.Browser.activateWindow({ windowId })
  }

  private async ensureConnected(): Promise<void> {
    if (this.cdp.isConnected()) return

    const deadline = Date.now() + 5000
    while (!this.cdp.isConnected() && Date.now() < deadline) {
      await delay(50)
    }
    if (!this.cdp.isConnected()) throw new Error('CDP not connected')
  }
}
