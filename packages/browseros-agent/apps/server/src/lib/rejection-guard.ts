/**
 * Bun ends the process with code 1 on an unhandled promise rejection. One
 * stray rejection (a client that went away in the middle of a stream) took
 * down the whole local server, and with it every Astro feature, four times
 * in one QA session (Astro 0.2.4 QA, F-060). Log it and keep running.
 */
export function installRejectionGuard(
  report: (reason: unknown) => void,
): () => void {
  const onRejection = (reason: unknown) => {
    try {
      report(reason)
    } catch {}
  }
  process.on('unhandledRejection', onRejection)
  return () => {
    process.off('unhandledRejection', onRejection)
  }
}
