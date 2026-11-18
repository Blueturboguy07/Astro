import { sendServerMessage } from '@/lib/messaging/server/serverMessages'

const HEALTH_CHECK_TIMEOUT_MS = 60_000
const HEALTH_CHECK_INTERVAL_MS = 2_000

async function checkServerHealth(): Promise<boolean> {
  try {
    const result = await sendServerMessage('checkHealth', undefined)
    return result.healthy
  } catch {
    return false
  }
}

/**
 * Poll the local health endpoint until the server responds or the timeout
 * elapses. checkHealth resolves its URL from the live proxy_port pref, so this
 * automatically targets whatever port the server is (re)binding to.
 */
export async function waitForServerHealth(
  check: () => Promise<boolean> = checkServerHealth,
  timeoutMs = HEALTH_CHECK_TIMEOUT_MS,
  intervalMs = HEALTH_CHECK_INTERVAL_MS,
): Promise<boolean> {
  const startTime = Date.now()
  /* One probe may never answer while the server restarts (the message to
     the background has no deadline); cap it so the overall time-out holds
     and Save is enabled again. */
  const probe = () =>
    Promise.race([
      check().catch(() => false),
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(false), intervalMs * 2),
      ),
    ])
  return new Promise((resolve) => {
    const tick = async () => {
      if (Date.now() - startTime >= timeoutMs) {
        resolve(false)
        return
      }
      if (await probe()) {
        resolve(true)
        return
      }
      setTimeout(tick, intervalMs)
    }
    setTimeout(tick, intervalMs)
  })
}
