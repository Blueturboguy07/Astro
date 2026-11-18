/* The Python runtime for local search comes from a pinned
   python-build-standalone release on github.com. Asking the unauthenticated
   api.github.com "releases/latest" first failed with HTTP 403 for people on a
   shared address (60 calls per hour per IP), and setup stopped (F-093). The
   API is now only a fallback for when the pinned file is gone. */
export const PBS_PINNED_TAG = '20250712'
export const PBS_PINNED_PYTHON = '3.12.11'

const PBS_DOWNLOAD_BASE =
  'https://github.com/astral-sh/python-build-standalone/releases/download'

export function pinnedPythonURL(triple: string): string {
  const name = `cpython-${PBS_PINNED_PYTHON}+${PBS_PINNED_TAG}-${triple}-install_only.tar.gz`
  return `${PBS_DOWNLOAD_BASE}/${PBS_PINNED_TAG}/${encodeURIComponent(name)}`
}

/* Downloads the pinned build; when that fails, asks for the latest release
   and downloads that. If the fallback cannot even be resolved, the pinned
   error is the one the person sees. Returns the URL that worked. */
export async function downloadPython(
  triple: string,
  get: (url: string) => Promise<void>,
  resolveLatest: () => Promise<string>,
  onFallback?: (reason: string) => void,
): Promise<string> {
  const pinned = pinnedPythonURL(triple)
  try {
    await get(pinned)
    return pinned
  } catch (pinnedErr) {
    onFallback?.(
      pinnedErr instanceof Error ? pinnedErr.message : String(pinnedErr),
    )
    let latest: string
    try {
      latest = await resolveLatest()
    } catch {
      throw pinnedErr
    }
    if (latest === pinned) throw pinnedErr
    await get(latest)
    return latest
  }
}
